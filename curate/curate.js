// curate.js — front-end for the local photo curation tool.
// Talks only to curate/server.js on localhost; never deployed.

(function () {
  "use strict";

  const els = {
    tabs: document.getElementById("category-tabs"),
    filter: document.getElementById("card-filter"),
    hideDone: document.getElementById("hide-done"),
    placeNote: document.getElementById("place-note"),
    cardList: document.getElementById("card-list"),
    emptyState: document.getElementById("empty-state"),
    workspace: document.getElementById("workspace"),
    cardTitle: document.getElementById("card-title"),
    cardSci: document.getElementById("card-sci"),
    approvedCount: document.getElementById("approved-count"),
    targetCount: document.getElementById("target-count"),
    progressFill: document.getElementById("progress-fill"),
    reviewBanner: document.getElementById("review-banner"),
    reviewText: document.getElementById("review-text"),
    taxonPicker: document.getElementById("taxon-picker"),
    taxonSearch: document.getElementById("taxon-search"),
    confirmTaxonBtn: document.getElementById("confirm-taxon-btn"),
    modeSwitch: document.getElementById("mode-switch"),
    widenSelect: document.getElementById("widen-select"),
    scopeHint: document.getElementById("scope-hint"),
    approvedStrip: document.getElementById("approved-strip"),
    candidates: document.getElementById("candidates"),
    loading: document.getElementById("loading"),
    loadMore: document.getElementById("load-more"),
  };

  const state = {
    category: "fish",
    target: 20,
    cards: [],
    activeCardId: null,
    activeCard: null,
    mode: "photos",
    widen: 0,
    page: 1,
    items: [],
    approved: [],
    focusIndex: 0,
    lastDecision: null,
  };

  const api = {
    async get(path, params) {
      const url = new URL(path, location.origin);
      Object.entries(params || {}).forEach(([k, v]) =>
        url.searchParams.set(k, v)
      );
      const res = await fetch(url);
      return { ok: res.ok, status: res.status, data: await res.json() };
    },
    async post(path, body) {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { ok: res.ok, status: res.status, data: await res.json() };
    },
  };

  // ---- Sidebar -------------------------------------------------------------

  async function loadCategories() {
    const { data } = await api.get("/api/categories");
    state.target = data.targetPerSpecies;
    els.targetCount.textContent = data.targetPerSpecies;
    els.placeNote.textContent = `Observations limited to ${data.placeLabel}`;
    els.tabs.innerHTML = "";
    data.categories.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.textContent = `${c.label} (${c.count})`;
      btn.dataset.key = c.key;
      if (i === 0) {
        btn.classList.add("active");
        state.category = c.key;
      }
      btn.addEventListener("click", () => {
        els.tabs.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.category = c.key;
        state.activeCardId = null;
        els.workspace.classList.add("hidden");
        els.emptyState.classList.remove("hidden");
        loadCards();
      });
      els.tabs.appendChild(btn);
    });
  }

  async function loadCards() {
    const { data } = await api.get("/api/cards", { category: state.category });
    state.cards = data.cards || [];
    renderCards();
  }

  function renderCards() {
    const filter = els.filter.value.trim().toLowerCase();
    const hideDone = els.hideDone.checked;
    els.cardList.innerHTML = "";

    let lastGroup = null;
    for (const card of state.cards) {
      if (filter && !card.commonName.toLowerCase().includes(filter)) continue;
      const done = card.approvedCount >= state.target;
      if (hideDone && done) continue;

      if (card.group !== lastGroup) {
        const h = document.createElement("li");
        h.className = "group-header";
        h.textContent = card.group;
        els.cardList.appendChild(h);
        lastGroup = card.group;
      }

      const li = document.createElement("li");
      li.className = "card-item";
      if (done) li.classList.add("done");
      if (card.id === state.activeCardId) li.classList.add("active");

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = card.commonName;
      if (card.needsReview) {
        const flag = document.createElement("span");
        flag.className = "flag";
        flag.textContent = " ⚠";
        flag.title = card.reviewReason || "Needs taxon review";
        name.appendChild(flag);
      }

      const count = document.createElement("span");
      count.className = "count";
      count.textContent = `${card.approvedCount}/${state.target}`;

      li.append(name, count);
      li.addEventListener("click", () => selectCard(card.id));
      els.cardList.appendChild(li);
    }
  }

  // ---- Workspace -----------------------------------------------------------

  async function selectCard(cardId) {
    state.activeCardId = cardId;
    state.activeCard = state.cards.find((c) => c.id === cardId);
    state.page = 1;
    state.items = [];
    state.focusIndex = 0;
    state.mode = "photos";
    state.widen = 0;
    els.widenSelect.value = "0";
    els.modeSwitch.querySelectorAll("button").forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === "photos")
    );
    // The audio tab only makes sense for species that actually call.
    els.modeSwitch.classList.toggle("hidden", !state.activeCard.hasCall);

    els.emptyState.classList.add("hidden");
    els.workspace.classList.remove("hidden");
    els.cardTitle.textContent = state.activeCard.commonName;
    els.cardSci.textContent = state.activeCard.sciName || "(no taxon assigned)";
    renderCards();
    renderReviewBanner();
    await loadCandidates(true);
  }

  function renderReviewBanner() {
    const card = state.activeCard;
    if (!card.needsReview) {
      els.reviewBanner.classList.add("hidden");
      return;
    }
    els.reviewBanner.classList.remove("hidden");
    els.reviewText.textContent = card.reviewReason || "Confirm the taxon for this card.";
    els.taxonPicker.innerHTML = "";
    els.taxonSearch.value = "";
    // Candidates from the resolver, if any, get offered as one-click picks.
    fetchTaxonOptions(card.sciName || card.commonName);
  }

  async function fetchTaxonOptions(query) {
    if (!query) return;
    const { data } = await api.get("/api/taxon-search", { q: query });
    renderTaxonOptions(data.results || []);
  }

  function renderTaxonOptions(results) {
    els.taxonPicker.innerHTML = "";
    results.forEach((r) => {
      const div = document.createElement("div");
      div.className = "taxon-option";
      const left = document.createElement("span");
      left.className = "tname";
      left.textContent = r.name;
      const right = document.createElement("span");
      right.className = "tmeta";
      right.textContent = `${r.rank} · ${r.commonName || "—"} · ${r.observationCount.toLocaleString()} obs`;
      div.append(left, right);
      div.addEventListener("click", async () => {
        await api.post("/api/assign-taxon", {
          category: state.category,
          cardId: state.activeCardId,
          taxonId: r.id,
          sciName: r.name,
          commonName: r.commonName,
        });
        state.activeCard.taxonId = r.id;
        state.activeCard.sciName = r.name;
        state.activeCard.needsReview = false;
        els.cardSci.textContent = r.name;
        els.reviewBanner.classList.add("hidden");
        await loadCards();
        renderCards();
        state.page = 1;
        await loadCandidates(true);
      });
      els.taxonPicker.appendChild(div);
    });
  }

  let searchTimer = null;
  els.taxonSearch.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = els.taxonSearch.value.trim();
    if (q.length < 3) return;
    searchTimer = setTimeout(() => fetchTaxonOptions(q), 350);
  });

  els.confirmTaxonBtn.addEventListener("click", async () => {
    await api.post("/api/confirm", {
      category: state.category,
      cardId: state.activeCardId,
    });
    state.activeCard.needsReview = false;
    els.reviewBanner.classList.add("hidden");
    await loadCards();
    renderCards();
  });

  els.modeSwitch.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      els.modeSwitch.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.mode = btn.dataset.mode;
      state.page = 1;
      state.focusIndex = 0;
      await loadCandidates(true);
    });
  });

  // ---- Candidates ----------------------------------------------------------

  async function loadCandidates(reset) {
    els.loading.classList.remove("hidden");
    if (reset) {
      state.items = [];
      els.candidates.innerHTML = "";
    }

    const { ok, status, data } = await api.get("/api/candidates", {
      category: state.category,
      id: state.activeCardId,
      page: state.page,
      sounds: state.mode === "sounds",
      widen: state.widen,
    });
    els.loading.classList.add("hidden");

    if (!ok) {
      if (status === 409) {
        // No taxon assigned yet — the review banner is already showing.
        els.candidates.innerHTML =
          '<p style="color:var(--muted)">Assign a taxon above to load candidates.</p>';
        return;
      }
      els.candidates.innerHTML = `<p style="color:var(--reject)">${data.error || "Failed to load"}</p>`;
      return;
    }

    // iNaturalist's votes ordering isn't a stable sort, so the same photo can
    // land on two different pages. Drop anything already on screen.
    const seen = new Set(state.items.map((i) => i.photoId || i.soundId));
    const fresh = (data.items || []).filter(
      (i) => !seen.has(i.photoId || i.soundId)
    );

    state.items = state.items.concat(fresh);
    state.approved = state.mode === "sounds" ? data.sounds || [] : data.approved || [];
    renderApprovedStrip();
    renderCandidates(fresh);
    updateProgress();
    updateScopeHint(data.totalResults);

    const pagesExhausted = state.page * 50 >= data.totalResults;
    els.loadMore.classList.toggle("hidden", pagesExhausted);

    // If a whole page deduped down to nothing but more pages remain, roll on
    // to the next one so the button never appears to do nothing.
    if (fresh.length === 0 && !pagesExhausted && (data.items || []).length > 0) {
      state.page++;
      return loadCandidates(false);
    }
    if (fresh.length === 0 && pagesExhausted) {
      els.scopeHint.textContent =
        "No more candidates at this scope — try widening the search scope above.";
    }
  }

  function renderCandidates(newItems) {
    newItems.forEach((item) => {
      const div = document.createElement("div");
      div.className = "candidate";
      div.dataset.itemId = item.photoId || item.soundId;

      if (state.mode === "sounds") {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.preload = "none";
        audio.src = item.url;
        div.appendChild(audio);
      } else {
        const img = document.createElement("img");
        img.src = item.url;
        img.loading = "lazy";
        img.alt = "";
        img.addEventListener("click", () => openLightbox(item.url));
        div.appendChild(img);
      }

      const meta = document.createElement("div");
      meta.className = "meta";
      const link = document.createElement("a");
      link.href = item.obsUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = item.place || `obs ${item.obsId}`;
      meta.append(link);
      meta.append(
        document.createTextNode(
          ` · ${item.observedOn || "no date"} · ${item.license.toUpperCase()}`
        )
      );
      div.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "actions";
      const approve = document.createElement("button");
      approve.className = "approve";
      approve.textContent = "✓ Approve";
      approve.addEventListener("click", () => decide(item, "approve", div));
      const reject = document.createElement("button");
      reject.className = "reject";
      reject.textContent = "✕ Reject";
      reject.addEventListener("click", () => decide(item, "reject", div));
      actions.append(approve, reject);
      div.appendChild(actions);

      els.candidates.appendChild(div);
    });
    updateFocus();
  }

  async function decide(item, decision, node) {
    const { data } = await api.post("/api/decision", {
      category: state.category,
      cardId: state.activeCardId,
      decision,
      item,
      kind: state.mode === "sounds" ? "sound" : "photo",
    });
    state.lastDecision = { item, kind: state.mode };

    if (node) node.remove();
    if (decision === "approve") {
      state.approved.push(item);
      renderApprovedStrip();
    }

    const card = state.cards.find((c) => c.id === state.activeCardId);
    if (card) {
      card.approvedCount = state.mode === "sounds" ? card.approvedCount : data.approvedCount;
      card.soundCount = data.soundCount;
    }
    updateProgress();
    renderCards();
    // Keep the newly-focused card in view after the acted-on one is removed.
    // `block: "nearest"` means no movement if it's already visible.
    updateFocus(true);
  }

  function renderApprovedStrip() {
    els.approvedStrip.innerHTML = "";
    state.approved.forEach((item) => {
      const wrap = document.createElement("div");
      wrap.className = "approved-thumb";
      if (state.mode === "sounds") {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.preload = "none";
        audio.src = item.url;
        audio.style.width = "200px";
        wrap.appendChild(audio);
      } else {
        const img = document.createElement("img");
        img.src = item.url;
        img.loading = "lazy";
        img.alt = "";
        wrap.appendChild(img);
      }
      const remove = document.createElement("button");
      remove.textContent = "×";
      remove.title = "Remove from approved";
      remove.addEventListener("click", async () => {
        await api.post("/api/decision", {
          category: state.category,
          cardId: state.activeCardId,
          decision: "undo",
          item,
          kind: state.mode === "sounds" ? "sound" : "photo",
        });
        state.approved = state.approved.filter(
          (a) => (a.photoId || a.soundId) !== (item.photoId || item.soundId)
        );
        renderApprovedStrip();
        updateProgress();
        await loadCards();
        renderCards();
      });
      wrap.appendChild(remove);
      els.approvedStrip.appendChild(wrap);
    });
  }

  // Nudge toward widening when a species is too thin in the five states —
  // rare species, and threatened ones whose coordinates iNaturalist obscures,
  // simply don't return many place-filtered results.
  function updateScopeHint(totalResults) {
    if (state.widen === 0 && totalResults < 20) {
      els.scopeHint.textContent =
        `Only ${totalResults} matching observation${totalResults === 1 ? "" : "s"} in the five states. ` +
        `Widen the search scope if you can't fill 20 — rare and coordinate-obscured ` +
        `species (rattlesnakes, Massasauga) often need it.`;
    } else if (state.widen === 1) {
      els.scopeHint.textContent =
        "Showing all quality grades — double-check IDs, these aren't community-verified.";
    } else if (state.widen === 2) {
      els.scopeHint.textContent =
        "Showing nationwide results — photos may be from outside your students' region.";
    } else {
      els.scopeHint.textContent = "";
    }
  }

  function updateProgress() {
    const n = state.approved.length;
    els.approvedCount.textContent = n;
    els.progressFill.style.width = `${Math.min(100, (n / state.target) * 100)}%`;
  }

  // ---- Keyboard navigation -------------------------------------------------

  function candidateNodes() {
    return Array.from(els.candidates.querySelectorAll(".candidate"));
  }

  // `scroll` is opt-in: scrolling on every render would yank the page back to
  // candidate #0 each time "Load more" appends a batch, which reads as the
  // button doing nothing. Only keyboard navigation should move the viewport.
  function updateFocus(scroll) {
    const nodes = candidateNodes();
    if (state.focusIndex >= nodes.length) state.focusIndex = nodes.length - 1;
    if (state.focusIndex < 0) state.focusIndex = 0;
    nodes.forEach((n, i) => n.classList.toggle("focused", i === state.focusIndex));
    const focused = nodes[state.focusIndex];
    if (scroll && focused) {
      focused.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
    if (document.querySelector(".lightbox")) {
      if (e.key === "Escape") closeLightbox();
      return;
    }
    if (!state.activeCardId) return;

    const nodes = candidateNodes();
    const focused = nodes[state.focusIndex];
    const itemFor = (node) =>
      state.items.find(
        (i) => (i.photoId || i.soundId) === node.dataset.itemId
      );

    if (e.key === "ArrowRight") {
      e.preventDefault();
      state.focusIndex++;
      updateFocus(true);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      state.focusIndex--;
      updateFocus(true);
    } else if ((e.key === "a" || e.key === "A") && focused) {
      e.preventDefault();
      decide(itemFor(focused), "approve", focused);
    } else if ((e.key === "r" || e.key === "R") && focused) {
      e.preventDefault();
      decide(itemFor(focused), "reject", focused);
    } else if ((e.key === "u" || e.key === "U") && state.lastDecision) {
      e.preventDefault();
      api
        .post("/api/decision", {
          category: state.category,
          cardId: state.activeCardId,
          decision: "undo",
          item: state.lastDecision.item,
          kind: state.lastDecision.kind === "sounds" ? "sound" : "photo",
        })
        .then(() => loadCandidates(true));
      state.lastDecision = null;
    }
  });

  // ---- Lightbox ------------------------------------------------------------

  function openLightbox(url) {
    const box = document.createElement("div");
    box.className = "lightbox";
    const img = document.createElement("img");
    img.src = url;
    box.appendChild(img);
    box.addEventListener("click", closeLightbox);
    document.body.appendChild(box);
  }

  function closeLightbox() {
    const box = document.querySelector(".lightbox");
    if (box) box.remove();
  }

  // ---- Boot ----------------------------------------------------------------

  els.widenSelect.addEventListener("change", () => {
    state.widen = parseInt(els.widenSelect.value, 10);
    state.page = 1;
    state.focusIndex = 0;
    loadCandidates(true);
  });

  els.filter.addEventListener("input", renderCards);
  els.hideDone.addEventListener("change", renderCards);
  els.loadMore.addEventListener("click", () => {
    state.page++;
    loadCandidates(false);
  });

  (async function init() {
    await loadCategories();
    await loadCards();
  })();
})();
