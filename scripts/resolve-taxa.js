#!/usr/bin/env node
/**
 * resolve-taxa.js
 *
 * Resolves every card in scripts/species-list.js to an iNaturalist taxon_id
 * and writes data/taxa.json. Anything it can't resolve confidently is marked
 * `needsReview: true` so the curation UI can prompt you to pick the right
 * taxon by hand.
 *
 * Safe to re-run: choices you've confirmed in the curation UI (confirmed:true)
 * are never overwritten.
 *
 * Usage: node scripts/resolve-taxa.js
 */

const fs = require("fs");
const path = require("path");
const { CATEGORIES } = require("./species-list.js");

const DATA_DIR = path.join(__dirname, "..", "data");
const TAXA_PATH = path.join(DATA_DIR, "taxa.json");
const REQUEST_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Fishdle-resolve-taxa/1.0" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

/**
 * Search iNaturalist taxa. Returns a trimmed candidate list; the curation UI
 * shows these verbatim when a card needs manual disambiguation.
 */
async function searchTaxa(query) {
  const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(
    query
  )}&per_page=10`;
  const data = await fetchJSON(url);
  return (data.results || []).map((r) => ({
    id: r.id,
    name: r.name,
    rank: r.rank,
    commonName: r.preferred_common_name || "",
    observationCount: r.observations_count || 0,
    ancestry: r.ancestry || "",
  }));
}

async function resolveCard(card) {
  const query = card.query || card.sciName || card.commonName;
  const candidates = await searchTaxa(query);

  const result = {
    id: card.id,
    commonName: card.commonName,
    group: card.group,
    stage: card.stage || null,
    hasCall: !!card.hasCall,
    note: card.note || null,
    taxonId: null,
    sciName: card.sciName || "",
    resolvedCommonName: "",
    rank: "",
    needsReview: false,
    reviewReason: "",
    candidates,
    confirmed: false,
  };

  // No scientific name supplied (e.g. the Wiper hybrid) — always manual.
  if (!card.sciName) {
    result.needsReview = true;
    result.reviewReason =
      card.note || "No scientific name supplied — pick a taxon by hand.";
    return result;
  }

  const exact = candidates.filter(
    (c) => c.name.toLowerCase() === card.sciName.toLowerCase()
  );

  if (exact.length === 0) {
    result.needsReview = true;
    result.reviewReason = `No exact match for "${card.sciName}". Candidates: ${
      candidates.map((c) => `${c.name} (${c.rank})`).join(", ") || "none"
    }`;
    return result;
  }

  const match = exact[0];
  result.taxonId = match.id;
  result.sciName = match.name;
  result.resolvedCommonName = match.commonName;
  result.rank = match.rank;

  if (exact.length > 1) {
    result.needsReview = true;
    result.reviewReason = `${exact.length} taxa share the name "${card.sciName}" — confirm the right one.`;
  } else if (match.rank !== "species" && match.rank !== "subspecies") {
    result.needsReview = true;
    result.reviewReason = `Resolved to rank "${match.rank}", not species/subspecies.`;
  } else if (card.note) {
    // Cards carrying a hand-written caveat always get eyes on them.
    result.needsReview = true;
    result.reviewReason = card.note;
  }

  return result;
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Preserve anything already confirmed by hand in the curation UI.
  let existing = {};
  if (fs.existsSync(TAXA_PATH)) {
    const prev = JSON.parse(fs.readFileSync(TAXA_PATH, "utf8"));
    for (const [category, cards] of Object.entries(prev.categories || {})) {
      for (const card of cards) {
        if (card.confirmed) existing[`${category}:${card.id}`] = card;
      }
    }
  }

  const out = { generatedAt: new Date().toISOString(), categories: {} };
  const flagged = [];

  for (const [categoryKey, category] of Object.entries(CATEGORIES)) {
    console.log(`\n########## ${category.label} (${category.species.length}) ##########`);
    out.categories[categoryKey] = [];

    for (const card of category.species) {
      const cacheKey = `${categoryKey}:${card.id}`;
      if (existing[cacheKey]) {
        console.log(`  ⏭  ${card.commonName} — keeping confirmed taxon ${existing[cacheKey].taxonId}`);
        out.categories[categoryKey].push(existing[cacheKey]);
        continue;
      }

      let resolved;
      try {
        resolved = await resolveCard(card);
      } catch (err) {
        console.error(`  ❌ ${card.commonName}: ${err.message}`);
        resolved = {
          id: card.id,
          commonName: card.commonName,
          group: card.group,
          stage: card.stage || null,
          hasCall: !!card.hasCall,
          note: card.note || null,
          taxonId: null,
          sciName: card.sciName || "",
          needsReview: true,
          reviewReason: `Lookup failed: ${err.message}`,
          candidates: [],
          confirmed: false,
        };
      }

      if (resolved.needsReview) {
        console.log(`  ⚠️  ${card.commonName} — ${resolved.reviewReason}`);
        flagged.push(`${category.label}: ${card.commonName}`);
      } else {
        console.log(
          `  ✅ ${card.commonName.padEnd(32)} taxon_id=${String(resolved.taxonId).padEnd(9)} ${resolved.sciName}`
        );
      }

      out.categories[categoryKey].push(resolved);
      await sleep(REQUEST_DELAY_MS);
    }
  }

  fs.writeFileSync(TAXA_PATH, JSON.stringify(out, null, 2) + "\n");

  console.log(`\n\n=== Wrote ${TAXA_PATH} ===`);
  console.log(`${flagged.length} card(s) need review in the curation UI:`);
  flagged.forEach((f) => console.log(`  • ${f}`));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
