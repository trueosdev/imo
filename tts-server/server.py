#!/usr/bin/env python3
"""
HTTP wrapper for https://github.com/rany2/edge-tts (Microsoft Edge neural TTS).
Serve from the repo root:

  cd tts-server && pip install -r requirements.txt && python server.py

Or: npm run tts

Default voice: Japanese neural (Nanami). Override with IMO_TTS_VOICE.
"""
from __future__ import annotations

import io
import os
import asyncio

import edge_tts
import uvicorn
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

DEFAULT_VOICE = "ja-JP-NanamiNeural"
HOST = os.environ.get("IMO_TTS_HOST", "127.0.0.1")
PORT = int(os.environ.get("IMO_TTS_PORT", "8787"))
VOICE = os.environ.get("IMO_TTS_VOICE", DEFAULT_VOICE)


app = FastAPI(title="imo edge-tts bridge")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("IMO_TTS_CORS", "*").split(","),
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)


async def _synthesize_mp3(text: str) -> bytes:
    communicate = edge_tts.Communicate(text, VOICE)
    buf = io.BytesIO()
    async for chunk in communicate.stream():
        if isinstance(chunk, dict) and chunk.get("type") == "audio":
            buf.write(chunk["data"])
    out = buf.getvalue()
    if not out:
        raise HTTPException(status_code=502, detail="No audio returned from Edge TTS")
    return out


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "voice": VOICE, "edge_tts": "rany2/edge-tts"}


@app.get("/tts")
async def tts(
    text: str = Query(..., min_length=1, max_length=500),
) -> Response:
    try:
        audio = await _synthesize_mp3(text.strip())
        return Response(content=audio, media_type="audio/mpeg")
    except HTTPException:
        raise
    except asyncio.CancelledError:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


def main() -> None:
    print(f"imo edge-tts bridge at http://{HOST}:{PORT}  (voice={VOICE})", flush=True)
    uvicorn.run(app, host=HOST, port=PORT, reload=False)


if __name__ == "__main__":
    main()
