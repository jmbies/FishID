#!/usr/bin/env node
/**
 * curate/server.js — LOCAL CURATION TOOL (not deployed)
 *
 * A tiny dependency-free Node server that backs the photo-picking UI. It
 * proxies iNaturalist (dodging browser CORS and centralising rate limiting),
 * caches responses to disk, and persists your approve/reject decisions.
 *
 * The deployed game never touches this — run `node scripts/export-game-data.js`
 * to turn curated picks into the static data/species-*.json the game reads.
 *
 * Usage: node curate/server.js   →   http://localhost:4321
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { CATEGORIES } = require("../scripts/species-list.js");

const PORT = process.env.PORT || 4321;
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CACHE_DIR = path.join(DATA_DIR, ".cache");
const TAXA_PATH = path.join(DATA_DIR, "taxa.json");

// Iowa, Missouri, Minnesota, Wisconsin, Illinois — resolved from
// /v1/places/autocomplete (admin_level 10). Comma-separated = OR.
const PLACE_IDS = [24, 28, 38, 32, 35];
const PLACE_LABEL = "IA, MO, MN, WI, IL";

// Non-commercial licenses are included deliberately: this is a free study
// tool that will never be sold or licensed, which is exactly what NC permits.
// Including them multiplies the candidate pool by roughly 9x, so curation
// picks from the good photos rather than scraping the bottom of the barrel.
// ND (no-derivatives) is deliberately excluded — it arguably conflicts with
// resizing and cropping.
const REUSABLE_LICENSES = [
  "cc0",
  "cc-by",
  "cc-by-sa",
  "cc-by-nc",
  "cc-by-nc-sa",
];
const PHOTO_SIZE = "large";
const TARGET_PER_SPECIES = 20;

// iNaturalist asks for <100 req/min; we serialise and space requests out.
const MIN_REQUEST_GAP_MS = 1100;
let lastRequestAt = 0;
let apiQueue = Promise.resolve();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

// ---------------------------------------------------------------------------
// Throttled + disk-cached iNaturalist access
// ---------------------------------------------------------------------------

function cachePathFor(url) {
  // Hash the WHOLE url. An earlier version truncated a base64 encoding to fit
  // a filename, which silently collided: photo_license, widen and sounds all
  // live at the tail of the query string, so different queries mapped to one
  // cache file and the server replayed the wrong response.
  const hash = crypto.createHash("sha256").update(url).digest("hex");
  return path.join(CACHE_DIR, `${hash}.json`);
}

async function inatFetch(url, { useCache = true } = {}) {
  const cacheFile = cachePathFor(url);
  if (useCache && fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  }

  // Serialise every outbound call through one promise chain so concurrent
  // browser requests can't burst past the rate limit.
  apiQueue = apiQueue.then(async () => {
    // Transient network blips and 429s are common over a long curation
    // session; retry with backoff rather than surfacing a dead grid.
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = Math.max(0, lastRequestAt + MIN_REQUEST_GAP_MS - Date.now());
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastRequestAt = Date.now();
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Fishdle-curation-tool/1.0" },
        });
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`iNaturalist ${res.status}`);
        }
        if (!res.ok) throw new Error(`iNaturalist ${res.status}: ${url}`);
        return res.json();
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          const backoff = 1500 * Math.pow(2, attempt);
          console.warn(`  ⟳ retrying in ${backoff}ms (${err.message})`);
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }
    throw lastErr;
  });

  const data = await apiQueue;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(data));
  return data;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function taxaFile() {
  if (!fs.existsSync(TAXA_PATH)) return { categories: {} };
  return JSON.parse(fs.readFileSync(TAXA_PATH, "utf8"));
}

function saveTaxaFile(data) {
  fs.writeFileSync(TAXA_PATH, JSON.stringify(data, null, 2) + "\n");
}

function curationPath(category) {
  return path.join(DATA_DIR, `curation-${category}.json`);
}

function loadCuration(category) {
  const p = curationPath(category);
  if (!fs.existsSync(p)) return { cards: {} };
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function saveCuration(category, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(curationPath(category), JSON.stringify(data, null, 2) + "\n");
}

function cardState(curation, cardId) {
  if (!curation.cards[cardId]) {
    curation.cards[cardId] = {
      approved: [],
      rejected: [],
      sounds: [],
      rejectedSounds: [],
    };
  }
  const c = curation.cards[cardId];
  c.approved = c.approved || [];
  c.rejected = c.rejected || [];
  c.sounds = c.sounds || [];
  // Sound IDs live in their own iNaturalist ID space, so they get their own
  // reject list — sharing one list could filter a photo that happens to
  // share an id with a rejected sound.
  c.rejectedSounds = c.rejectedSounds || [];
  return c;
}

// ---------------------------------------------------------------------------
// iNaturalist queries
// ---------------------------------------------------------------------------

/**
 * Some species are genuinely thin inside the five states — either rare
 * (Mudpuppy), or coordinate-obscured by iNaturalist because they're
 * threatened (Massasauga, Prairie Rattlesnake), which drops them out of
 * place-filtered queries. `widen` progressively relaxes the filters so those
 * species can still be curated:
 *   0 = 5 states + research grade   (default)
 *   1 = 5 states, any quality grade
 *   2 = nationwide, research grade
 */
