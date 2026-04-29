/* DOM rendering. Uses globals from data.js + state.js.
 * Performance notes:
 *  - Card flips do NOT call renderSection(); they call updateCardFlip() instead,
 *    which only mutates classes on the affected card and updates the progress numbers.
 *  - Full re-render only happens for category change, mode switch, search,
 *    filter/shuffle toggles, or quiz state changes.
 */

/* Lucide volume-2 (used for the per-card and per-quiz speak button). */
const SPEAKER_SVG = '<svg class="lucide" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
const SPEAKER_SVG_LG = '<svg class="lucide" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
/* Lucide check (used inside the gradient learned-badge on flipped cards). */
const CHECK_SVG = '<svg class="lucide" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

function speakBtnHtml(text, large) {
  if (!supportsTTS()) return "";
  return `<button class="speak-btn" type="button" data-speak="${escapeHtml(text)}" aria-label="Play pronunciation for ${escapeHtml(text)}">${large ? SPEAKER_SVG_LG : SPEAKER_SVG}</button>`;
}

function updateProgress() {
  document.getElementById("stat-today").textContent = state.todayCount;
  document.getElementById("stat-total").textContent = totalLearned();
  if (!state.currentCategory) {
    document.getElementById("prog-label").textContent = "—";
    document.getElementById("prog-fill").style.width = "0%";
    document.getElementById("prog-pct").textContent = "—";
    document.getElementById("stat-cat").textContent = "—";
    return;
  }
  /* "all" pseudo-category: total = every word, done = sum of every flipped set. */
  const total = state.currentCategory === "all"
    ? ORDER.reduce((n, k) => n + DATA[k].words.length, 0)
    : DATA[state.currentCategory].words.length;
  const done = state.currentCategory === "all"
    ? totalLearned()
    : state.flippedByCategory[state.currentCategory].size;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById("prog-label").textContent = `${done} of ${total} learned`;
  document.getElementById("prog-fill").style.width = `${pct}%`;
  document.getElementById("prog-pct").textContent = `${pct}%`;
  document.getElementById("stat-cat").textContent = `${done}/${total}`;
}

function renderCats() {
  const root = document.getElementById("cats");
  const buttons = [];

  /* Quiz-only "All Categories" pseudo-button. Uses the brand accent so it
   * reads as a meta option rather than a regular category. */
  if (state.mode === "quiz") {
    const active = state.currentCategory === "all";
    const styleActive = active
      ? `style="background:linear-gradient(135deg,var(--accent),var(--accent-3));color:#fff"`
      : `style="color:var(--accent)"`;
    buttons.push(
      `<button class="cat-btn cat-btn-all${active ? " active" : ""}" ${styleActive} type="button" data-cat="all" aria-pressed="${active}"><span class="dot" aria-hidden="true"></span><span class="ico" aria-hidden="true">${lucide(ALL_ICON_INNER, 16)}</span>All</button>`
    );
  }

  ORDER.forEach((k) => {
    const d = DATA[k];
    const active = k === state.currentCategory;
    const styleActive = active
      ? `style="background:linear-gradient(135deg,${d.color},${d.color}cc);color:#fff"`
      : `style="color:${d.color}"`;
    const iconInner = CATEGORY_ICONS[k] || DICTIONARY_HEADER_INNER;
    buttons.push(
      `<button class="cat-btn${active ? " active" : ""}" ${styleActive} type="button" data-cat="${k}" aria-pressed="${active}"><span class="dot" aria-hidden="true"></span><span class="ico" aria-hidden="true">${lucide(iconInner, 16)}</span>${escapeHtml(d.label)}</button>`
    );
  });

  root.innerHTML = buttons.join("");
}

