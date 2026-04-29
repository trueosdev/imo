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

let kanaLearnAdvanceTimer = null;

function clearKanaLearnAdvanceTimer() {
  if (kanaLearnAdvanceTimer != null) {
    clearTimeout(kanaLearnAdvanceTimer);
    kanaLearnAdvanceTimer = null;
  }
}

function beginKanaLearn() {
  clearKanaLearnAdvanceTimer();
  state.kanaLearn = {
    deck: buildNewKanaLearnSession(),
    idx: 0,
    correct: 0,
    missed: 0,
    feedbackFlash: null,
    echoInputCapture: undefined,
  };
  renderSection();
  requestAnimationFrame(() => {
    smoothScrollTo(document.getElementById("vocab"));
    document.getElementById("kana-learn-input")?.focus({ preventScroll: true });
  });
}

function exitKanaLearn() {
  clearKanaLearnAdvanceTimer();
  state.kanaLearn = null;
  renderSection();
}

function finalizeKanaLearnFeedbackAdvance() {
  const s = state.kanaLearn;
  kanaLearnAdvanceTimer = null;
  if (!s) return;
  s.feedbackFlash = null;
  s.echoInputCapture = undefined;
  s.idx += 1;
  renderSection();
  requestAnimationFrame(() =>
    document.getElementById("kana-learn-input")?.focus({ preventScroll: true })
  );
}

function submitKanaLearnAttempt() {
  const s = state.kanaLearn;
  if (!s || state.mode !== "kana" || s.feedbackFlash) return;
  const cur = s.deck[s.idx];
  if (!cur) return;
  const el = document.getElementById("kana-learn-input");
  const raw = el?.value ?? "";
  const ok = romajiMatchesExpected(cur.roma, raw);
  if (ok) {
    s.correct += 1;
    s.feedbackFlash = "ok";
    window.nativeHaptics?.();
  } else {
    s.missed += 1;
    s.feedbackFlash = "bad";
  }
  s.echoInputCapture = raw;
  renderSection();

  clearKanaLearnAdvanceTimer();
  const fast = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const delay = ok ? (fast ? 160 : 380) : (fast ? 420 : 760);
  kanaLearnAdvanceTimer = setTimeout(finalizeKanaLearnFeedbackAdvance, delay);
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
  /* Quiz "All" aggregates every category: reset clears learned progress everywhere
   * plus the quiz session. Single category: only that category's card progress. */
  if (state.currentCategory === "all") {
    ORDER.forEach((k) => {
      state.flippedByCategory[k] = new Set();
    });
  } else if (state.currentCategory) {
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
 * Dictionary: switching tabs does not scroll (stay at current viewport).
 * Kana: Start drill / Try again → scroll vocab (drill) into view after render.
 */
const goToast = document.getElementById("go-toast");
const catsEl = document.getElementById("cats");
const chipRowEl = document.querySelector(".toggle-row");
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
  attachLiquidHoverDelegated(chipRowEl, ".chip");

  const kanaLearnStartBtn = document.getElementById("kana-learn-start");
  if (kanaLearnStartBtn) kanaLearnStartBtn.addEventListener("click", () => beginKanaLearn());

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

    if (e.target.closest("#kana-learn-again")) {
      beginKanaLearn();
      return;
    }
    if (
      e.target.closest("#kana-learn-done") ||
      e.target.closest("#kana-learn-exit")
    ) {
      exitKanaLearn();
      return;
    }
  });

