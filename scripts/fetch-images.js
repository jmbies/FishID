#!/usr/bin/env node
/**
 * fetch-images.js
 *
 * Pulls candidate photos from iNaturalist for each species in SPECIES_QUERIES
 * and merges them into ../species.json, refreshing only the "images" array
 * for each entry. Hand-written "hints" are never touched.
 *
 * Requires Node 18+ (uses the built-in global fetch, no dependencies).
 *
 * Usage:
 *   node scripts/fetch-images.js
 */

const fs = require("fs");
const path = require("path");

const SPECIES_JSON_PATH = path.join(__dirname, "..", "species.json");

// Reusable licenses only (per iNaturalist's photo_license param):
// cc0, cc-by, cc-by-sa are all fine for reuse-with-attribution purposes.
const REUSABLE_LICENSES = ["cc0", "cc-by", "cc-by-sa"];

const PER_PAGE = 30;
const MAX_IMAGES_PER_SPECIES = 20;

// iNaturalist serves several pre-sized variants per photo (square, small,
// medium, large, original). "large" gives the game room to display the whole
// photo uncropped without pulling multi-MB originals.
const PHOTO_SIZE = "large";

// Throttle: iNaturalist's public API asks for well under 100 req/min.
// We stay conservative at ~1 request/second.
const REQUEST_DELAY_MS = 1000;

// The 11 species for Fishdle. Both scientific and common names are supplied
// so taxon_ids are resolved dynamically rather than hardcoded.
const SPECIES_QUERIES = [
  { id: "bluegill", commonName: "Bluegill", sciName: "Lepomis macrochirus" },
  { id: "white-bass", commonName: "White Bass", sciName: "Morone chrysops" },
  {
    id: "largemouth-bass",
    commonName: "Largemouth Bass",
    sciName: "Micropterus nigricans",
  },
  { id: "walleye", commonName: "Walleye", sciName: "Sander vitreus" },
  {
    id: "american-eel",
    commonName: "American Eel",
    sciName: "Anguilla rostrata",
  },
  {
    id: "rainbow-trout",
    commonName: "Rainbow Trout",
    sciName: "Oncorhynchus mykiss",
  },
  {
    id: "brook-trout",
    commonName: "Brook Trout",
    sciName: "Salvelinus fontinalis",
  },
  {
    id: "gizzard-shad",
    commonName: "Gizzard Shad",
    sciName: "Dorosoma cepedianum",
  },
  { id: "mooneye", commonName: "Mooneye", sciName: "Hiodon tergisus" },
  {
    id: "creek-chub",
    commonName: "Creek Chub",
    sciName: "Semotilus atromaculatus",
  },
  {
    id: "longnose-gar",
    commonName: "Longnose Gar",
    sciName: "Lepisosteus osseus",
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Fishdle-fetch-images-script/1.0" },
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status} ${res.statusText}): ${url}`);
  }
  return res.json();
}

/**
 * Resolve a taxon_id from iNaturalist for a given scientific name.
 * Matches on an EXACT scientific name (case-insensitive), and warns loudly
 * if the match is ambiguous or absent so it can be resolved by hand.
 */
async function resolveTaxonId(sciName, commonName) {
  const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(
    sciName
  )}&rank=species`;
  const data = await fetchJSON(url);
  const results = data.results || [];

  const exactMatches = results.filter(
    (r) => (r.name || "").toLowerCase() === sciName.toLowerCase()
  );

  if (exactMatches.length === 0) {
    console.warn(
      `  ⚠️  WARNING: No exact scientific-name match for "${sciName}" (${commonName}). ` +
        `Candidates returned: ${
          results.map((r) => `${r.name} (id ${r.id})`).join(", ") || "none"
        }. Skipping — resolve manually.`
    );
    return null;
  }

  if (exactMatches.length > 1) {
    console.warn(
      `  ⚠️  WARNING: Multiple exact matches for "${sciName}" (${commonName}): ` +
        `${exactMatches
          .map((r) => `id ${r.id} (${r.preferred_common_name || "no common name"})`)
          .join(", ")}. Using the first one (id ${
          exactMatches[0].id
        }) — please double check.`
    );
  }

  const match = exactMatches[0];

  // Flag the Largemouth / Florida Bass split explicitly, per project notes.
  if (sciName.toLowerCase() === "micropterus nigricans") {
    console.log(
      `  🚩 FLAG: "${sciName}" is the taxon iNaturalist split Largemouth Bass into ` +
        `(distinct from Micropterus salmoides, now "Florida Bass", Florida/Southeast only). ` +
        `Resolved to taxon_id ${match.id} — "${
          match.preferred_common_name || match.name
        }". Please double-check this is the right taxon before relying on it.`
    );
  }

  return match.id;
}

/**
 * Fetch research-grade, photo-bearing, reusably-licensed observations for a
 * taxon and extract medium/large photo URLs.
 */
