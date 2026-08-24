# Fishdle

A continuous, Wordle-style species ID game for community college field-biology
students. See a photo, guess the species from a dropdown, get a hint after each
wrong guess, and keep going — a new species loads automatically every round.

Two study sets:

- **Fishes** — 65 species
- **Herps** — 44 cards (43 species; Eastern Newt is split into Adult and Eft)

Photos are hand-curated from iNaturalist research-grade observations in
**Iowa, Missouri, Minnesota, Wisconsin, and Illinois**, under reusable CC
licenses (CC0 / CC-BY / CC-BY-SA).

---

## Two halves of this repo

| | What it is | Runs where |
|---|---|---|
| **The game** (`index.html`, `game.js`, `style.css`, `data/species-*.json`) | Fully static site | Deployed to GitHub Pages |
| **The curation tool** (`curate/`, `scripts/`) | Local Node server for picking photos | Your machine only — never deployed |

The curation tool is a build-time authoring aid. Nothing it does is needed at
play time; it just produces the JSON the static game reads.

---

## Project structure

```
/
├── index.html                    # the game
├── style.css
├── game.js
├── data/
│   ├── taxa.json                 # resolved iNaturalist taxon_ids
│   ├── curation-fish.json        # your approve/reject decisions
│   ├── curation-herps.json
│   ├── species-fish.json         # ← what the game actually loads
│   └── species-herps.json
├── curate/                       # LOCAL curation tool (not deployed)
│   ├── server.js
│   ├── index.html
│   ├── curate.js
│   └── curate.css
├── scripts/
│   ├── species-list.js           # master species list (source of truth)
│   ├── resolve-taxa.js           # common/sci names → taxon_ids
│   └── export-game-data.js       # curated picks → game data
└── README.md
```

---

## Workflow

Requires **Node.js 18+**. No npm install, no dependencies.

### 1. Resolve taxon IDs (once, or after editing the species list)

```bash
node scripts/resolve-taxa.js
```

Resolves all 109 cards to iNaturalist taxon IDs by exact scientific-name match
and writes `data/taxa.json`. Anything ambiguous is marked `needsReview` and
surfaced in the curation UI rather than silently guessed.

Takes ~4 minutes (throttled to stay under the API rate limit). Re-running is
safe: taxa you confirmed in the curation UI are never overwritten.

**Expect ~14 cards to be flagged.** These are real taxonomy problems, not bugs:

- **Wiper** is a White Bass × Striped Bass hybrid — iNaturalist has no clean
  species taxon. Pick something sensible or drop the card.
- **Largemouth Bass** — iNat split this; `Micropterus nigricans` is the
  widespread species, `M. salmoides` is now Florida Bass.
- **Lake Sturgeon** — iNat files it under `Huso fulvescens`, not the familiar
  `Acipenser fulvescens`.
- **Bigmouth Shiner** — iNat uses `Ericymba dorsalis`, not `Notropis dorsalis`.
- **Eastern Gray Tree Frog** — iNat uses `Dryophytes versicolor`, not `Hyla
  versicolor`; also visually identical to Cope's Gray Treefrog, so watch for
  misidentified photos.
- **Bowfin** — split in 2022. `Amia calva` (eastern) has **zero** records in
  the five states; the Midwest fish is `Amia ocellicauda`, "Eyetail Bowfin".
- **Blacknose Dace** — same story. `R. atratulus` (Eastern) has zero records
  here; the local fish is `R. obtusus`, Western Blacknose Dace.
- **Grass Pickerel / Northern Painted Turtle** — you want a subspecies; iNat
  may only offer the species.
- **Eastern Newt (Adult / Eft)** — both cards share one taxon by design; you
  assign photos to the right card during curation.

### 2. Curate photos

```bash
node curate/server.js
```

Open **http://localhost:4321**. For each species you get a grid of
research-grade, CC-licensed observation photos from the five states, newest
and most-upvoted first.

- **✓ Approve** the ones that make good ID puzzles
- **✕ Reject** the blurry, mostly-hand, wrong-angle, or misidentified ones
- Target is **20 approved per species**; the sidebar tracks progress
- Click any photo to open it full-size
- Species needing taxon review show a ⚠ and a picker to choose the right taxon
- Frogs/toads with calls get a **Calls / audio** tab — approved audio is stored
  now for a future listen-and-guess mode (the game is image-only this pass)

**Keyboard:** <kbd>A</kbd> approve · <kbd>R</kbd> reject · <kbd>←</kbd>/<kbd>→</kbd>
move · <kbd>U</kbd> undo last

#### Photo licenses

The curation tool accepts **CC0, CC-BY, CC-BY-SA, CC-BY-NC and CC-BY-NC-SA**.

Non-commercial (NC) licenses are included deliberately — this is a free study
tool that will never be sold or licensed, which is exactly what NC permits.
That matters a lot for photo quality: NC is by far the most common license on
iNaturalist, and excluding it throws away roughly 90% of the pool, leaving
curation to scrape the bottom of the barrel. Including it multiplies the
candidate pool ~9x:

