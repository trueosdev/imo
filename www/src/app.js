/* Event wiring + bootstrap. Depends on globals from data.js, state.js, render.js. */

function toggleFlip(idx, cardEl) {
  /* Cards mode never has "all" selected (the pseudo-category is quiz-only),
   * so we can safely use state.currentCategory directly here. */
  const set = state.flippedByCategory[state.currentCategory];
  const willBeLearned = !set.has(idx);
  if (willBeLearned) {
    window.nativeHaptics?.();
    set.add(idx);
    bumpToday();
  } else {
    set.delete(idx);
  }

  // If the "Only unlearned" filter is on AND we're hiding a card,
  // we need a full re-render so the card disappears.
  if (state.filterUnlearnedOnly && willBeLearned) {
    renderSection();
    return;
  }

  // Fast path: only mutate the affected card + progress.
  if (cardEl) updateCardFlip(cardEl, willBeLearned);
  updateProgress();
  saveState();
}

function pickNextQuestion() {
  const words = currentWordsFiltered();
  if (!words.length) return;
  let next;
  let tries = 0;
  do {
    next = words[Math.floor(Math.random() * words.length)];
    tries++;
  } while (words.length > 1 && next.index === state.quiz.lastWordIndex && tries < 6);
  state.quiz.lastWordIndex = next.index;
  state.quiz.currentWordIndex = next.index;
  state.quiz.options = buildOptions(next, words);
  state.quiz.selected = "";
  state.quiz.answered = false;
  renderSection();
}

function resetCategory() {
  /* In "all" mode we deliberately DON'T wipe every flippedByCategory set —
   * that would nuke the user's app-wide progress. Reset just clears the
   * quiz session score. For a real category, also clear its learned set. */
  if (state.currentCategory && state.currentCategory !== "all") {
    state.flippedByCategory[state.currentCategory] = new Set();
  }
  state.quiz = {
    currentWordIndex: -1,
    options: [],
    selected: "",
    answered: false,
    correct: 0,
    total: 0,
    lastWordIndex: -1,
  };
  renderSection();
}

/* ----- Guided-scroll helpers -----
 * The flow is:
 *   1. Click Cards/Quiz → scroll down to the category picker.
 *   2. Pick a category → "行きましょう！" toast slides up.
 *   3. Click toast (or scroll yourself) → land on the vocab section,
 *      and the toast auto-hides via IntersectionObserver.
 */
const goToast = document.getElementById("go-toast");
const catsEl = document.getElementById("cats");
const vocabEl = document.getElementById("vocab");

