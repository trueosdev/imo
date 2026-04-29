"""Neural pronunciation for the static app (same-origin `/api/tts`). Deployed via Vercel Python serverless."""

from __future__ import annotations

import asyncio
import io
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

VOICE = os.environ.get("IMO_TTS_VOICE", "ja-JP-NanamiNeural")


async def _synthesize_mp3(text: str) -> bytes:
    import edge_tts

    communicate = edge_tts.Communicate(text, VOICE)
    buf = io.BytesIO()
    async for chunk in communicate.stream():
        if isinstance(chunk, dict) and chunk.get("type") == "audio":
            buf.write(chunk["data"])
    out = buf.getvalue()
    if not out:
        raise RuntimeError("Empty audio stream from Edge TTS")
    return out


class handler(BaseHTTPRequestHandler):
    """Vercel serverless expects a subclass named `handler` for Python."""

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path_clean = parsed.path.rstrip("/")
        if path_clean != "/api/tts":
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Not found")
            return

        qs = parse_qs(parsed.query)
        text_raw = qs.get("text", [""])[0]
        text = (text_raw or "").strip()
        if not text:
            self.send_response(400)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"missing text")
            return
        if len(text) > 500:
            self.send_response(413)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"text too long")
            return

        try:
            audio = asyncio.run(_synthesize_mp3(text))
        except Exception as e:
            msg = str(e).encode("utf-8")[:2048]
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(msg)
            return

        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        self.wfile.write(audio)

    def log_message(self, *_args):  # noqa: ANN001
        return

