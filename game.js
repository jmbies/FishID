// game.js — Fishdle
// Plain vanilla JS, no framework. Continuous round loop: load a fish, guess
// it in 3 tries, see the result, auto-advance to the next fish.

(function () {
  "use strict";

  const TOTAL_GUESSES = 3;
  const RESULT_AUTO_ADVANCE_MS = 4000;

  // A tiny inline placeholder so the game still "runs" before
  // scripts/fetch-images.js has been used to populate species.json.
  const PLACEHOLDER_IMAGE =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
        <rect width="100%" height="100%" fill="#e5e7eb"/>
        <text x="50%" y="50%" font-family="sans-serif" font-size="16"
          fill="#6b7280" text-anchor="middle" dominant-baseline="middle">
          No image yet — run scripts/fetch-images.js
        </text>
      </svg>`
    );

  // ---- DOM refs ----------------------------------------------------------
  const els = {
    image: document.getElementById("fish-image"),
    guessesRemaining: document.getElementById("guesses-remaining"),
    hints: document.getElementById("hints"),
    form: document.getElementById("guess-form"),
    input: document.getElementById("guess-input"),
    suggestions: document.getElementById("suggestion-list"),
    submitBtn: document.getElementById("guess-submit"),
    flagBtn: document.getElementById("flag-photo-btn"),
    feedback: document.getElementById("feedback"),
    history: document.getElementById("guess-history"),
    resultPanel: document.getElementById("result-panel"),
    resultText: document.getElementById("result-text"),
    nextFishBtn: document.getElementById("next-fish-btn"),
    streak: document.getElementById("streak"),
    score: document.getElementById("score"),
  };

  // ---- Session state ------------------------------------------------------
  const session = {
    streak: 0,
    correctCount: 0,
    totalRounds: 0,
    // Photos the player flagged as poor quality this session — skipped for
    // the rest of the session (in-memory only, like streak/score).
    flaggedImages: new Set(),
  };

  const state = {
    allSpecies: [],
    previousSpeciesId: null,
    currentSpecies: null,
    currentImage: PLACEHOLDER_IMAGE,
    guessesRemaining: TOTAL_GUESSES,
    hintsRevealed: 0,
    roundOver: false,
    advanceTimer: null,
  };

  // ---- Autocomplete -------------------------------------------------------
  // A hand-rolled dropdown rather than a native <datalist>: datalist popups
  // can't be styled (unreadable in some browsers) and collide with the OS
  // autofill menu. This owns its own markup, so it's fully themeable.
  const autocomplete = {
    matches: [],
    activeIndex: -1,
    open: false,
  };

  function filterSpecies(query) {
    const q = query.trim().toLowerCase();
    if (!q) return state.allSpecies.slice();
    // Prefix matches first, then any substring match.
    const prefix = [];
    const substring = [];
    for (const s of state.allSpecies) {
      const name = s.commonName.toLowerCase();
      if (name.startsWith(q)) prefix.push(s);
      else if (name.includes(q)) substring.push(s);
    }
    return prefix.concat(substring);
  }

  function renderSuggestions() {
    els.suggestions.innerHTML = "";
    autocomplete.matches.forEach((species, index) => {
      const li = document.createElement("li");
      li.textContent = species.commonName;
      li.setAttribute("role", "option");
      li.dataset.speciesId = species.id;
      if (index === autocomplete.activeIndex) li.classList.add("active");
      li.addEventListener("mousedown", (e) => {
        // mousedown (not click) so it fires before the input's blur.
        e.preventDefault();
        selectSuggestion(index);
      });
      els.suggestions.appendChild(li);
    });
  }

  function openSuggestions(query) {
    if (state.roundOver) return;
    autocomplete.matches = filterSpecies(query);
    autocomplete.activeIndex = -1;
    if (autocomplete.matches.length === 0) {
      closeSuggestions();
      return;
    }
    autocomplete.open = true;
    els.suggestions.classList.remove("hidden");
    els.input.setAttribute("aria-expanded", "true");
    renderSuggestions();
  }

  function closeSuggestions() {
    autocomplete.open = false;
    autocomplete.activeIndex = -1;
    els.suggestions.classList.add("hidden");
    els.input.setAttribute("aria-expanded", "false");
  }

  function moveActive(delta) {
    if (!autocomplete.open || autocomplete.matches.length === 0) return;
    const count = autocomplete.matches.length;
    autocomplete.activeIndex =
      (autocomplete.activeIndex + delta + count) % count;
    renderSuggestions();
  }

  function selectSuggestion(index) {
    const species = autocomplete.matches[index];
    if (!species) return;
    els.input.value = species.commonName;
    closeSuggestions();
    els.input.focus();
  }

  function findSpeciesByCommonName(text) {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return null;
    return (
      state.allSpecies.find(
        (s) => s.commonName.toLowerCase() === normalized
      ) || null
    );
  }

  // ---- Data loading ---------------------------------------------------------
  async function loadSpeciesData() {
    const res = await fetch("species.json", { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to load species.json (${res.status})`);
    }
    const data = await res.json();
    return data.species || [];
  }

  // ---- Helpers --------------------------------------------------------------
  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function getRandomSpecies(excludeId) {
    const candidates =
      state.allSpecies.length > 1
        ? state.allSpecies.filter((s) => s.id !== excludeId)
        : state.allSpecies;
    return pickRandom(candidates);
  }

  // Usable = in "images", not in the curated "excludedImages" list, and not
  // flagged during this session.
  function getUsableImages(species) {
    const excluded = new Set(species.excludedImages || []);
    return (species.images || []).filter(
      (url) => !excluded.has(url) && !session.flaggedImages.has(url)
    );
  }

  function getImageForSpecies(species) {
    const usable = getUsableImages(species);
    if (usable.length > 0) return pickRandom(usable);
    // Everything's been flagged away this session — fall back to the full
    // list rather than showing nothing.
    if (species.images && species.images.length > 0) {
      return pickRandom(species.images);
    }
    return PLACEHOLDER_IMAGE;
  }

  // Flagging a photo hides it for the rest of the session and logs the URL
  // to the console so it can be pasted into species.json's "excludedImages".
  function flagCurrentImage() {
    const url = state.currentImage;
    if (!url || url === PLACEHOLDER_IMAGE) return;
    session.flaggedImages.add(url);
    console.log(
      `[Fishdle] Flagged poor-quality photo for "${state.currentSpecies.commonName}":\n  ${url}\n` +
        `Add it to that species' "excludedImages" array in species.json to exclude it permanently.`
    );
    els.flagBtn.textContent = "🚩 Flagged — thanks!";
    els.flagBtn.disabled = true;

    // Swap in a different photo for the same species so the round continues.
    const replacement = getImageForSpecies(state.currentSpecies);
    if (replacement !== url) {
      state.currentImage = replacement;
      els.image.src = replacement;
    }
  }

  function updateScoreDisplay() {
    els.streak.textContent = `Streak: ${session.streak}`;
    els.score.textContent = `${session.correctCount} / ${session.totalRounds} correct`;
  }

  function updateGuessesRemainingDisplay() {
    const n = state.guessesRemaining;
    els.guessesRemaining.textContent = `${n} guess${n === 1 ? "" : "es"} left`;
  }

  function clearFeedback() {
    els.feedback.textContent = "";
    els.feedback.className = "feedback";
  }

  function showFeedback(message, kind) {
    els.feedback.textContent = message;
    els.feedback.className = `feedback ${kind || ""}`.trim();
  }

  function addHistoryRow(guessText, correct) {
    const li = document.createElement("li");
    li.textContent = guessText;
    li.className = correct ? "correct" : "wrong";
    els.history.appendChild(li);
  }

  function revealNextHint() {
    const species = state.currentSpecies;
    if (!species || !species.hints) return;
    const hintText = species.hints[state.hintsRevealed];
    state.hintsRevealed += 1;
    if (!hintText) return; // hint not written yet — skip silently
    const div = document.createElement("div");
    div.className = "hint";
    div.textContent = `Hint: ${hintText}`;
    els.hints.appendChild(div);
  }

  // ---- Round lifecycle --------------------------------------------------------
  function startNewRound() {
    if (state.advanceTimer) {
      clearTimeout(state.advanceTimer);
      state.advanceTimer = null;
    }

    const species = getRandomSpecies(state.previousSpeciesId);
    state.currentSpecies = species;
    state.currentImage = getImageForSpecies(species);
    state.guessesRemaining = TOTAL_GUESSES;
    state.hintsRevealed = 0;
    state.roundOver = false;

    els.image.src = state.currentImage;
    els.image.alt = "Mystery fish — guess the species";
    els.hints.innerHTML = "";
    els.history.innerHTML = "";
    clearFeedback();
    updateGuessesRemainingDisplay();

    els.resultPanel.classList.add("hidden");
    els.input.value = "";
    els.input.disabled = false;
    els.submitBtn.disabled = false;
    els.flagBtn.disabled = false;
    els.flagBtn.textContent = "🚩 Flag this photo as poor quality";
    closeSuggestions();
    document.removeEventListener("keydown", advanceOnKeydown);

    els.input.focus();
  }

  function endRound(correct) {
    state.roundOver = true;
    session.totalRounds += 1;
    if (correct) {
      session.correctCount += 1;
      session.streak += 1;
    } else {
      session.streak = 0;
    }
    updateScoreDisplay();

    const species = state.currentSpecies;
    const guessesUsed = TOTAL_GUESSES - state.guessesRemaining;

    els.input.disabled = true;
    els.submitBtn.disabled = true;
    closeSuggestions();

    els.resultPanel.classList.remove("hidden");
    els.resultText.className = correct ? "correct" : "incorrect";
    if (correct) {
      els.resultText.textContent = `✅ Correct! It's the ${species.commonName} (${species.sciName}) — guessed in ${guessesUsed} ${
        guessesUsed === 1 ? "try" : "tries"
      }.`;
    } else {
      els.resultText.textContent = `❌ Out of guesses. It was the ${species.commonName} (${species.sciName}).`;
    }

    state.previousSpeciesId = species.id;

    // Auto-advance after a short delay, but let the player skip ahead with a
    // click or keypress too.
    state.advanceTimer = setTimeout(() => {
      startNewRound();
    }, RESULT_AUTO_ADVANCE_MS);

    document.addEventListener("keydown", advanceOnKeydown);
  }

  function advanceOnKeydown() {
    startNewRound();
  }

  function handleGuessSubmit(event) {
    event.preventDefault();
    if (state.roundOver) return;

    const rawValue = els.input.value;
    const matched = findSpeciesByCommonName(rawValue);

    if (!matched) {
      showFeedback(
        "Pick a species from the suggestion list to submit a guess.",
        "no-match"
      );
      return;
    }

    closeSuggestions();
    clearFeedback();

    const isCorrect = matched.id === state.currentSpecies.id;
    addHistoryRow(matched.commonName, isCorrect);

    if (isCorrect) {
      endRound(true);
      return;
    }

    state.guessesRemaining -= 1;
    updateGuessesRemainingDisplay();

    if (state.guessesRemaining <= 0) {
      revealNextHint();
      endRound(false);
      return;
    }

    revealNextHint();
    showFeedback("Not quite — here's another hint.", "not-quite");
    els.input.value = "";
    els.input.focus();
  }

  // ---- Wire up & boot -----------------------------------------------------
  els.form.addEventListener("submit", handleGuessSubmit);

  els.nextFishBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    startNewRound();
  });

  els.flagBtn.addEventListener("click", flagCurrentImage);

  els.input.addEventListener("input", () => {
    openSuggestions(els.input.value);
  });

  els.input.addEventListener("focus", () => {
    openSuggestions(els.input.value);
  });

  els.input.addEventListener("blur", () => {
    // Delay so a mousedown on a suggestion still registers.
    setTimeout(closeSuggestions, 120);
  });

  els.input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!autocomplete.open) openSuggestions(els.input.value);
      else moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Enter") {
      // If a suggestion is highlighted, Enter picks it instead of submitting.
      if (autocomplete.open && autocomplete.activeIndex >= 0) {
        e.preventDefault();
        selectSuggestion(autocomplete.activeIndex);
      }
    } else if (e.key === "Escape") {
      closeSuggestions();
    }
  });

  async function init() {
    try {
      state.allSpecies = await loadSpeciesData();
    } catch (err) {
      showFeedback(
        "Couldn't load species.json. Are you running this from a local server?",
        "no-match"
      );
      console.error(err);
      return;
    }

    if (state.allSpecies.length === 0) {
      showFeedback("species.json has no species entries.", "no-match");
      return;
    }

    updateScoreDisplay();
    startNewRound();
  }

  init();
})();
