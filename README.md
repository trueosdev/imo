# Japanese Vocab Studio

A single-page Japanese vocabulary trainer with flashcards, multiple-choice
quiz, romaji toggle, search, shuffle, native TTS pronunciation, dark/light
mode, keyboard shortcuts, and offline progress saved to `localStorage`.

## Run it

Just open `index.html` in any modern browser — no build step, no server.

```
open www/index.html       # macOS
xdg-open www/index.html   # Linux
start www\index.html      # Windows
```

If you'd rather run it from a local server (optional):

```
python3 -m http.server 8000
# then visit http://localhost:8000
```

### Neural pronunciation (Microsoft Edge TTS via [rany2/edge-tts](https://github.com/rany2/edge-tts))

The static app uses browser `speechSynthesis` by default. For sharper Japanese neural voices, run the bundled Python bridge, then tell the web app where it lives:

1. Install deps once:

   ```
   cd tts-server && pip install -r requirements.txt
   ```

2. **`www/index.html`** already sets `window.__IMO_EDGE_TTS_BASE` to `http://127.0.0.1:8787` **only when** the hostname is `localhost`, `127.0.0.1`, or `::1`. You can override with DevTools Console or your own snippet when needed.

3. From the repo root, serve the web app **and** the local TTS bridge together:

   ```
   npm run dev
   ```

   Visit `http://localhost:5173`. The pronunciation buttons use `/tts` (MP3) when the bridge is reachable, and fall back to `speechSynthesis` if not.

Alternatively run `npm run web` and `npm run tts` in two terminals.

Optional environment variables for `tts-server/server.py`: `IMO_TTS_PORT`, `IMO_TTS_HOST`, `IMO_TTS_VOICE` (example: `ja-JP-NanamiNeural` or `ja-JP-KeitaNeural`), `IMO_TTS_CORS` (comma-separated origins).

**Note:** The bridge calls Microsoft’s undocumented Edge-read-aloud service; availability can change.

### Production (learnimo.vercel.app)

The live site is **[https://learnimo.vercel.app](https://learnimo.vercel.app)**.

Browser `speechSynthesis` still works as a fallback everywhere.

**Neural Edge TTS** is **`GET /api/tts?text=…`** (MP3) via **Vercel’s Python runtime** (`api/tts.py`, `api/requirements.txt`). On HTTPS with a non-loopback hostname (including `*.vercel.app`), the SPA uses **`[origin]/api/tts`** automatically.

**Do not** ship `window.__IMO_EDGE_TTS_BASE = "http://127.0.0.1:8787"` to production, or every visitor’s browser calls **localhost on their own device**. This repo’s snippet only sets that base on `localhost` / `127.0.0.1` / `::1`.

Deploy from the **repository root** so Vercel bundles **`www/`** (`outputDirectory`) and **`api/`** (functions). Root Directory **`www`** alone would omit `api/`—use repo root instead, or duplicate function layout under that root.

Separate **local** neural TTS still uses **`tts-server/server.py`** (`IMO_TTS_CORS` applies only when that process is publicly reachable).

## File structure

```
imo/
├── api/              Vercel Python: GET /api/tts (neural pronunciation on deploy)
│   ├── tts.py
│   └── requirements.txt
├── www/
│   ├── index.html    Markup shell, loads CSS + JS in order
│   └── src/
│       ├── data.js       Vocabulary dataset (DATA, ORDER)
│       ├── state.js      App state, localStorage persistence, helpers, TTS
│       ├── render.js     DOM rendering for cats / cards / quiz / progress
│       └── app.js        Event wiring + bootstrap
├── tts-server/       Python edge-tts bridge (optional; local dev)
└── README.md
```

The JS files are plain `<script>` tags (not ES modules) so the app runs
directly from `file://` without a dev server. Load order matters and is
fixed in `index.html`.

## Modes

- **Dictionary** — every word, grouped by category, with search.
- **Cards** — flashcards for one chosen category.
- **Quiz** — multiple-choice for one category, *or* the **All** pseudo-category
  to be quizzed across every word in the app. Correct answers in "All" still
  count toward the original category's progress.

## Keyboard shortcuts

- `/` — focus search
- `1` / `2` / `3` — switch to Dictionary / Cards / Quiz
- `A`–`D` in Quiz — select an answer
- `Enter` in Quiz — check answer
- `→` or `N` — next question
- `Enter` / `Space` on a card — flip it

## Performance notes

The app was tuned for low-end machines and Firefox specifically:

- Card flips do **not** rebuild the grid — only the affected card's classes
  are toggled in place. Full re-renders are reserved for category switches,
  mode changes, search, and filter/shuffle toggles.
- `backdrop-filter` is used on only two surfaces (toolbar + progress card)
  because each blurred surface forces a separate compositor layer.
- The body uses a static gradient — no animated drift, no dot-grid pseudo —
  which kept Firefox repainting continuously.
- The progress bar fill animates only when `width` changes (no infinite
  shimmer keyframe).
- Cards use `contain: layout paint` so flipping one card cannot invalidate
  layout/paint of its siblings.
- All animations honor `prefers-reduced-motion`.

## Mobile (Capacitor)

The app is wrapped with Capacitor for iOS and Android while preserving the static web flow.
Web assets now live under `www/`; you can still open `www/index.html` directly with `file://`.

### One-time setup

```bash
npm install
npx cap sync
```

### Run locally

```bash
npm run web        # static preview at http://localhost:5173
npm run dev        # same + Edge TTS bridge (needs tts-server deps + window.__IMO_EDGE_TTS_BASE)
npm run ios        # opens Xcode project
npm run android    # opens Android Studio project
```

In Xcode/Android Studio, choose a simulator/device and press Run.

### After editing web files

Any time you change files in `www/`, re-sync native projects:

```bash
npx cap sync
```
