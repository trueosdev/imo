# Japanese Vocab Studio

A single-page Japanese vocabulary trainer with flashcards, multiple-choice
quiz, romaji toggle, search, shuffle, native TTS pronunciation, dark/light
mode, keyboard shortcuts, and offline progress saved to `localStorage`.

## Run it

Just open `index.html` in any modern browser — no build step, no server.

```
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

If you'd rather run it from a local server (optional):

```
python3 -m http.server 8000
# then visit http://localhost:8000
```

## File structure

```
imo/
├── index.html        Markup shell, loads CSS + JS in order
├── styles.css        All styles (theme variables, layout, animations)
├── README.md
└── src/
    ├── data.js       Vocabulary dataset (DATA, ORDER)
    ├── state.js      App state, localStorage persistence, helpers, TTS
    ├── render.js     DOM rendering for cats / cards / quiz / progress
    └── app.js        Event wiring + bootstrap
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
npm run ios        # opens Xcode project
npm run android    # opens Android Studio project
```

In Xcode/Android Studio, choose a simulator/device and press Run.

### After editing web files

Any time you change files in `www/`, re-sync native projects:

```bash
npx cap sync
```
