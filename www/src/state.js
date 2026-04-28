/* Application state, localStorage persistence, derived selectors,
 * and small utility helpers (TTS, today counters, escape).
 * Depends on globals from data.js: DATA, ORDER. */

const STORAGE_KEY = "jvocab_state_v1";
let ttsBlocked = false;
let ttsWarningLogged = false;

const storage = {
  getItem(key) {
    return window.localStorage.getItem(key);
  },
  setItem(key, value) {
    window.localStorage.setItem(key, value);
  },
};

function isNativeCapacitorPlatform() {
  return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform());
}

const state = {
  /* Starts as null on every load so the user has a "blank canvas":
   * cards/quiz are hidden until they explicitly pick a category. */
  currentCategory: null,
  mode: "cards",
  searchQuery: "",
  filterUnlearnedOnly: false,
  shuffle: false,
  showRomaji: true,
  theme: "light",
  flippedByCategory: {},
  todayCount: 0,
  todayDate: "",
  quiz: {
    currentWordIndex: -1,
    options: [],
    selected: "",
    answered: false,
    correct: 0,
    total: 0,
    lastWordIndex: -1,
  },
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function toSetMap(raw = {}) {
  const map = {};
  ORDER.forEach((k) => {
    map[k] = new Set(Array.isArray(raw[k]) ? raw[k] : []);
  });
  return map;
}

function persistableFlipped() {
  const out = {};
  ORDER.forEach((k) => {
    out[k] = [...state.flippedByCategory[k]];
  });
  return out;
}

function loadState() {
  ORDER.forEach((k) => {
    state.flippedByCategory[k] = new Set();
  });
  let parsed = null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw);
  } catch (_) {
    parsed = null;
  }
  if (parsed) {
    /* currentCategory deliberately NOT restored — every session starts on
     * the welcome state until the user picks a category. Per-category flip
     * progress IS still restored below, so picking the same category later
     * brings their learned cards back. */
    state.mode = ["dictionary", "cards", "quiz"].includes(parsed.mode) ? parsed.mode : "cards";
    state.searchQuery = typeof parsed.searchQuery === "string" ? parsed.searchQuery : "";
    state.filterUnlearnedOnly = !!parsed.filterUnlearnedOnly;
    state.shuffle = !!parsed.shuffle;
    state.showRomaji = parsed.showRomaji !== false;
    state.theme = parsed.theme === "dark" ? "dark" : "light";
    state.flippedByCategory = toSetMap(parsed.flippedByCategory);
    state.todayDate = typeof parsed.todayDate === "string" ? parsed.todayDate : "";
    state.todayCount = Number.isFinite(parsed.todayCount) ? parsed.todayCount : 0;
  } else {
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    state.theme = prefersDark ? "dark" : "light";
  }
  if (state.todayDate !== todayKey()) {
    state.todayDate = todayKey();
    state.todayCount = 0;
  }
}

function saveState() {
  const payload = {
    currentCategory: state.currentCategory,
    mode: state.mode,
    searchQuery: state.searchQuery,
    filterUnlearnedOnly: state.filterUnlearnedOnly,
    shuffle: state.shuffle,
    showRomaji: state.showRomaji,
    theme: state.theme,
    flippedByCategory: persistableFlipped(),
    todayDate: state.todayDate,
    todayCount: state.todayCount,
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {
    /* storage unavailable; continue silently */
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function supportsTTS() {
  return !ttsBlocked && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function hasJapaneseVoice(voices) {
  return voices.some((v) => {
    const lang = String(v.lang || "").toLowerCase();
    return lang.startsWith("ja");
  });
}

function enforceNativeJapaneseVoiceGuard() {
  if (!isNativeCapacitorPlatform() || !("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;

  const missingJapaneseVoice = !hasJapaneseVoice(voices);
  ttsBlocked = missingJapaneseVoice;
  if (missingJapaneseVoice && !ttsWarningLogged) {
    console.warn("No Japanese TTS voice available; speech buttons are disabled.");
    ttsWarningLogged = true;
  }
  if (typeof renderSection === "function") renderSection();
}

function setupTTSGuard() {
  if (!isNativeCapacitorPlatform() || !("speechSynthesis" in window)) return;
  enforceNativeJapaneseVoiceGuard();
  window.speechSynthesis.addEventListener("voiceschanged", enforceNativeJapaneseVoiceGuard);
}

function speak(text) {
  if (!supportsTTS()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

function bumpToday() {
  if (state.todayDate !== todayKey()) {
    state.todayDate = todayKey();
    state.todayCount = 0;
  }
  state.todayCount += 1;
}

function totalLearned() {
  let n = 0;
  ORDER.forEach((k) => {
    n += state.flippedByCategory[k].size;
  });
  return n;
}

/* The pseudo-category "all" is quiz-only and aggregates every word across
 * every category. Words returned in this mode are tagged with catKey and
 * origIdx so progress can still be marked against the original category's
 * flippedByCategory[catKey] set (we don't introduce a separate "all" set). */
function currentWordsRaw() {
  if (!state.currentCategory) return [];
  if (state.currentCategory === "all") {
    const out = [];
    ORDER.forEach((catKey) => {
      DATA[catKey].words.forEach((w, origIdx) => {
        out.push({ ...w, catKey, origIdx });
      });
    });
    return out;
  }
  return DATA[state.currentCategory].words.map((w, origIdx) => ({
    ...w,
    catKey: state.currentCategory,
    origIdx,
  }));
}

/* True if the given filtered-pool word is already learned. Routes through
 * the right per-category flipped set in both single-category and "all" modes. */
function isWordLearned(w) {
  return state.flippedByCategory[w.catKey]?.has(w.origIdx) ?? false;
}

function currentWordsFiltered() {
  if (!state.currentCategory) return [];
  const words = currentWordsRaw().map((w, i) => ({ ...w, index: i }));
  const q = state.searchQuery.trim().toLowerCase();
  let out = words.filter(
    (w) => !q || [w.jp, w.r, w.en].some((v) => String(v).toLowerCase().includes(q))
  );
  if (state.filterUnlearnedOnly) {
    out = out.filter((w) => !isWordLearned(w));
  }
  if (state.shuffle) {
    out = [...out].sort(() => Math.random() - 0.5);
  }
  return out;
}

function buildOptions(current, pool) {
  const distractorPool = (pool.length >= 4 ? pool : currentWordsRaw().map((w, i) => ({ ...w, index: i })))
    .filter((w) => w.en !== current.en)
    .map((w) => w.en);
  const unique = [...new Set(distractorPool)];
  const selected = [];
  while (unique.length && selected.length < 3) {
    const idx = Math.floor(Math.random() * unique.length);
    selected.push(unique.splice(idx, 1)[0]);
  }
  while (selected.length < 3) {
    const fallback = currentWordsRaw()[Math.floor(Math.random() * currentWordsRaw().length)].en;
    if (fallback !== current.en && !selected.includes(fallback)) selected.push(fallback);
  }
  return [current.en, ...selected].sort(() => Math.random() - 0.5);
}

setupTTSGuard();
