// game.js — Fishdle
// Plain vanilla JS, no framework. Continuous round loop: load a species photo,
// guess it in 3 tries, see the result, auto-advance to the next.
//
// Data comes from data/species-<category>.json, produced by the local
// curation tool (curate/server.js) + scripts/export-game-data.js.

(function () {
  "use strict";

  const TOTAL_GUESSES = 3;
  const RESULT_AUTO_ADVANCE_MS = 4000;
  const CATEGORIES = {
    fish: { label: "Fishes", file: "data/species-fish.json" },
    herps: { label: "Herps", file: "data/species-herps.json" },
  };

  const PLACEHOLDER_IMAGE =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
        <rect width="100%" height="100%" fill="#e5e7eb"/>
        <text x="50%" y="50%" font-family="sans-serif" font-size="15"
          fill="#6b7280" text-anchor="middle" dominant-baseline="middle">
          No curated photo yet
        </text>
      </svg>`
    );

  // ---- DOM refs ----------------------------------------------------------
  const els = {
    categorySwitch: document.getElementById("category-switch"),
    loadError: document.getElementById("load-error"),
    gameBody: document.getElementById("game-body"),
    image: document.getElementById("fish-image"),
    photoCredit: document.getElementById("photo-credit"),
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
    lightbox: document.getElementById("lightbox"),
    lightboxImage: document.getElementById("lightbox-image"),
    lightboxCredit: document.getElementById("lightbox-credit"),
    lightboxClose: document.getElementById("lightbox-close"),
  };

  // ---- Session state ------------------------------------------------------
  // Scores are tracked per category so switching between Fishes and Herps
  // doesn't scramble a run. In memory only — resets on reload, by design.
  const session = {
    scores: {},
    flaggedImages: new Set(),
  };

  function scoreFor(category) {
    if (!session.scores[category]) {
      session.scores[category] = { streak: 0, correctCount: 0, totalRounds: 0 };
    }
    return session.scores[category];
  }

  const state = {
    category: "fish",
    loaded: {},
    allSpecies: [],
    previousSpeciesId: null,
    currentSpecies: null,
    currentImage: null,
    guessesRemaining: TOTAL_GUESSES,
    hintsRevealed: 0,
    roundOver: false,
    advanceTimer: null,
  };

  // ---- Autocomplete -------------------------------------------------------
  // Hand-rolled rather than a native <datalist>: datalist popups can't be
  // styled (unreadable in some browsers) and collide with OS autofill.
  const autocomplete = { matches: [], activeIndex: -1, open: false };

  // Prefix matching only: typing "B" lists everything starting with B, then
  // "Bi" narrows to Bigmouth… — the list only ever gets shorter as you type.
  // An empty query matches nothing, so the dropdown stays shut until you type.
  function filterSpecies(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return state.allSpecies
      .filter((s) => s.commonName.toLowerCase().startsWith(q))
      // Alphabetical: the underlying list is in taxonomic order, which reads
      // as random when you're scanning a dozen suggestions.
      .sort((a, b) => a.commonName.localeCompare(b.commonName));
  }

  function renderSuggestions() {
    els.suggestions.innerHTML = "";
    autocomplete.matches.forEach((species, index) => {
      const li = document.createElement("li");
      li.textContent = species.commonName;
      li.setAttribute("role", "option");
      if (index === autocomplete.activeIndex) li.classList.add("active");
      li.addEventListener("mousedown", (e) => {
        e.preventDefault(); // fire before the input's blur
        selectSuggestion(index);
      });
      els.suggestions.appendChild(li);
    });
  }

  function openSuggestions(query) {
    if (state.roundOver) return;
    autocomplete.matches = filterSpecies(query);
    autocomplete.activeIndex = -1;
    if (autocomplete.matches.length === 0) return closeSuggestions();
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
    autocomplete.activeIndex = (autocomplete.activeIndex + delta + count) % count;
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
      state.allSpecies.find((s) => s.commonName.toLowerCase() === normalized) ||
      null
    );
  }

  // ---- Data loading -------------------------------------------------------
  async function loadCategory(category) {
    if (state.loaded[category]) return state.loaded[category];
    const res = await fetch(CATEGORIES[category].file, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to load ${CATEGORIES[category].file} (${res.status})`);
    }
    const data = await res.json();
    state.loaded[category] = data.species || [];
    return state.loaded[category];
  }

  // ---- Helpers ------------------------------------------------------------
  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function getRandomSpecies(excludeId) {
    const playable = state.allSpecies.filter((s) => getUsableImages(s).length > 0);
    const pool = playable.length > 0 ? playable : state.allSpecies;
    const candidates =
      pool.length > 1 ? pool.filter((s) => s.id !== excludeId) : pool;
    return pickRandom(candidates.length > 0 ? candidates : pool);
  }

  // Usable = curated for this species and not flagged during this session.
  function getUsableImages(species) {
    return (species.images || []).filter(
      (img) => !session.flaggedImages.has(img.url)
    );
  }

  function getImageForSpecies(species) {
    const usable = getUsableImages(species);
    if (usable.length > 0) return pickRandom(usable);
    if (species.images && species.images.length > 0) {
      return pickRandom(species.images);
    }
    return null;
  }

  function setImage(image) {
    state.currentImage = image;
    els.image.src = image ? image.url : PLACEHOLDER_IMAGE;
    els.photoCredit.textContent = image && image.attribution ? image.attribution : "";
    closeLightbox();
  }

  // ---- Photo lightbox -----------------------------------------------------
  // iNaturalist serves several sizes off the same path; the curated URLs are
  // the "large" ones, so ask for the original when zooming and fall back to
  // the large file if that size isn't there.
  function fullSizeUrl(url) {
    return url.replace(/\/large\.(jpe?g|png)(\?.*)?$/i, "/original.$1$2");
  }

  function openLightbox() {
    const image = state.currentImage;
    if (!image || !image.url) return;

    // A photo left open shouldn't get swapped out from under the viewer.
    if (state.advanceTimer) {
      clearTimeout(state.advanceTimer);
      state.advanceTimer = null;
    }

    const large = image.url;
    els.lightboxImage.onerror = () => {
      els.lightboxImage.onerror = null;
      els.lightboxImage.src = large;
    };
    els.lightboxImage.src = fullSizeUrl(large);
    els.lightboxCredit.textContent = image.attribution || "";
    els.lightbox.classList.remove("hidden");
    els.lightboxClose.focus();
  }

  function closeLightbox() {
    if (els.lightbox.classList.contains("hidden")) return;
    els.lightbox.classList.add("hidden");
    els.lightboxImage.onerror = null;
    els.lightboxImage.removeAttribute("src");
  }

  function lightboxOpen() {
    return !els.lightbox.classList.contains("hidden");
  }

  // Flagging hides a photo for the session and logs it for permanent removal.
  function flagCurrentImage() {
    const image = state.currentImage;
    if (!image) return;
    session.flaggedImages.add(image.url);
    console.log(
      `[Fishdle] Flagged photo for "${state.currentSpecies.commonName}":\n  ${image.url}\n` +
        `Reject it in the curation tool (curate/server.js) to remove it permanently.`
    );
    els.flagBtn.textContent = "🚩 Flagged";
    els.flagBtn.disabled = true;

    const replacement = getImageForSpecies(state.currentSpecies);
    if (replacement && replacement.url !== image.url) setImage(replacement);
  }

  function updateScoreDisplay() {
    const s = scoreFor(state.category);
    els.streak.textContent = `Streak: ${s.streak}`;
    els.score.textContent = `${s.correctCount} / ${s.totalRounds} correct`;
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

  // ---- Round lifecycle ----------------------------------------------------
  function startNewRound() {
    if (state.advanceTimer) {
      clearTimeout(state.advanceTimer);
      state.advanceTimer = null;
    }

    const species = getRandomSpecies(state.previousSpeciesId);
    state.currentSpecies = species;
    setImage(getImageForSpecies(species));
    state.guessesRemaining = TOTAL_GUESSES;
    state.hintsRevealed = 0;
    state.roundOver = false;

    els.image.alt = "Mystery species — guess it";
    els.hints.innerHTML = "";
    els.history.innerHTML = "";
    clearFeedback();
    updateGuessesRemainingDisplay();

    els.resultPanel.classList.add("hidden");
    els.input.value = "";
    els.input.disabled = false;
    els.submitBtn.disabled = false;
    els.flagBtn.disabled = false;
    els.flagBtn.textContent = "🚩 Flag photo";
    closeSuggestions();
    document.removeEventListener("keydown", advanceOnKeydown);

    els.input.focus();
  }

  function endRound(correct) {
    state.roundOver = true;
    const s = scoreFor(state.category);
    s.totalRounds += 1;
    if (correct) {
      s.correctCount += 1;
      s.streak += 1;
    } else {
      s.streak = 0;
    }
    updateScoreDisplay();

    const species = state.currentSpecies;
    const guessesUsed = TOTAL_GUESSES - state.guessesRemaining;

    els.input.disabled = true;
    els.submitBtn.disabled = true;
    closeSuggestions();

    els.resultPanel.classList.remove("hidden");
    els.resultText.className = correct ? "correct" : "incorrect";
    els.resultText.textContent = correct
      ? `✅ Correct! ${species.commonName} (${species.sciName}) — in ${guessesUsed} ${guessesUsed === 1 ? "try" : "tries"}.`
      : `❌ Out of guesses. It was the ${species.commonName} (${species.sciName}).`;

    state.previousSpeciesId = species.id;
    state.advanceTimer = setTimeout(startNewRound, RESULT_AUTO_ADVANCE_MS);
    document.addEventListener("keydown", advanceOnKeydown);
  }

  function advanceOnKeydown() {
    if (lightboxOpen()) return;
    startNewRound();
  }

  function handleGuessSubmit(event) {
    event.preventDefault();
    if (state.roundOver) return;

    const matched = findSpeciesByCommonName(els.input.value);
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

    if (isCorrect) return endRound(true);

    state.guessesRemaining -= 1;
    updateGuessesRemainingDisplay();

    if (state.guessesRemaining <= 0) {
      revealNextHint();
      return endRound(false);
    }

    revealNextHint();
    showFeedback("Not quite — here's another hint.", "not-quite");
    els.input.value = "";
    els.input.focus();
  }

  // ---- Category switching -------------------------------------------------
  async function switchCategory(category) {
    if (!CATEGORIES[category]) return;
    state.category = category;
    els.categorySwitch.querySelectorAll("button").forEach((b) =>
      b.classList.toggle("active", b.dataset.category === category)
    );

    try {
      state.allSpecies = await loadCategory(category);
    } catch (err) {
      console.error(err);
      return showLoadError(
        `Couldn't load ${CATEGORIES[category].file}. ` +
          `Run <code>node scripts/export-game-data.js</code> after curating photos, ` +
          `and serve the site over http:// rather than opening the file directly.`
      );
    }

    if (state.allSpecies.length < 2) {
      return showLoadError(
        `<strong>${CATEGORIES[category].label}</strong> has ${state.allSpecies.length} curated species — ` +
          `at least 2 are needed to play.<br><br>Curate photos with ` +
          `<code>node curate/server.js</code>, then run ` +
          `<code>node scripts/export-game-data.js</code>.`
      );
    }

    hideLoadError();
    state.previousSpeciesId = null;
    updateScoreDisplay();
    startNewRound();
  }

  function showLoadError(html) {
    els.loadError.innerHTML = html;
    els.loadError.classList.remove("hidden");
    els.gameBody.classList.add("hidden");
  }

  function hideLoadError() {
    els.loadError.classList.add("hidden");
    els.gameBody.classList.remove("hidden");
  }

  // ---- Wire up & boot -----------------------------------------------------
  els.form.addEventListener("submit", handleGuessSubmit);
  els.nextFishBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    startNewRound();
  });
  els.flagBtn.addEventListener("click", flagCurrentImage);

  els.image.addEventListener("click", openLightbox);
  // Clicking the backdrop (but not the photo itself) dismisses.
  els.lightbox.addEventListener("click", (e) => {
    if (e.target !== els.lightboxImage) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightboxOpen()) {
      e.stopPropagation();
      closeLightbox();
    }
  }, true);

  els.categorySwitch.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => switchCategory(btn.dataset.category));
  });

  // Only typing opens the dropdown — focusing the empty box should not.
  els.input.addEventListener("input", () => openSuggestions(els.input.value));
  els.input.addEventListener("blur", () => {
    // Delay so a mousedown on a suggestion still registers.
    setTimeout(closeSuggestions, 120);
  });

  els.input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      // Reopen only if there's something typed — never an empty full list.
      if (!autocomplete.open) {
        if (els.input.value.trim()) openSuggestions(els.input.value);
      } else {
        moveActive(1);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Enter") {
      if (autocomplete.open && autocomplete.activeIndex >= 0) {
        e.preventDefault();
        selectSuggestion(autocomplete.activeIndex);
      }
    } else if (e.key === "Escape") {
      closeSuggestions();
    }
  });

  switchCategory("fish");
})();