| Species | Strict licenses only | With NC |
|---|---|---|
| Bluegill | 539 obs | **4,778** |
| Walleye | 1,399 obs | **9,070** |
| Mudpuppy | 10 obs | **122** |
| Wood Turtle | 5 obs | **94** |
| Mooneye | 6 obs | **92** |
| Quillback Carpsucker | 3 obs | **91** |
| Burbot | 4 obs | **78** |

ND (no-derivatives) licenses are excluded — they arguably conflict with
resizing and cropping.

**If you ever want to sell or commercially license this tool**, edit
`REUSABLE_LICENSES` in `curate/server.js` back to `["cc0", "cc-by", "cc-by-sa"]`
and re-curate. Every photo carries its attribution string through to the game,
which displays it under the image.

#### Species that still can't fill 20 from the five states

Use the **Search scope** dropdown to relax the filters:

| Scope | What changes |
|---|---|
| `5 states · research grade` | Default |
| `5 states · any quality` | Includes unverified IDs — check them yourself |
| `Nationwide · research grade` | Drops the place filter entirely |

Threatened species (Eastern Massasauga, Prairie Rattlesnake) have their
coordinates deliberately obscured by iNaturalist, which drops them out of
*any* place-filtered query — those need the nationwide scope. The tool warns
you automatically when a species has fewer than 20 available.

Decisions save to `data/curation-*.json` immediately — close the tab any time
and pick up where you left off. API responses are cached in `data/.cache/` so
revisiting a species doesn't re-hit iNaturalist.

### 3. Export game data

```bash
node scripts/export-game-data.js
```

Writes `data/species-fish.json` and `data/species-herps.json` from your picks.
Only species with at least one approved photo are exported — the game never
shows an un-curated species. **Hand-written hints are preserved**, so re-run
this freely as curation progresses.

### 4. Write hints

Each species needs 3 hints in its `data/species-*.json` entry, revealed one per
wrong guess:

```json
"hints": [
  "subtle hint after guess 1",
  "medium hint after guess 2",
  "dead-giveaway hint after guess 3"
]
```

Empty strings are skipped silently in the UI, so you can fill these in
incrementally. This is the one part no script can do for you.

### 5. Preview the game

```bash
python3 -m http.server 8000
```

Open http://localhost:8000.

The local server is a **preview convenience, not a runtime dependency** — the
game is 100% static. `game.js` loads its JSON via `fetch()`, which browsers
block from a bare `file://` URL, so opening `index.html` by double-clicking
won't work. Any real HTTP host is fine.

---

## Deploying to GitHub Pages

No build step. Push the repo and enable Pages:

```bash
git add -A
git commit -m "Fishdle"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

Then **Settings → Pages → Source: "Deploy from a branch" → Branch: `main`,
folder: `/ (root)` → Save.**

Live at `https://<your-username>.github.io/<repo-name>/` within a minute or so.

The `curate/` and `scripts/` folders get pushed too but are inert — GitHub
Pages just serves static files and never runs them. Re-export and push
`data/species-*.json` whenever you curate more.

---

## Editing the species list

`scripts/species-list.js` is the source of truth. Add, remove, or rename cards
there, then re-run `resolve-taxa.js` and `export-game-data.js`. Fields:

| Field | Meaning |
|---|---|
| `id` | Stable slug — changing it orphans that species' curation data |
| `commonName` | The answer students pick from the dropdown |
| `sciName` | Used for exact-match taxon resolution; `""` forces manual review |
| `group` | Section header in the curation sidebar |
| `stage` | Life-stage label when several cards share a taxon (newt adult/eft) |
| `hasCall` | Enables the audio tab in curation |
| `note` | Caveat shown in the review banner; always forces manual review |

---

## In-game photo flagging

If a bad photo slips through curation, the **🚩 Flag photo** button hides it for
the rest of the session, swaps in another photo of the same species, and logs
the URL to the browser console. To remove it permanently, reject it in the
curation tool and re-export.

---

## Legacy files from the first pass

`species.json` (root) and `scripts/fetch-images.js` are from the original
11-species prototype and are **no longer used by anything**. The curation
pipeline replaces them: `fetch-images.js` grabbed 20 random photos with no
place filter and no human review, which is exactly what the curation tool
exists to improve on. Safe to delete whenever you like:

```bash
rm species.json scripts/fetch-images.js
```

## Out of scope for this pass

- **Listen-and-guess audio rounds** — frog calls are curated and stored in
  `sounds[]`, but the game doesn't use them yet
- Persisting streak/score across page reloads (localStorage)
- Score sharing / emoji grid like Wordle
- Backend or database

Session streak/score live in memory only and reset on reload, by design. Scores
are tracked separately per category so switching between Fishes and Herps
doesn't scramble a run.