function smoothScrollTo(el) {
  if (!el) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

/* Heuristic: is the vocab section already substantially on-screen?
 * Used to avoid showing the toast (and its slide-in animation) when
 * the user is already looking at the cards/quiz. */
function isVocabInView() {
  if (!vocabEl) return false;
  const r = vocabEl.getBoundingClientRect();
  const h = window.innerHeight || document.documentElement.clientHeight;
  const visible = Math.min(r.bottom, h) - Math.max(r.top, 0);
  return visible > Math.min(h * 0.25, 240);
}

function showGoToast() {
  if (!goToast) return;
  if (isVocabInView()) return;
  goToast.classList.add("visible");
}
function hideGoToast() {
  if (!goToast) return;
  goToast.classList.remove("visible");
}

/* Liquidy mouse reactivity. JS sets normalized cursor offsets as CSS
 * custom properties on the hovered element and CSS does the magnet pull,
 * tilt, and gloss off them.
 *   --mx / --my : -1..1 horizontal/vertical offset from element center
 *   --mxp/ --myp: 0..100% cursor position (used by gloss radial-gradient)
 *   .is-tracking: present while the cursor is over the element
 */
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
function trackCursorOn(btn, ev) {
  const r = btn.getBoundingClientRect();
  const px = (ev.clientX - r.left) / r.width;
  const py = (ev.clientY - r.top) / r.height;
  btn.style.setProperty("--mx", (px * 2 - 1).toFixed(3));
  btn.style.setProperty("--my", (py * 2 - 1).toFixed(3));
  btn.style.setProperty("--mxp", (px * 100).toFixed(2) + "%");
  btn.style.setProperty("--myp", (py * 100).toFixed(2) + "%");
  if (!btn.classList.contains("is-tracking")) btn.classList.add("is-tracking");
}
function untrackCursor(btn) {
  if (!btn) return;
  btn.classList.remove("is-tracking");
  btn.style.removeProperty("--mx");
  btn.style.removeProperty("--my");
  btn.style.removeProperty("--mxp");
  btn.style.removeProperty("--myp");
}
/* Single-element variant: the element itself is the tracked target. */
function attachLiquidHover(el) {
  if (!el) return;
  el.addEventListener("pointermove", (e) => {
    if (REDUCED_MOTION.matches || e.pointerType === "touch") return;
    trackCursorOn(el, e);
  });
  el.addEventListener("pointerleave", () => untrackCursor(el));
}
/* Delegated variant: one listener on a wrap, tracks whichever child
 * matching `selector` the cursor is currently over. Survives re-renders
 * because the wrap never changes. */
function attachLiquidHoverDelegated(wrap, selector) {
  if (!wrap) return;
  let active = null;
  wrap.addEventListener("pointermove", (e) => {
    if (REDUCED_MOTION.matches || e.pointerType === "touch") return;
    const btn = e.target.closest(selector);
    if (!btn) {
      if (active) { untrackCursor(active); active = null; }
      return;
    }
    if (active && active !== btn) untrackCursor(active);
    active = btn;
    trackCursorOn(btn, e);
  });
  wrap.addEventListener("pointerleave", () => {
    if (active) { untrackCursor(active); active = null; }
  });
}
function setupCatLiquidHover() {
  attachLiquidHoverDelegated(catsEl, ".cat-btn");
}

function setupEvents() {
  catsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cat]");
    if (!btn) return;
    state.currentCategory = btn.dataset.cat;
    window.nativeHaptics?.();
    state.quiz.currentWordIndex = -1;
    state.quiz.lastWordIndex = -1;
    renderCats();
    renderSection();
    /* Dictionary / Kana don't use the category picker flow; toast is for
     * Cards / Quiz after picking a category. */
    if (state.mode === "cards" || state.mode === "quiz") showGoToast();
  });
  setupCatLiquidHover();

  const vocab = document.getElementById("vocab");
  vocab.addEventListener("click", (e) => {
    const speakEl = e.target.closest("[data-speak]");
    if (speakEl) {
      e.preventDefault();
      e.stopPropagation();
      speak(speakEl.dataset.speak);
      return;
    }

    const flipEl = e.target.closest("[data-flip]");
    if (flipEl) {
      toggleFlip(Number(flipEl.dataset.flip), flipEl);
      return;
    }

    const answerEl = e.target.closest("[data-answer]");
    if (answerEl && !state.quiz.answered) {
      state.quiz.selected = answerEl.dataset.answer;
      [...document.querySelectorAll(".answer-btn")].forEach((b) =>
        b.classList.toggle("selected", b.dataset.answer === state.quiz.selected)
      );
      const checkBtn = document.getElementById("check-answer");
      if (checkBtn) checkBtn.disabled = false;
      return;
    }
    if (e.target.closest("#check-answer") && !state.quiz.answered) {
      const words = currentWordsFiltered();
      const current = words.find((w) => w.index === state.quiz.currentWordIndex);
      if (!current || !state.quiz.selected) return;
      state.quiz.answered = true;
      state.quiz.total += 1;
      if (state.quiz.selected === current.en) {
        state.quiz.correct += 1;
        /* Each word carries its source catKey + origIdx so the right
         * per-category flipped set gets updated, even when the user is
         * in the "all" pseudo-category quiz pool. */
        const flipSet = state.flippedByCategory[current.catKey];
        if (!flipSet.has(current.origIdx)) bumpToday();
        flipSet.add(current.origIdx);
      }
      renderSection();
      return;
    }
    if (e.target.closest("#next-question")) {
      pickNextQuestion();
      return;
    }
  });

  vocab.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-flip]")) {
      e.preventDefault();
      toggleFlip(Number(e.target.dataset.flip), e.target);
    }
  });

  /* Switching out of Quiz: the "all" pseudo-category doesn't exist in
   * Cards or Dictionary, so reset it to null and let the user pick a real
   * one (which lands them in the welcome state with the cat picker visible). */
  function leavingQuizCleanup() {
    if (state.currentCategory === "all") state.currentCategory = null;
  }

  document.getElementById("mode-dictionary").addEventListener("click", () => {
    state.mode = "dictionary";
    leavingQuizCleanup();
    renderCats();
    renderSection();
    /* Dictionary always has content (every word) so jump right to it. */
    smoothScrollTo(vocabEl);
    hideGoToast();
  });
  document.getElementById("mode-cards").addEventListener("click", () => {
    state.mode = "cards";
    leavingQuizCleanup();
    renderCats();
    renderSection();
    smoothScrollTo(catsEl);
  });
  document.getElementById("mode-quiz").addEventListener("click", () => {
    state.mode = "quiz";
    renderCats();
    renderSection();
    /* If no category is picked yet there's nothing to quiz on,
     * so send them up to the categories like Cards does. */
    if (state.currentCategory) {
      smoothScrollTo(vocabEl);
      hideGoToast();
    } else {
      smoothScrollTo(catsEl);
    }
  });
  document.getElementById("mode-kana").addEventListener("click", () => {
    state.mode = "kana";
    leavingQuizCleanup();
    renderCats();
    renderSection();
    smoothScrollTo(vocabEl);
    hideGoToast();
  });

  const search = document.getElementById("search-input");
  search.addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    state.quiz.currentWordIndex = -1;
    document.getElementById("search-clear").classList.toggle("visible", state.searchQuery.length > 0);
    renderSection();
  });
  document.getElementById("search-clear").addEventListener("click", () => {
    state.searchQuery = "";
    search.value = "";
    document.getElementById("search-clear").classList.remove("visible");
    state.quiz.currentWordIndex = -1;
    renderSection();
    search.focus();
  });

  document.getElementById("toggle-unlearned").addEventListener("click", () => {
    state.filterUnlearnedOnly = !state.filterUnlearnedOnly;
    state.quiz.currentWordIndex = -1;
    renderSection();
  });
  document.getElementById("shuffle-btn").addEventListener("click", () => {
    state.shuffle = !state.shuffle;
    state.quiz.currentWordIndex = -1;
    renderSection();
  });
  document.getElementById("toggle-romaji").addEventListener("click", () => {
    state.showRomaji = !state.showRomaji;
    renderSection();
  });
  document.getElementById("reset-category").addEventListener("click", () => {
    const msg = state.currentCategory === "all"
      ? "Reset this quiz session's score?"
      : "Reset progress for this category?";
    if (confirm(msg)) resetCategory();
  });

  const themeToggle = document.getElementById("theme-toggle");
  themeToggle.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    syncControlStates();
    saveState();
  });
  attachLiquidHover(themeToggle);

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,textarea")) return;
    if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      search.focus();
    }
    if (e.key === "1") {
      state.mode = "dictionary";
      leavingQuizCleanup();
      renderCats();
      renderSection();
    }
    if (e.key === "2") {
      state.mode = "cards";
      leavingQuizCleanup();
      renderCats();
      renderSection();
    }
    if (e.key === "3") {
      state.mode = "quiz";
      renderCats();
      renderSection();
    }
    if (e.key === "4") {
      state.mode = "kana";
      leavingQuizCleanup();
      renderCats();
      renderSection();
    }
    if (state.mode === "quiz") {
      // A-D pick answers; digits 1–4 switch modes.
      const map = { a: 0, b: 1, c: 2, d: 3 };
      const k = e.key.toLowerCase();
      if (k in map && state.quiz.options[map[k]] !== undefined && !state.quiz.answered) {
        state.quiz.selected = state.quiz.options[map[k]];
        renderSection();
      }
      if (e.key === "Enter") document.getElementById("check-answer")?.click();
      if (e.key === "ArrowRight" || (e.key === "n" && state.quiz.answered)) {
        document.getElementById("next-question")?.click();
      }
    }
  });

  /* Toast click: jump down to the vocab section and hide the toast. */
  if (goToast) {
    goToast.addEventListener("click", () => {
      hideGoToast();
      smoothScrollTo(vocabEl);
    });
  }

  /* Auto-hide the toast when the user reaches the vocab section
   * (whether they got there via the toast or by scrolling manually). */
  if (vocabEl && "IntersectionObserver" in window) {
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) hideGoToast();
      },
      { threshold: 0.25 }
    );
    obs.observe(vocabEl);
  }
}

loadState();
setupEvents();
syncControlStates();
renderCats();
renderSection();
