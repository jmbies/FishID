#!/usr/bin/env node
/**
 * export-game-data.js
 *
 * Turns curated picks (data/curation-*.json + data/taxa.json) into the static
 * data the game loads: data/species-fish.json and data/species-herps.json.
 *
 * Only species with at least one approved photo are exported — the game never
 * serves an un-curated species. Hand-written "hints" in an existing export are
 * preserved, so this is safe to re-run as curation progresses.
 *
 * Usage: node scripts/export-game-data.js
 */

const fs = require("fs");
const path = require("path");
const { CATEGORIES } = require("./species-list.js");

const DATA_DIR = path.join(__dirname, "..", "data");
const MIN_IMAGES = 1;

function readJSON(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function main() {
  const taxa = readJSON(path.join(DATA_DIR, "taxa.json"), { categories: {} });
  const summary = [];

  for (const [categoryKey, category] of Object.entries(CATEGORIES)) {
    const taxaCards = taxa.categories[categoryKey] || [];
    const curation = readJSON(
      path.join(DATA_DIR, `curation-${categoryKey}.json`),
      { cards: {} }
    );
    const outPath = path.join(DATA_DIR, `species-${categoryKey}.json`);
    const previous = readJSON(outPath, { species: [] });
    const previousHints = new Map(
      previous.species.map((s) => [s.id, s.hints])
    );

    const exported = [];
    const skipped = [];

    for (const card of category.species) {
      const taxon = taxaCards.find((t) => t.id === card.id) || {};
      const picks = curation.cards[card.id] || {};
      const approved = picks.approved || [];
      const sounds = picks.sounds || [];

      if (approved.length < MIN_IMAGES) {
        skipped.push(card.commonName);
        continue;
      }

      exported.push({
        id: card.id,
        commonName: card.commonName,
        sciName: taxon.sciName || card.sciName || "",
        group: card.group,
        stage: card.stage || null,
        images: approved.map((p) => ({
          url: p.url,
          attribution: p.attribution,
          obsUrl: p.obsUrl,
        })),
        // Curated now, used by a future listen-and-guess mode.
        sounds: sounds.map((s) => ({
          url: s.url,
          attribution: s.attribution,
          obsUrl: s.obsUrl,
        })),
        hints: previousHints.get(card.id) || ["", "", ""],
      });
    }

    const payload = {
      category: categoryKey,
      label: category.label,
      generatedAt: new Date().toISOString(),
      species: exported,
    };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");

    summary.push({
      label: category.label,
      exported: exported.length,
      total: category.species.length,
      skipped,
      photos: exported.reduce((n, s) => n + s.images.length, 0),
      sounds: exported.reduce((n, s) => n + s.sounds.length, 0),
      missingHints: exported.filter((s) => !s.hints.some(Boolean)).length,
    });
  }

  console.log("=== Export summary ===\n");
  for (const s of summary) {
    console.log(
      `${s.label}: ${s.exported}/${s.total} species · ${s.photos} photos · ${s.sounds} sounds`
    );
    if (s.missingHints) {
      console.log(`  ✏️  ${s.missingHints} exported species still have no hints written`);
    }
    if (s.skipped.length) {
      console.log(`  ⏭  ${s.skipped.length} not yet curated: ${s.skipped.slice(0, 8).join(", ")}${s.skipped.length > 8 ? "…" : ""}`);
    }
    console.log("");
  }

  const totalExported = summary.reduce((n, s) => n + s.exported, 0);
  if (totalExported === 0) {
    console.log("Nothing exported yet — curate some photos first:\n  node curate/server.js");
  }
}

main();
