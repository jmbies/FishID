# Fishdle

A continuous, Wordle-style fish species guessing game. See a photo, guess the
species from a dropdown, get a hint after every wrong guess, and keep going —
a new fish loads automatically after every round.

Fully static: plain HTML/CSS/vanilla JS, no framework, no build step, no
backend. Deployable as-is to GitHub Pages, Netlify, Cloudflare Pages, etc.

## Project structure

```
/
├── index.html
├── style.css
├── game.js
├── species.json          # species + image + hint data
├── scripts/
│   └── fetch-images.js   # pulls candidate photos from iNaturalist
└── README.md
```

## Species included (11)

Bluegill, White Bass, Largemouth Bass, Walleye, American Eel, Rainbow Trout,
Brook Trout, Gizzard Shad, Mooneye, Creek Chub, Longnose Gar.

**Note on Largemouth Bass:** iNaturalist recently split Largemouth Bass into
`Micropterus nigricans` (the widespread species) and `Micropterus salmoides`,
now "Florida Bass" (Florida/Southeast only, distinct species). `species.json`
and `scripts/fetch-images.js` are both pinned to `Micropterus nigricans`. The
fetch script logs a `🚩 FLAG` line whenever it resolves this taxon so you can
double-check it resolved correctly before trusting the images.

## Running `scripts/fetch-images.js`

This script queries the public iNaturalist API to find a taxon_id for each
species (by exact scientific-name match) and then pulls research-grade,
reusably-licensed (CC0 / CC-BY / CC-BY-SA) observation photos for it. It
merges results into `species.json`, refreshing only each entry's `images`
array — your hand-written `hints` are left untouched, so it's safe to re-run
any time.

Requirements: **Node.js 18+** (for built-in global `fetch`), no npm installs
needed.

```bash
node scripts/fetch-images.js
```

What to expect in the log output:

- A per-species block showing the resolved `taxon_id`, scientific name, and
  image count.
- `⚠️  WARNING` lines whenever a scientific name has no exact match, or more
  than one exact match, in iNaturalist's taxon search — these need manual
  review (edit the script's `SPECIES_QUERIES` sciName or hand-fix
  `species.json` afterward).
- A `🚩 FLAG` line for Largemouth Bass, confirming which taxon it resolved to
  (`Micropterus nigricans`, not the Florida Bass split).
- A final summary table across all 11 species.

After it runs, open `species.json` and prune/spot-check the `images` arrays —
iNaturalist research-grade observations are generally solid but not perfect,
and you may want to drop any photos that are too zoomed out, a poor angle, or
otherwise not useful for ID.

The script throttles itself to ~1 request/second (two requests per species —
taxon lookup + observations), well under iNaturalist's 100 req/min limit.

## Flagging poor-quality photos

Not every research-grade iNaturalist photo is a good ID puzzle — some are
blurry, mostly hand, or shot from a useless angle. There are two layers:

- **In-game flag button** ("🚩 Flag this photo as poor quality") hides that
  photo for the rest of the session, immediately swaps in a different photo of
  the same species, and logs the URL to the browser console.
- **Permanent exclusion**: paste that logged URL into the species'
  `excludedImages` array in `species.json`. The game never serves an excluded
  photo, and `fetch-images.js` will never re-add it on future runs.

```json
{
  "id": "bluegill",
  "images": ["...", "..."],
  "excludedImages": [
    "https://inaturalist-open-data.s3.amazonaws.com/photos/123456/large.jpg"
  ],
  "hints": ["", "", ""]
}
```

Open the browser console (Safari: Develop → Show JavaScript Console; Chrome:
⌥⌘J) while playing to collect the URLs you flag.

## Writing hints

`species.json` ships with all 11 entries pre-populated (id, commonName,
sciName) but empty `hints` arrays. Each species needs exactly 3 hint strings,
revealed one at a time after each wrong guess:

```json
"hints": [
  "subtle hint shown after guess 1",
  "medium hint shown after guess 2",
  "dead-giveaway hint shown after guess 3"
]
```

An empty string is treated as "no hint yet" and is silently skipped in the
UI, so you can fill these in incrementally.

## Previewing the site locally

**The local server is a preview convenience, not a runtime dependency.** The
site is 100% static — HTML, CSS, JS, and a JSON file. Nothing server-side runs
at any point, and Python is not required to *host* it, only to preview it
conveniently on your own machine.

The reason a local server is needed at all: `game.js` loads `species.json` via
`fetch()`, and browsers block `fetch()` from a bare `file://` URL for security
reasons. Any real HTTP host (including GitHub Pages) serves it over `https://`,
where this is a non-issue.

Any of these work locally:

```bash
# Python 3 (built-in on most systems)
python3 -m http.server 8000

# Node, no install
npx serve .

# Node, no install (alternative)
npx http-server -p 8000
```

Then open `http://localhost:8000` in your browser.

## Deploying to GitHub Pages

No build step, no server, no Python — GitHub Pages serves these files as-is.

```bash
git add -A
git commit -m "Fishdle"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

Then in the repo on github.com: **Settings → Pages → Source: "Deploy from a
branch" → Branch: `main`, folder: `/ (root)` → Save.**

After a minute or so the game is live at
`https://<your-username>.github.io/<repo-name>/`.

Re-running `fetch-images.js` later just changes `species.json` — commit and
push it and the live site picks up the new photos.

### Other static hosts

**Netlify / Cloudflare Pages**: point either at this repo with an empty build
command and `/` as the publish directory.

## Out of scope for this pass

- Persisting streak/score across page reloads (localStorage)
- Score sharing / emoji grid like Wordle
- Backend or database of any kind

Session streak/score currently live in memory only and reset on page reload
by design.