async function fetchImages(taxonId, excludedImages) {
  const excluded = new Set(excludedImages || []);
  const url =
    `https://api.inaturalist.org/v1/observations?taxon_id=${taxonId}` +
    `&quality_grade=research&photos=true&per_page=${PER_PAGE}` +
    `&photo_license=${REUSABLE_LICENSES.join(",")}`;
  const data = await fetchJSON(url);
  const observations = data.results || [];

  const images = [];
  for (const obs of observations) {
    for (const photo of obs.photos || []) {
      // Belt-and-suspenders: the photo_license query param filters at the
      // observation level, so also check each individual photo's license.
      if (
        photo.license_code &&
        !REUSABLE_LICENSES.includes(photo.license_code)
      ) {
        continue;
      }
      if (!photo.url) continue;
      // iNaturalist photo URLs come back as the "square" variant — swap in
      // the pre-sized larger variant.
      const largerUrl = photo.url.replace("/square.", `/${PHOTO_SIZE}.`);
      // Never re-add a photo that was hand-excluded as poor quality.
      if (excluded.has(largerUrl)) continue;
      images.push(largerUrl);
      if (images.length >= MAX_IMAGES_PER_SPECIES) break;
    }
    if (images.length >= MAX_IMAGES_PER_SPECIES) break;
  }

  return images;
}

function loadSpeciesJSON() {
  const raw = fs.readFileSync(SPECIES_JSON_PATH, "utf8");
  return JSON.parse(raw);
}

function saveSpeciesJSON(data) {
  fs.writeFileSync(
    SPECIES_JSON_PATH,
    JSON.stringify(data, null, 2) + "\n",
    "utf8"
  );
}

async function main() {
  console.log("Fishdle image fetcher — querying iNaturalist...\n");

  const speciesData = loadSpeciesJSON();
  const summary = [];

  for (const query of SPECIES_QUERIES) {
    console.log(`\n=== ${query.commonName} (${query.sciName}) ===`);

    let taxonId;
    try {
      taxonId = await resolveTaxonId(query.sciName, query.commonName);
    } catch (err) {
      console.error(`  ❌ Error resolving taxon: ${err.message}`);
      summary.push({
        id: query.id,
        commonName: query.commonName,
        sciName: query.sciName,
        taxonId: null,
        imageCount: 0,
        status: "taxon resolution error",
      });
      continue;
    }

    await sleep(REQUEST_DELAY_MS);

    if (!taxonId) {
      summary.push({
        id: query.id,
        commonName: query.commonName,
        sciName: query.sciName,
        taxonId: null,
        imageCount: 0,
        status: "no exact taxon match — manual review needed",
      });
      continue;
    }

    // Look the entry up before fetching so hand-excluded photos can be
    // filtered out as results come in.
    const entry = speciesData.species.find((s) => s.id === query.id);

    let images = [];
    try {
      images = await fetchImages(taxonId, entry && entry.excludedImages);
    } catch (err) {
      console.error(`  ❌ Error fetching observations: ${err.message}`);
      summary.push({
        id: query.id,
        commonName: query.commonName,
        sciName: query.sciName,
        taxonId,
        imageCount: 0,
        status: "observation fetch error",
      });
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    await sleep(REQUEST_DELAY_MS);

    const excludedCount = (entry && entry.excludedImages
      ? entry.excludedImages.length
      : 0);
    console.log(
      `  ✅ taxon_id=${taxonId}, found ${images.length} image(s)` +
        (excludedCount ? ` (${excludedCount} hand-excluded photo(s) honored)` : "")
    );

    // Merge into species.json: only touch the "images" field.
    if (!entry) {
      console.warn(
        `  ⚠️  WARNING: No species.json entry with id "${query.id}" — skipping merge. ` +
          `Add an entry for it first.`
      );
      summary.push({
        id: query.id,
        commonName: query.commonName,
        sciName: query.sciName,
        taxonId,
        imageCount: images.length,
        status: "no matching species.json entry — not merged",
      });
      continue;
    }

    entry.images = images;
    if (!Array.isArray(entry.excludedImages)) entry.excludedImages = [];
    summary.push({
      id: query.id,
      commonName: query.commonName,
      sciName: query.sciName,
      taxonId,
      imageCount: images.length,
      status: "ok",
    });
  }

  saveSpeciesJSON(speciesData);

  console.log("\n\n=== Summary (review before/after pruning images) ===");
  for (const row of summary) {
    console.log(
      `${row.commonName.padEnd(18)} taxon_id=${String(
        row.taxonId ?? "—"
      ).padEnd(10)} images=${String(row.imageCount).padEnd(4)} ${row.status}`
    );
  }

  const needsReview = summary.filter((r) => r.status !== "ok");
  if (needsReview.length > 0) {
    console.log(
      `\n⚠️  ${needsReview.length} species need manual review (see warnings above).`
    );
  }

  console.log(`\nDone. Updated ${SPECIES_JSON_PATH}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