vocab.addEventListener("submit", (ev) => {
    if (ev.target?.id !== "kana-learn-form") return;
    ev.preventDefault();
    submitKanaLearnAttempt();
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
    state.kanaLearn = null;
    leavingQuizCleanup();
    renderCats();
    renderSection();
    hideGoToast();
  });
  document.getElementById("mode-cards").addEventListener("click", () => {
    state.mode = "cards";
    state.kanaLearn = null;
    leavingQuizCleanup();
    renderCats();
    renderSection();
    smoothScrollTo(catsEl);
  });
  document.getElementById("mode-quiz").addEventListener("click", () => {
    state.mode = "quiz";
    state.kanaLearn = null;
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
    const msg =
      state.currentCategory === "all"
        ? "Reset ALL learned progress (every category) and this quiz session?"
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

  const scrollTopBtn = document.getElementById("scroll-top-btn");
  if (scrollTopBtn) {
    const SCROLL_TOP_THRESHOLD = 120;
    function syncScrollTopBtn() {
      const y = window.scrollY ?? document.documentElement.scrollTop ?? 0;
      const show = y > SCROLL_TOP_THRESHOLD;
      scrollTopBtn.classList.toggle("is-visible", show);
      scrollTopBtn.setAttribute("aria-hidden", show ? "false" : "true");
      scrollTopBtn.tabIndex = show ? 0 : -1;
    }
    let scrollTopScheduled = false;
    window.addEventListener(
      "scroll",
      () => {
        if (scrollTopScheduled) return;
        scrollTopScheduled = true;
        requestAnimationFrame(() => {
          syncScrollTopBtn();
          scrollTopScheduled = false;
        });
      },
      { passive: true }
    );
    scrollTopBtn.addEventListener("click", () => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    });
    syncScrollTopBtn();
  }

  /* Keyboard shortcuts popover (#shortcut-toggle / #shortcut-panel): outside
   * pointer/tap closes; Escape closes; toggle click opens or closes explicitly. */
  const closeShortcutsWithEscapeFocus = (function attachShortcutsPopover() {
    const btn = document.getElementById("shortcut-toggle");
    const panel = document.getElementById("shortcut-panel");
    const wrap = btn?.closest(".shortcut-wrap");
    if (!btn || !panel || !wrap) return () => {};

    function closeShortcutPanel(restoreToggleFocusAfter) {
      if (panel.hidden) return;
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      if (restoreToggleFocusAfter) btn.focus({ preventScroll: true });
    }

    function maybeCloseOnOutsideClick(ev) {
      if (panel.hidden) return;
      const t = ev.target instanceof Node ? ev.target : null;
      if (!t || !wrap.contains(t)) closeShortcutPanel(false);
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!panel.hidden) {
        closeShortcutPanel(false);
        return;
      }
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => panel.focus({ preventScroll: true }));
    });

    /* Capture phase closes on full click outside; avoids pointerdown-outside +
     * click-end-on-toggle reopening in one gesture. */
    document.addEventListener("click", maybeCloseOnOutsideClick, true);

    attachLiquidHover(btn);

    return () => closeShortcutPanel(true);
  })();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.mode === "kana" && state.kanaLearn) {
      e.preventDefault();
      exitKanaLearn();
      return;
    }

    const panelEl = document.getElementById("shortcut-panel");
    if (e.key === "Escape" && panelEl && !panelEl.hidden) {
      e.preventDefault();
      closeShortcutsWithEscapeFocus();
      return;
    }

    if (e.target.matches("input, textarea")) return;
    if (state.mode === "kana" && state.kanaLearn) return;

    if (e.key === "/" && !e.metaKey && !e.ctrlKey && state.mode !== "quiz" && state.mode !== "cards") {
      e.preventDefault();
      search.focus();
    }
    if (e.key === "1") {
      state.mode = "dictionary";
      state.kanaLearn = null;
      leavingQuizCleanup();
      renderCats();
      renderSection();
    }
    if (e.key === "2") {
      state.mode = "cards";
      state.kanaLearn = null;
      leavingQuizCleanup();
      renderCats();
      renderSection();
    }
    if (e.key === "3") {
      state.mode = "quiz";
      state.kanaLearn = null;
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

/* Restore chrome transitions after hydration: defer until fonts settle (less FOUT on labels),
 * with a max wait so `.chrome-boot` never sticks. */
(function scheduleChromeBootRelease() {
  const releaseChromeBootMotion = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.documentElement.classList.remove("chrome-boot");
      });
    });
  };
  const hasFontLoadingApi =
    typeof document !== "undefined" &&
    document.fonts &&
    document.fonts.ready &&
    typeof document.fonts.ready.then === "function";
  Promise.race([
    hasFontLoadingApi ? document.fonts.ready : new Promise((r) => setTimeout(r, 450)),
    new Promise((r) => setTimeout(r, 2200)),
  ])
    .catch(() => {})
    .finally(() => releaseChromeBootMotion());
})();