function observationsUrl(taxonId, { page = 1, sounds = false, widen = 0 } = {}) {
  const params = new URLSearchParams({
    taxon_id: String(taxonId),
    per_page: "50",
    page: String(page),
    order_by: "votes",
    order: "desc",
  });
  if (widen === 2) {
    params.set("quality_grade", "research");
  } else {
    params.set("place_id", PLACE_IDS.join(","));
    if (widen === 0) params.set("quality_grade", "research");
  }
  if (sounds) {
    params.set("sounds", "true");
    params.set("sound_license", REUSABLE_LICENSES.join(","));
  } else {
    params.set("photos", "true");
    params.set("photo_license", REUSABLE_LICENSES.join(","));
  }
  return `https://api.inaturalist.org/v1/observations?${params}`;
}

function extractPhotos(observations) {
  const out = [];
  for (const obs of observations) {
    for (const photo of obs.photos || []) {
      if (!photo.url) continue;
      if (photo.license_code && !REUSABLE_LICENSES.includes(photo.license_code)) {
        continue;
      }
      out.push({
        photoId: String(photo.id),
        url: photo.url.replace("/square.", `/${PHOTO_SIZE}.`),
        obsId: obs.id,
        obsUrl: `https://www.inaturalist.org/observations/${obs.id}`,
        attribution: photo.attribution || "",
        license: photo.license_code || "",
        observedOn: obs.observed_on || "",
        place: obs.place_guess || "",
        qualityGrade: obs.quality_grade || "",
      });
    }
  }
  return out;
}