function renderCardMode(words) {
  if (!words.length) {
    return `<div class="empty-state"><span class="ico" aria-hidden="true">🌧️</span>No words match this filter.<br><span style="opacity:.7;font-weight:600">Try clearing search or turning off "Only unlearned".</span></div>`;
  }
  return `<div class="card-grid">${words.map((w, i) => {
    const isFlipped = state.flippedByCategory[state.currentCategory].has(w.index);
    const romaji = state.showRomaji ? `<div class="c-romaji">${escapeHtml(w.r)}</div>` : "";
    const speakBtn = speakBtnHtml(w.jp, false);
    const emojiSize = Number(w.eSize);
    const emojiStyle = Number.isFinite(emojiSize) && emojiSize > 0 ? ` style="font-size:${emojiSize}rem"` : "";
    return `<div class="card${isFlipped ? " flipped is-learned" : ""}" role="button" tabindex="0" data-flip="${w.index}" style="animation-delay:${Math.min(i * 25, 240)}ms" aria-label="${escapeHtml(w.jp)}, ${escapeHtml(w.en)}. ${isFlipped ? "Marked learned." : "Tap to reveal meaning."}">
      <div class="card-inner">
        <div class="card-front">
          <span class="learned-badge" aria-hidden="true">${CHECK_SVG}</span>
          <div class="c-jp">${escapeHtml(w.jp)}</div>
          <div class="c-front-meta">${speakBtn}</div>
          <div class="hint">tap to flip</div>
        </div>
        <div class="card-back">
          <span class="learned-badge" aria-hidden="true">${CHECK_SVG}</span>
          <div class="c-emoji" aria-hidden="true"${emojiStyle}>${escapeHtml(w.e)}</div>
          <div class="c-en">${escapeHtml(w.en)}</div>
          ${romaji}
        </div>
      </div>
    </div>`;
  }).join("")}</div>`;
}

function answerClass(option) {
  if (!state.quiz.answered) {
    return option === state.quiz.selected ? "selected" : "";
  }
  const current = currentWordsFiltered().find((w) => w.index === state.quiz.currentWordIndex);
  if (!current) return "";
  if (option === current.en) return "correct";
  if (option === state.quiz.selected) return "wrong";
  return "";
}

/* Lucide icons used everywhere a category is represented in chrome:
 * the category chips, the cards/quiz section header, and every group
 * header in the Dictionary view. The per-word emoji on card BACKS is
 * the actual content of a flashcard, so those stay as-is. */
