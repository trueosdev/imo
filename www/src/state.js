/* Application state, localStorage persistence, derived selectors,
 * and small utility helpers (TTS, today counters, escape).
 * Depends on globals from data.js: DATA, ORDER. */

const STORAGE_KEY = "jvocab_state_v1";
let ttsBlocked = false;
let ttsWarningLogged = false;

/** Neural TTS (`…/tts` → MP3) via edge-tts. Explicit `window.__IMO_EDGE_TTS_BASE` overrides; HTTPS web uses same-origin `/api` + `/tts` when unset (see `api/` on Vercel). Set base to empty string only to disable. */
function edgeTtsBase() {
  if (typeof window.__IMO_EDGE_TTS_BASE !== "undefined") {
    const t = window.__IMO_EDGE_TTS_BASE;
    if (t === null || t === false) return "";
    return String(t).trim().replace(/\/$/, "");
  }
  if (typeof isNativeCapacitorPlatform === "function" && isNativeCapacitorPlatform()) {
    /* Native shells use bundled Web Speech elsewhere; skip `/api` fetch attempts. */
    return "";
  }
  try {
    if (typeof location === "undefined" || !(location.protocol === "http:" || location.protocol === "https:")) return "";
    const h = location.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "::1") return "";
    /* Same-origin neural API deployed with the site (e.g. `/api/tts` on learnimo.vercel.app). */
    const o = location.origin;
    if (!o || o === "null") return "";
    return `${o.replace(/\/$/, "")}/api`;
  } catch (_) {
    return "";
  }
}

let activeEdgeAudio = null;

/** In-memory LRU of neural TTS Blobs (key = normalized text). Reduces repeat & prefetched latency. */
const TTS_CACHE_MAX = 48;
const ttsBlobCache = new Map();
const ttsCacheOrder = [];
const ttsInflight = new Map();

function normalizeTtsKey(text) {
  const s = String(text ?? "").trim();
  if (!s) return "";
  return s.length > 500 ? s.slice(0, 500) : s;
}

function ttsCacheTouch(key) {
  const i = ttsCacheOrder.indexOf(key);
  if (i >= 0) ttsCacheOrder.splice(i, 1);
  ttsCacheOrder.push(key);
}

function ttsCacheSet(key, blob) {
  ttsBlobCache.set(key, blob);
  ttsCacheTouch(key);
  while (ttsCacheOrder.length > TTS_CACHE_MAX) {
    const old = ttsCacheOrder.shift();
    if (old) ttsBlobCache.delete(old);
  }
}

/**
 * Fetches MP3 for neural TTS; dedupes concurrent requests and fills `ttsBlobCache`.
 * @param {string} text
 * @returns {Promise<Blob>}
 */
async function fetchTtsBlob(text) {
  const key = normalizeTtsKey(text);
  if (!key) throw new Error("empty TTS text");

  const hit = ttsBlobCache.get(key);
  if (hit) {
    ttsCacheTouch(key);
    return hit;
  }

  const existing = ttsInflight.get(key);
  if (existing) return existing;

  const base = edgeTtsBase();
  if (!base) throw new Error("no TTS base");

  const p = (async () => {
    const url = `${base}/tts?${new URLSearchParams({ text: key })}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`TTS ${r.status}`);
    const blob = await r.blob();
    ttsCacheSet(key, blob);
    return blob;
  })();

  ttsInflight.set(key, p);
  try {
    return await p;
  } finally {
    ttsInflight.delete(key);
  }
}

/**
 * Prefetch neural TTS audio for upcoming strings (idle-time, staggered). No-op without edge base.
 * @param {string[]} texts
 * @param {{ max?: number }} [opts]
 */
function schedulePrefetchSpeakTexts(texts, opts) {
  const max = opts && Number.isFinite(opts.max) ? Math.max(0, Math.min(64, opts.max)) : 40;
  if (!max || !supportsTTS() || !edgeTtsBase()) return;

  const seen = new Set();
  const keys = [];
  for (const t of texts) {
    const k = normalizeTtsKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    if (ttsBlobCache.has(k) || ttsInflight.has(k)) continue;
    keys.push(k);
    if (keys.length >= max) break;
  }
  if (!keys.length) return;

  const run = () => {
    keys.forEach((key, i) => {
      window.setTimeout(() => {
        void fetchTtsBlob(key).catch(() => {});
      }, i * 42);
    });
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 2200 });
  } else {
    window.setTimeout(run, 0);
  }
}

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
  /** Session-only Hiragana + Katakana romaji drill (see render.js). Not persisted. */
  kanaLearn: null,
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
    state.mode = ["dictionary", "cards", "quiz", "kana"].includes(parsed.mode) ? parsed.mode : "cards";
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
  if (edgeTtsBase()) return true;
  if (ttsBlocked) return false;
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function getJapaneseVoice() {
  if (!isNativeCapacitorPlatform() || !("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return voices.find((v) => String(v.lang || "").toLowerCase().startsWith("ja")) || null;
}

function blockNativeTTS() {
  ttsBlocked = true;
  if (!ttsWarningLogged) {
    console.warn("No Japanese TTS voice available; speech buttons are disabled.");
    ttsWarningLogged = true;
  }
  if (typeof renderSection === "function") renderSection();
}

async function speak(text) {
  if (!supportsTTS()) return;

  const base = edgeTtsBase();
  if (base) {
    speechSynthesis.cancel();
    if (activeEdgeAudio) {
      activeEdgeAudio.pause();
      URL.revokeObjectURL(activeEdgeAudio.dataset.objectUrl || "");
      activeEdgeAudio.removeAttribute("src");
      activeEdgeAudio = null;
    }
    try {
      const key = normalizeTtsKey(text);
      let blob = key ? ttsBlobCache.get(key) : null;
      if (key && blob) {
        ttsCacheTouch(key);
      } else {
        blob = await fetchTtsBlob(text);
      }
      const objUrl = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.dataset.objectUrl = objUrl;
      audio.onended = () => {
        URL.revokeObjectURL(objUrl);
        if (activeEdgeAudio === audio) activeEdgeAudio = null;
      };
      audio.onerror = () => {
        URL.revokeObjectURL(objUrl);
        if (activeEdgeAudio === audio) activeEdgeAudio = null;
      };
      activeEdgeAudio = audio;
      audio.src = objUrl;
      await audio.play();
      return;
    } catch (_) {
      if (activeEdgeAudio?.dataset?.objectUrl) {
        URL.revokeObjectURL(activeEdgeAudio.dataset.objectUrl);
      }
      activeEdgeAudio = null;
      /* Fall through to Web Speech API when offline or bridge down. */
    }
  }

  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
  const japaneseVoice = getJapaneseVoice();
  if (isNativeCapacitorPlatform() && !japaneseVoice && !base) {
    blockNativeTTS();
    return;
  }
  if (isNativeCapacitorPlatform() && !japaneseVoice) return;

  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  if (japaneseVoice) u.voice = japaneseVoice;
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
  const q =
    state.mode === "quiz" || state.mode === "cards"
      ? ""
      : state.searchQuery.trim().toLowerCase();
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