function extractSounds(observations) {
  const out = [];
  for (const obs of observations) {
    for (const sound of obs.sounds || []) {
      const url = sound.file_url || (sound.play_local ? sound.play_local : null);
      if (!url) continue;
      if (sound.license_code && !REUSABLE_LICENSES.includes(sound.license_code)) {
        continue;
      }
      out.push({
        soundId: String(sound.id),
        url,
        obsId: obs.id,
        obsUrl: `https://www.inaturalist.org/observations/${obs.id}`,
        attribution: sound.attribution || "",
        license: sound.license_code || "",
        observedOn: obs.observed_on || "",
        place: obs.place_guess || "",
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// API handlers
// ---------------------------------------------------------------------------

function findTaxonCard(category, cardId) {
  const taxa = taxaFile();
  const list = taxa.categories[category] || [];
  return list.find((c) => c.id === cardId) || null;
}

async function handleApi(req, res, url) {
  const route = url.pathname.replace(/^\/api\//, "");
  const q = url.searchParams;

  if (route === "categories") {
    return json(res, {
      placeLabel: PLACE_LABEL,
      targetPerSpecies: TARGET_PER_SPECIES,
      categories: Object.entries(CATEGORIES).map(([key, c]) => ({
        key,
        label: c.label,
        count: c.species.length,
      })),
    });
  }

  if (route === "cards") {
    const category = q.get("category");
    if (!CATEGORIES[category]) return json(res, { error: "bad category" }, 400);
    const taxa = taxaFile().categories[category] || [];
    const curation = loadCuration(category);
    const cards = taxa.map((t) => {
      const state = curation.cards[t.id] || {};
      return {
        id: t.id,
        commonName: t.commonName,
        sciName: t.sciName,
        group: t.group,
        stage: t.stage,
        hasCall: t.hasCall,
        taxonId: t.taxonId,
        needsReview: t.needsReview && !t.confirmed,
        reviewReason: t.reviewReason,
        confirmed: !!t.confirmed,
        approvedCount: (state.approved || []).length,
        rejectedCount: (state.rejected || []).length,
        soundCount: (state.sounds || []).length,
      };
    });
    return json(res, { cards, targetPerSpecies: TARGET_PER_SPECIES });
  }

  if (route === "candidates") {
    const category = q.get("category");
    const cardId = q.get("id");
    const page = parseInt(q.get("page") || "1", 10);
    const wantSounds = q.get("sounds") === "true";
    const taxonCard = findTaxonCard(category, cardId);
    if (!taxonCard) return json(res, { error: "unknown card" }, 404);
    if (!taxonCard.taxonId) {
      return json(res, {
        error: "unresolved",
        message: "This card has no taxon_id yet — pick a taxon first.",
        candidates: taxonCard.candidates || [],
      }, 409);
    }

    const widen = Math.min(2, Math.max(0, parseInt(q.get("widen") || "0", 10)));
    const data = await inatFetch(
      observationsUrl(taxonCard.taxonId, { page, sounds: wantSounds, widen })
    );
    const items = wantSounds
      ? extractSounds(data.results || [])
      : extractPhotos(data.results || []);

    const curation = loadCuration(category);
    const state = cardState(curation, cardId);
    const decidedIds = wantSounds
      ? new Set([...state.rejectedSounds, ...state.sounds.map((s) => s.soundId)])
      : new Set([...state.rejected, ...state.approved.map((p) => p.photoId)]);

    return json(res, {
      totalResults: data.total_results || 0,
      page,
      widen,
      items: items.filter((i) => !decidedIds.has(i.photoId || i.soundId)),
      approved: state.approved,
      sounds: state.sounds,
    });
  }

  if (route === "taxon-search") {
    const term = q.get("q");
    if (!term) return json(res, { results: [] });
    const data = await inatFetch(
      `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(term)}&per_page=10`
    );
    return json(res, {
      results: (data.results || []).map((r) => ({
        id: r.id,
        name: r.name,
        rank: r.rank,
        commonName: r.preferred_common_name || "",
        observationCount: r.observations_count || 0,
      })),
    });
  }

  if (req.method !== "POST") return json(res, { error: "not found" }, 404);
  const body = await readBody(req);

  if (route === "decision") {
    const { category, cardId, decision, item, kind } = body;
    if (!CATEGORIES[category]) return json(res, { error: "bad category" }, 400);
    const curation = loadCuration(category);
    const state = cardState(curation, cardId);

    if (kind === "sound") {
      if (decision === "approve") {
        if (!state.sounds.some((s) => s.soundId === item.soundId)) {
          state.sounds.push(item);
        }
        state.rejectedSounds = state.rejectedSounds.filter((id) => id !== item.soundId);
      } else if (decision === "reject") {
        state.sounds = state.sounds.filter((s) => s.soundId !== item.soundId);
        if (!state.rejectedSounds.includes(item.soundId)) {
          state.rejectedSounds.push(item.soundId);
        }
      } else if (decision === "undo") {
        state.sounds = state.sounds.filter((s) => s.soundId !== item.soundId);
        state.rejectedSounds = state.rejectedSounds.filter((id) => id !== item.soundId);
      }
    } else if (decision === "approve") {
      if (!state.approved.some((p) => p.photoId === item.photoId)) {
        state.approved.push(item);
      }
      state.rejected = state.rejected.filter((id) => id !== item.photoId);
    } else if (decision === "reject") {
      state.approved = state.approved.filter((p) => p.photoId !== item.photoId);
      if (!state.rejected.includes(item.photoId)) state.rejected.push(item.photoId);
    } else if (decision === "undo") {
      state.approved = state.approved.filter((p) => p.photoId !== item.photoId);
      state.rejected = state.rejected.filter((id) => id !== item.photoId);
    }

    saveCuration(category, curation);
    return json(res, {
      approvedCount: state.approved.length,
      rejectedCount: state.rejected.length,
      soundCount: state.sounds.length,
    });
  }

  if (route === "assign-taxon") {
    const { category, cardId, taxonId, sciName, commonName } = body;
    const taxa = taxaFile();
    const list = taxa.categories[category] || [];
    const card = list.find((c) => c.id === cardId);
    if (!card) return json(res, { error: "unknown card" }, 404);
    card.taxonId = Number(taxonId);
    if (sciName) card.sciName = sciName;
    if (commonName) card.resolvedCommonName = commonName;
    card.confirmed = true;
    card.needsReview = false;
    card.reviewReason = "";
    saveTaxaFile(taxa);
    return json(res, { ok: true, taxonId: card.taxonId, sciName: card.sciName });
  }

  if (route === "confirm") {
    // Mark an auto-resolved-but-flagged card as verified without changing it.
    const { category, cardId } = body;
    const taxa = taxaFile();
    const card = (taxa.categories[category] || []).find((c) => c.id === cardId);
    if (!card) return json(res, { error: "unknown card" }, 404);
    card.confirmed = true;
    card.needsReview = false;
    saveTaxaFile(taxa);
    return json(res, { ok: true });
  }

  return json(res, { error: "not found" }, 404);
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

function json(res, payload, status = 200) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 5e6) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(res, filePath) {
  // Confine every static read to curate/ — no path traversal out of it.
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(__dirname) + path.sep)) {
    return json(res, { error: "forbidden" }, 403);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return json(res, { error: "not found" }, 404);
  }
  const type = MIME[path.extname(resolved)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  fs.createReadStream(resolved).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    serveStatic(res, path.join(__dirname, rel));
  } catch (err) {
    console.error("Request failed:", err.message);
    json(res, { error: err.message }, 500);
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\n  ❌ Port ${PORT} is already in use — another curation server is ` +
        `probably still running.\n` +
        `     That older instance would keep serving stale results, so this ` +
        `one is stopping.\n\n` +
        `     Kill it:   pkill -f "curate/server.js"\n` +
        `     Or use a different port:   PORT=4322 node curate/server.js\n`
    );
  } else {
    console.error("\n  ❌ Server error:", err.message, "\n");
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n  🐟  Fishdle curation tool`);
  console.log(`  ➜  http://localhost:${PORT}`);
  console.log(`  ➜  Filtering observations to: ${PLACE_LABEL}`);
  console.log(`  ➜  Target: ${TARGET_PER_SPECIES} approved photos per species`);
  if (!fs.existsSync(TAXA_PATH)) {
    console.log(`\n  ⚠️  data/taxa.json missing — run: node scripts/resolve-taxa.js\n`);
  } else {
    console.log("");
  }
});