function lucide(inner, size) {
  return `<svg class="lucide" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

/* category id → inner SVG paths. Pulled directly from the Lucide library
 * so they match the same visual language as the rest of the UI chrome. */
const CATEGORY_ICONS = {
  greetings: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  numbers: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  colors: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
  animals: '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>',
  food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  body: '<circle cx="12" cy="5" r="1"/><path d="m9 20 3-6 3 6"/><path d="m6 8 6 2 6-2"/><path d="M12 10v4"/>',
  days: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  family: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  classroom: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  weather: '<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
  seasons: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  transport: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  clothes: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
  sports: '<path d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978"/><path d="M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978"/><path d="M18 9h1.5a1 1 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/><path d="M6 9H4.5a1 1 0 0 1 0-5H6"/>',
  hobbies: '<line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>',
  house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  emotions: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
  months: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
  jobs: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  instruments: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  insects: '<path d="M12 20v-9"/><path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z"/><path d="M14.12 3.88 16 2"/><path d="M21 21a4 4 0 0 0-3.81-4"/><path d="M21 5a4 4 0 0 1-3.55 3.97"/><path d="M22 13h-4"/><path d="M3 21a4 4 0 0 1 3.81-4"/><path d="M3 5a4 4 0 0 0 3.55 3.97"/><path d="M6 13H2"/><path d="m8 2 1.88 1.88"/><path d="M9 7.13V6a3 3 0 1 1 6 0v1.13"/>',
  japanesefood: '<path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z"/><path d="M18 12v.5"/><path d="M16 17.93a9.77 9.77 0 0 1 0-11.86"/><path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33"/><path d="M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4"/><path d="m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98"/>',
  places: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
  adjectives: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
  verbs: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
};
/* Lucide library — used in the Dictionary section header. */
const DICTIONARY_HEADER_INNER = '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>';
/* Lucide layers — represents the "All" pseudo-category (every category stacked). */
const ALL_ICON_INNER = '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>';

/* Build the dictionary view: every word from every category, with the
 * current search query and "only unlearned" filter applied per group.
 * Groups currently come from category structure; once words have a `jlpt`
 * field we can swap this for JLPT-band groups without touching the row
 * markup (each row is category-agnostic). */
function buildDictionaryGroups() {
  const q = state.searchQuery.trim().toLowerCase();
  return ORDER.map((catKey) => {
    const cat = DATA[catKey];
    const flipped = state.flippedByCategory[catKey];
    let words = cat.words.map((w, idx) => ({ ...w, catKey, idx, isLearned: flipped.has(idx) }));
    if (q) {
      words = words.filter((w) =>
        [w.jp, w.r, w.en].some((v) => String(v).toLowerCase().includes(q))
      );
    }
    if (state.filterUnlearnedOnly) {
      words = words.filter((w) => !w.isLearned);
    }
    return { key: catKey, label: cat.label, emoji: cat.emoji, color: cat.color, words };
  }).filter((g) => g.words.length > 0);
}

function renderDictionaryMode() {
  const groups = buildDictionaryGroups();

  if (!groups.length) {
    return `<div class="empty-state"><span class="ico" aria-hidden="true">🔍</span>No words match your search.<br><span style="opacity:.7;font-weight:600">Try a different term${state.filterUnlearnedOnly ? ' or turn off "Only unlearned"' : ""}.</span></div>`;
  }

  const groupsHtml = groups.map((g) => {
    const rows = g.words.map((w) => {
      const speakBtn = speakBtnHtml(w.jp, false);
      const romaji = state.showRomaji ? `<div class="dict-romaji">${escapeHtml(w.r)}</div>` : "";
      return `<li class="dict-row${w.isLearned ? " is-learned" : ""}">
        <div class="dict-jp-block">
          <div class="dict-jp">${escapeHtml(w.jp)}</div>
          ${romaji}
        </div>
        <div class="dict-en">${escapeHtml(w.en)}</div>
        ${speakBtn}
      </li>`;
    }).join("");
    const iconInner = CATEGORY_ICONS[g.key] || DICTIONARY_HEADER_INNER;
    return `<section class="dict-group">
      <header class="dict-group-header" style="background:linear-gradient(135deg,${g.color},${g.color}cc)">
        <span class="dict-group-emoji" aria-hidden="true">${lucide(iconInner, 22)}</span>
        <span class="dict-group-label">${escapeHtml(g.label)}</span>
        <span class="dict-group-count">${g.words.length} word${g.words.length === 1 ? "" : "s"}</span>
      </header>
      <ul class="dict-rows">${rows}</ul>
    </section>`;
  }).join("");

  return `<div class="dict-section">${groupsHtml}</div>`;
}

/* Each column is ∅ k s t n h m y r w — five vowel slots per column (null = blank). */
const GOJUON_COL_LABELS = ["∅", "k", "s", "t", "n", "h", "m", "y", "r", "w"];
const GOJUON_ROW_LABELS = ["a", "i", "u", "e", "o"];

const GOJUON_HIRA_COLS = [
  [
    ["あ", "a"],
    ["い", "i"],
    ["う", "u"],
    ["え", "e"],
    ["お", "o"],
  ],
  [
    ["か", "ka"],
    ["き", "ki"],
    ["く", "ku"],
    ["け", "ke"],
    ["こ", "ko"],
  ],
  [
    ["さ", "sa"],
    ["し", "shi"],
    ["す", "su"],
    ["せ", "se"],
    ["そ", "so"],
  ],
  [
    ["た", "ta"],
    ["ち", "chi"],
    ["つ", "tsu"],
    ["て", "te"],
    ["と", "to"],
  ],
  [
    ["な", "na"],
    ["に", "ni"],
    ["ぬ", "nu"],
    ["ね", "ne"],
    ["の", "no"],
  ],
  [
    ["は", "ha"],
    ["ひ", "hi"],
    ["ふ", "fu"],
    ["へ", "he"],
    ["ほ", "ho"],
  ],
  [
    ["ま", "ma"],
    ["み", "mi"],
    ["む", "mu"],
    ["め", "me"],
    ["も", "mo"],
  ],
  [
    ["や", "ya"],
    null,
    ["ゆ", "yu"],
    null,
    ["よ", "yo"],
  ],
  [
    ["ら", "ra"],
    ["り", "ri"],
    ["る", "ru"],
    ["れ", "re"],
    ["ろ", "ro"],
  ],
  [
    ["わ", "wa"],
    null,
    null,
    null,
    ["を", "wo"],
  ],
];

const GOJUON_KATA_COLS = [
  [
    ["ア", "a"],
    ["イ", "i"],
    ["ウ", "u"],
    ["エ", "e"],
    ["オ", "o"],
  ],
  [
    ["カ", "ka"],
    ["キ", "ki"],
    ["ク", "ku"],
    ["ケ", "ke"],
    ["コ", "ko"],
  ],
  [
    ["サ", "sa"],
    ["シ", "shi"],
    ["ス", "su"],
    ["セ", "se"],
    ["ソ", "so"],
  ],
  [
    ["タ", "ta"],
    ["チ", "chi"],
    ["ツ", "tsu"],
    ["テ", "te"],
    ["ト", "to"],
  ],
  [
    ["ナ", "na"],
    ["ニ", "ni"],
    ["ヌ", "nu"],
    ["ネ", "ne"],
    ["ノ", "no"],
  ],
  [
    ["ハ", "ha"],
    ["ヒ", "hi"],
    ["フ", "fu"],
    ["ヘ", "he"],
    ["ホ", "ho"],
  ],
  [
    ["マ", "ma"],
    ["ミ", "mi"],
    ["ム", "mu"],
    ["メ", "me"],
    ["モ", "mo"],
  ],
  [
    ["ヤ", "ya"],
    null,
    ["ユ", "yu"],
    null,
    ["ヨ", "yo"],
  ],
  [
    ["ラ", "ra"],
    ["リ", "ri"],
    ["ル", "ru"],
    ["レ", "re"],
    ["ロ", "ro"],
  ],
  [
    ["ワ", "wa"],
    null,
    null,
    null,
    ["ヲ", "wo"],
  ],
];

function renderGojuonTable(title, cols, scriptTag) {
  const nChar = scriptTag === "hr" ? "ん" : "ン";
  const head =
    `<thead><tr><th class="kana-corner" scope="col"></th>` +
    GOJUON_COL_LABELS.map((c) => `<th scope="col">${escapeHtml(c)}</th>`).join("") +
    `</tr></thead>`;
  const bodyRows = [];
  for (let ri = 0; ri < 5; ri++) {
    const cells = cols.map((col) => {
      const pair = col[ri];
      if (!pair) {
        return `<td class="kana-empty" aria-hidden="true"></td>`;
      }
      const jp = pair[0];
      const roma = pair[1];
      const speakAttr = supportsTTS() ? ` data-speak="${escapeHtml(jp)}"` : "";
      const aria =
        escapeHtml(jp) + (state.showRomaji ? ", " + escapeHtml(roma) : "");
      const romaHtml = state.showRomaji ? `<span class="kana-roma">${escapeHtml(roma)}</span>` : "";
      return `<td class="kana-cell"><button type="button" class="kana-char"${speakAttr} aria-label="${aria}">${escapeHtml(jp)}</button>${romaHtml}</td>`;
    });
    bodyRows.push(
      `<tr><th scope="row" class="kana-row-label">${escapeHtml(GOJUON_ROW_LABELS[ri])}</th>${cells.join("")}</tr>`
    );
  }
  const nSpeak = supportsTTS() ? ` data-speak="${escapeHtml(nChar)}"` : "";
  const nBtn = supportsTTS()
    ? `<button type="button" class="kana-n-char"${nSpeak} aria-label="${escapeHtml(nChar)}, n">${escapeHtml(nChar)}</button>`
    : `<span class="kana-n-char">${escapeHtml(nChar)}</span>`;
  const nRoma = state.showRomaji ? `<span class="kana-roma">n</span>` : "";
  return `<section class="kana-chart-block" aria-labelledby="kana-title-${scriptTag}">
    <h3 class="kana-chart-title" id="kana-title-${scriptTag}">${escapeHtml(title)}</h3>
    <div class="kana-chart-scroll">
      <table class="kana-chart">${head}<tbody>${bodyRows.join("")}</tbody></table>
    </div>
    <div class="kana-n-row"><span class="kana-n-label">n</span>${nBtn}${nRoma}</div>
  </section>`;
}

function renderKanaMode() {
  if (state.kanaLearn) {
    return renderKanaLearnShell();
  }
  const learnBar =
    `<header class="kana-learn-intro" aria-label="Kana drill">
      <div class="kana-learn-intro-text">
        <h2 class="kana-learn-heading">Typing drill</h2>
        <p class="kana-learn-blurb">
          Hiragana and Katakana (gojūon + 「ん」/「ン」), one prompt at a time. Type Hepburn romaji, then <kbd class="inline-kbd">Enter</kbd> to check — correct answers advance automatically.
        </p>
      </div>
      <button type="button" class="btn primary kana-learn-start" id="kana-learn-start">Learn</button>
    </header>`;

  const charts =
    renderGojuonTable("Hiragana", GOJUON_HIRA_COLS, "hr") +
    renderGojuonTable("Katakana", GOJUON_KATA_COLS, "kt");
  return `<div class="kana-section">${learnBar}<div class="kana-chart-wrap">${charts}</div></div>`;
}

function kanaScriptLabelForChar(jp) {
  const cp = jp.codePointAt(0);
  if (cp >= 0x3040 && cp <= 0x309f) return "Hiragana";
  if (cp >= 0x30a0 && cp <= 0x30ff) return "Katakana";
  return "Kana";
}

function collectKanaPairsFromCols(cols) {
  const out = [];
  cols.forEach((col) =>
    col.forEach((cell) => {
      if (cell && cell[0]) out.push({ jp: cell[0], roma: cell[1] });
    })
  );
  return out;
}

function shuffleDeck(arr) {
  const deck = arr.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function buildNewKanaLearnSession() {
  const h = collectKanaPairsFromCols(GOJUON_HIRA_COLS);
  const k = collectKanaPairsFromCols(GOJUON_KATA_COLS);
  h.push({ jp: "ん", roma: "n" });
  k.push({ jp: "ン", roma: "n" });
  return shuffleDeck([...h, ...k]);
}

function romajiMatchesExpected(expectedRoma, rawInput) {
  const n = String(rawInput ?? "")
    .trim()
    .toLowerCase();
  if (!n) return false;
  const exp = expectedRoma.trim().toLowerCase();
  if (n === exp) return true;
  /** Hepburn synonyms / common IME outputs */
  const synonymGroups = [
    ["shi", "si"],
    ["chi", "ti"],
    ["tsu", "tu"],
    ["fu", "hu"],
    ["ji", "zi"],
    ["sha", "sya"],
    ["shu", "syu"],
    ["sho", "syo"],
    ["cha", "tya"],
    ["chu", "tyu"],
    ["cho", "tyo"],
  ];
  if (synonymGroups.some((g) => g.includes(exp) && g.includes(n))) return true;
  if ((exp === "wo" && n === "o") || (exp === "o" && n === "wo")) return true;
  return false;
}

function renderKanaLearnShell() {
  const s = state.kanaLearn;
  const deckLen = s.deck.length;

  if (s.idx >= deckLen) {
    const totalAttempts = s.correct + s.missed;
    const pct = totalAttempts ? Math.round((s.correct / totalAttempts) * 100) : 0;
    return `<div class="kana-section kana-learn-section">
      <div class="kana-learn-complete">
        <p class="kana-learn-complete-title">All done!</p>
        <p class="kana-learn-stats">
          Correct <strong>${s.correct}</strong> · Missed <strong>${s.missed}</strong>
          ${totalAttempts ? ` · ${pct}% precision` : ""}
        </p>
        <p class="kana-learn-hint-sub">Deck: ${deckLen} kana (${deckLen === 92 ? "full gojūon × 2 + n + ン" : `${deckLen} items`}).</p>
        <div class="kana-learn-complete-actions">
          <button type="button" class="btn primary" id="kana-learn-again">Try again</button>
          <button type="button" class="btn" id="kana-learn-done">Back to charts</button>
        </div>
      </div>
    </div>`;
  }

  const cur = s.deck[s.idx];
  const progress = `${s.idx + 1} / ${deckLen}`;
  const flash = s.feedbackFlash;
  const ringClass =
    flash === "ok" ? " kana-learn-ring--ok" : flash === "bad" ? " kana-learn-ring--bad" : "";
  const hintN = cur.jp === "ん" || cur.jp === "ン" ? ` <span class="kana-learn-n-hint">(solo n)</span>` : "";

  const statusHtml =
    flash === "ok"
      ? `<div class="kana-learn-status kana-learn-status--ok" role="status">
          <span class="kana-learn-glyph" aria-hidden="true">✓</span> Correct
        </div>`
      : flash === "bad"
      ? `<div class="kana-learn-status kana-learn-status--bad" role="alert">
          <span class="kana-learn-glyph" aria-hidden="true">✗</span>
          Expected <strong>${escapeHtml(cur.roma)}</strong>${hintN}
        </div>`
      : `<div class="kana-learn-status-slot" aria-hidden="true"></div>`;

  const inpDisabled = flash ? " disabled" : "";
  const btnDisabled = flash ? " disabled aria-disabled=\"true\"" : "";

  return `<div class="kana-section kana-learn-section">
    <div class="kana-learn-drill-inner">
      <div class="kana-learn-meta">
        <span class="kana-learn-script">${kanaScriptLabelForChar(cur.jp)}</span>
        <span class="kana-learn-progress-num">${progress}</span>
        <span class="kana-learn-score-mini">✓ ${s.correct} · ✗ ${s.missed}</span>
        <button type="button" class="chip kana-learn-exit-chip" id="kana-learn-exit">Exit drill</button>
      </div>
      <form class="kana-learn-form${flash ? " kana-learn-form--frozen" : ""}" id="kana-learn-form" action="#" autocomplete="off">
        <label class="kana-learn-label" for="kana-learn-input">Type the romaji for</label>
        <div class="kana-learn-ring${ringClass}">
          ${statusHtml}
          <div class="kana-learn-char" aria-hidden="true">${escapeHtml(cur.jp)}</div>
        </div>
        <input
          id="kana-learn-input"
          class="kana-learn-input"
          type="text"
          inputmode="latin"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          aria-label="Romaji for ${escapeHtml(cur.jp)}"
          placeholder="Type Hepburn romaji"
          value="${flash ? escapeHtml(String(s.echoInputCapture ?? "")) : ""}"
          ${inpDisabled}
        />
        <div class="kana-learn-footer">
          <button type="submit" class="btn primary" id="kana-learn-submit"${btnDisabled}>Check</button>
        </div>
      </form>
    </div>
  </div>`;
}

function renderQuizMode(words) {
  if (words.length < 1) {
    return `<div class="empty-state"><span class="ico" aria-hidden="true">🎯</span>Need at least one word to quiz.<br><span style="opacity:.7;font-weight:600">Adjust filters to widen the pool.</span></div>`;
  }
  let current = words.find((w) => w.index === state.quiz.currentWordIndex);
  if (!current) {
    current = words[Math.floor(Math.random() * words.length)];
    state.quiz.currentWordIndex = current.index;
    state.quiz.selected = "";
    state.quiz.answered = false;
    state.quiz.options = buildOptions(current, words);
  }
  const speakBtn = speakBtnHtml(current.jp, true);
  const accuracy = state.quiz.total ? Math.round((state.quiz.correct / state.quiz.total) * 100) : 0;
  const checkDisabled = !state.quiz.selected || state.quiz.answered;
  const letters = ["A", "B", "C", "D", "E", "F"];
  const correct =
    state.quiz.answered && state.quiz.selected === current.en;
  /* Random top corner: `.quiz-yay-slot-tr` or `.quiz-yay-slot-tl`. */
  /* On-screen size: styles.css :root --quiz-yay-* (width/height on img are layout hints only). */
  const yaySlots = ["quiz-yay-slot-tr", "quiz-yay-slot-tl"];
  const yaySlotClass = yaySlots[Math.floor(Math.random() * yaySlots.length)];
  const yayMarkup = correct
    ? `<span class="quiz-yay-slot ${yaySlotClass}" aria-hidden="true"><img class="quiz-yay" src="src/yay.svg" alt="" width="120" height="56" draggable="false" decoding="async"></span>`
    : "";
  return `<div class="quiz-card">
    ${yayMarkup}
    <div class="quiz-prompt">
      <div class="quiz-prompt-label">What does this mean?</div>
      <div class="quiz-jp">${escapeHtml(current.jp)} ${speakBtn}</div>
      ${state.showRomaji ? `<div class="quiz-romaji">${escapeHtml(current.r)}</div>` : ""}
    </div>
    <div class="answers">${state.quiz.options.map((o, i) => `<button class="answer-btn ${answerClass(o)}" data-answer="${escapeHtml(o)}" data-letter="${letters[i] || ""}" type="button">${escapeHtml(o)}</button>`).join("")}</div>
    <div class="quiz-actions">
      <button id="check-answer" class="btn primary" type="button"${checkDisabled ? " disabled" : ""}>Check answer</button>
      <button id="next-question" class="btn" type="button">Next question →</button>
    </div>
    <div class="score-bar">
      <span class="label">Session score</span>
      <span class="value">${state.quiz.correct} / ${state.quiz.total} <span class="accuracy">${state.quiz.total ? `· ${accuracy}%` : ""}</span></span>
    </div>
  </div>`;
}

function collectAllKanaChartSpeakables() {
  const h = collectKanaPairsFromCols(GOJUON_HIRA_COLS);
  const k = collectKanaPairsFromCols(GOJUON_KATA_COLS);
  return [...h, ...k, { jp: "ん", roma: "n" }, { jp: "ン", roma: "n" }].map((p) => p.jp);
}

/** Idle-time prefetch of neural TTS clips for strings likely to be spoken next. */
function scheduleTtsPrefetchForCurrentView() {
  try {
    if (typeof supportsTTS !== "function" || !supportsTTS()) return;

    /** @type {string[]} */
    let list = [];

    if (state.mode === "dictionary") {
      const groups = buildDictionaryGroups();
      for (const g of groups) {
        for (const w of g.words) list.push(w.jp);
      }
    } else if (state.mode === "kana") {
      if (state.kanaLearn) {
        const s = state.kanaLearn;
        const deck = s.deck;
        if (!deck.length || s.idx >= deck.length) return;
        for (let i = s.idx; i < deck.length && i < s.idx + 14; i++) list.push(deck[i].jp);
      } else {
        list = collectAllKanaChartSpeakables();
      }
    } else if (!state.currentCategory) {
      return;
    } else if (state.mode === "cards") {
      list = currentWordsFiltered().map((w) => w.jp);
    } else if (state.mode === "quiz") {
      list = currentWordsFiltered().map((w) => w.jp);
    } else {
      return;
    }

    if (typeof schedulePrefetchSpeakTexts === "function") {
      schedulePrefetchSpeakTexts(list, { max: state.mode === "kana" && !state.kanaLearn ? 96 : 40 });
    }
  } catch (_) {
    /* noop */
  }
}

function renderSection() {
  try {
    /* Dictionary and Kana are category-agnostic: they always render. */
    if (state.mode === "dictionary") {
      document.getElementById("vocab").innerHTML = renderDictionaryMode();
      syncControlStates();
      updateProgress();
      saveState();
      return;
    }
    if (state.mode === "kana") {
      document.getElementById("vocab").innerHTML = renderKanaMode();
      syncControlStates();
      updateProgress();
      saveState();
      return;
    }
    if (!state.currentCategory) {
      document.getElementById("vocab").innerHTML = "";
      syncControlStates();
      updateProgress();
      saveState();
      return;
    }
    const words = currentWordsFiltered();
    const body = state.mode === "quiz" ? renderQuizMode(words) : renderCardMode(words);
    document.getElementById("vocab").innerHTML = body;
    syncControlStates();
    updateProgress();
    saveState();
  } finally {
    scheduleTtsPrefetchForCurrentView();
  }
}

function setChip(id, on) {
  const el = document.getElementById(id);
  el.dataset.state = on ? "on" : "off";
  el.classList.toggle("on", on);
  el.setAttribute("aria-pressed", on ? "true" : "false");
}

/* Pill position by mode: 0–3 = Dictionary, Cards, Quiz, Kana. */
const MODE_POS = { dictionary: 0, cards: 1, quiz: 2, kana: 3 };

function syncControlStates() {
  const app = document.querySelector(".app");
  /* App-level visibility (see styles.css):
   *   .dict-mode / .kana-mode → reference tabs (cats/progress/shuffle/reset hide)
   *   .welcome → cards or quiz with no category yet (toolbar/progress hide) */
  app.classList.toggle("dict-mode", state.mode === "dictionary");
  app.classList.toggle("kana-mode", state.mode === "kana");
  app.classList.toggle("quiz-mode", state.mode === "quiz");
  app.classList.toggle(
    "welcome",
    (state.mode === "cards" || state.mode === "quiz") && !state.currentCategory
  );

  ["dictionary", "cards", "quiz", "kana"].forEach((m) => {
    const btn = document.getElementById(`mode-${m}`);
    const isActive = state.mode === m;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  document
    .getElementById("mode-pill")
    .setAttribute("data-pos", String(MODE_POS[state.mode] ?? 1));

  setChip("toggle-unlearned", state.filterUnlearnedOnly);
  setChip("shuffle-btn", state.shuffle);
  setChip("toggle-romaji", state.showRomaji);

  const search = document.getElementById("search-input");
  if (search.value !== state.searchQuery) search.value = state.searchQuery;
  document.getElementById("search-clear").classList.toggle("visible", state.searchQuery.length > 0);

  document.getElementById("theme-toggle").setAttribute(
    "aria-label",
    `Switch to ${state.theme === "dark" ? "light" : "dark"} mode`
  );
  document.documentElement.setAttribute("data-theme", state.theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", state.theme === "dark" ? "#1a0e08" : "#fff7ee");
}

/* Partial DOM update for a single card flip. Avoids the cost of
 * rebuilding the entire grid. Called from the click and keyboard
 * handlers in app.js. */
function updateCardFlip(cardEl, isLearned) {
  cardEl.classList.toggle("flipped", isLearned);
  cardEl.classList.toggle("is-learned", isLearned);
  const label = cardEl.getAttribute("aria-label") || "";
  cardEl.setAttribute(
    "aria-label",
    label.replace(/(Tap to reveal meaning\.|Marked learned\.)/, isLearned ? "Marked learned." : "Tap to reveal meaning.")
  );
}
