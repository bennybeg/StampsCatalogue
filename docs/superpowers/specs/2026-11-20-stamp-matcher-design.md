# Stamp Matcher — Design

Date: 2026-11-20

## Intent and why

The user's father collects stamps, mostly space/cosmos themed: 2000+ stamps
arranged in albums, including blocks of joined stamps and first-day covers
(envelopes). Once a week he visits a stamp club to buy new ones, but the
collection is now too big to remember whether he already owns a given stamp.

The app lets him:

1. **Build his collection once** by photographing whole album pages. The app
   finds each item on the page, cuts it out, and stores it with its album/page
   location.
2. **Check a stamp at the club** by photographing it. The app shows the closest
   items from his collection so he can see at a glance whether he has it.
3. **Keep the collection current** by adding stamps he buys, and filing them
   into an album/page later.

Success: at the club, within a few seconds of taking a photo, he can tell
confidently whether he owns the stamp (and in which variant), and where it sits
in his albums.

## Users and environment

- One user: the father. Not technical. Android phone, Chrome.
- UI language: **Russian by default, switchable to English.**
- Club may or may not have internet; the app must work fully **offline** after
  first load.

## What counts as "a different stamp"

He collects each of these separately, so the app must not treat them as the
same stamp:

- different **values** within a set
- different **colours** of the same design
- **perforated vs imperforate** copies of the same stamp
- **overprinted vs plain** copies

He does **not** care much about used vs unused: a postmark must not stop a match.

## Kinds of items

Each record is one physical item, of one of three kinds:

- **Single stamp**
- **Block** — several joined stamps kept as one piece
- **Cover** — an envelope, including first-day covers

He keeps **duplicates**, mostly used copies he plans to trade. Each physical copy
is its own record. A copy can be marked **"for trade"**.

## Goals

### Building the collection

- Detect items on a photo of an album page: single stamps, blocks, and covers.
  He can then correct the result by moving, resizing, adding or deleting boxes,
  and by changing an item's kind.
- Crops keep the **full stamp edge plus a small margin**, so perforations stay
  visible.
- For blocks and covers, the stamps **inside** the item are also detected and
  indexed, linked to the parent item. A club check on a single stamp can then
  find "you have this inside a block / on an envelope".
- Store each item with: image, kind, album number, page number (both empty =
  not yet filed), "for trade" flag, an optional note, and its position on the
  page.
- **Re-photographing a page must never silently drop or merge stamps.** When a
  detected item matches an existing item on the same page in both image and
  position, the app proposes "already saved". He confirms. Anything uncertain is
  asked, not skipped.

### At the club

- Photo of one stamp → the closest owned items, best match first (top 5). Each
  shows a thumbnail, its kind (single / in block / on cover), its location, and
  how many copies he has, including how many are for trade.
- Tapping a match opens a **side-by-side comparison** of the new photo and the
  owned item, zoomable and synchronized. It has quick views of the **edges**
  (perforation) and the **whole face** (overprints, values). This is the safety
  net for differences the matcher can't reliably tell apart.
- Matching should rank colour variants, value variants, perforated/imperforate
  and overprinted/plain versions apart where it can. When it can't be sure, the
  comparison view is how he decides. The app never gives a bare yes/no.
- Postmark-tolerant: used and unused copies of the same stamp must match.
- **"Add to my collection"** from the check screen saves the stamp as **Not yet
  filed**. Optionally he can mark it "for trade" right there.

### Filing and upkeep

- The home screen shows a reminder count of unfiled items. A list lets him
  assign an album/page to each one.
- Auto-filing: when he photographs a page, a detected item that matches an
  unfiled item is proposed as "this is your unfiled stamp X". On confirmation it
  is filed to that page instead of saved as a duplicate.
- Unfiled items count as owned. A match on one says "You have it (not yet
  filed)".
- Browse the collection by album → page. A filter shows items marked for trade.
- Export the whole collection to a single backup file and import it back, to
  restore on a new phone or keep a copy in Google Drive. The app reminds him to
  back up after a large batch of additions.

## Non-goals

- No cloud AI or API calls, no accounts, no server, no sync between devices.
- No catalogue identification (country, year, Scott/Michel number). This could
  be added later: an AI step that reads each stamp can sit on top of the image
  matching.
- No price/value tracking. No trade-management beyond the "for trade" flag.
- No native Android app and no Play Store listing.

## Anti-goals (would be a failure even if it "works")

- A bare yes/no answer. He must always see the candidate images and decide.
- Silently losing or merging a real stamp (duplicates, re-photographed pages).
- Losing the collection (e.g. browser clears storage) with no way back.
- Setup so tedious he gives up partway through 100–200 album pages.
- Needing internet at the club.
- His photos ending up public (e.g. committed to the GitHub repo).

## Constraints

- Runs entirely in the phone browser (mid-range Android, Chrome).
- Static hosting only, free: **GitHub Pages**. Cloudflare Pages is the
  alternative if the code should be private. No backend. Served over HTTPS,
  which camera access requires.
- All user data stays on the device (IndexedDB). Request persistent storage
  (`navigator.storage.persist()`).
- Scale: ~2000–3000 items (more counting stamps indexed inside blocks/covers),
  growing slowly. Search must feel instant (< ~1 s after the photo is
  processed).
- Model download happens once and is cached for offline use. Keep it modest:
  tens of MB, not hundreds.
- Real test photos live in `test-photos/`, which is git-ignored. They must never
  be committed.

## Approaches considered

- **A. On-device image matching only.** An image-recognition model runs in the
  browser and compares embeddings against the stored ones. Free, offline,
  private. Weaker at small printed values and overprints, which the zoomable
  side-by-side comparison makes up for. **Chosen by the user.**
- B. A cloud AI reads each stamp (country, year, value, colour). Most accurate
  on values and gives a searchable catalogue, but needs internet and a small
  API cost.
- C. A + B combined. Best accuracy online, still works offline, but more to
  build.

The user chose A: it is free, works offline and has no outside dependency. B's
reading step can be added later on top of A.

## Decided parts of the how

- Installable PWA (home-screen icon, offline via service worker).
- Matching: on-device image embedding with nearest-neighbour search, combined
  with a colour signal.
- Page detection is automatic, with a manual correction screen.
- Russian/English UI with a language switch.
- Backup: export/import a single file holding all images and metadata.
- **Build order: a short trial comes first.** Before any UI, test detection and
  matching on the real photos in `test-photos/`: same-set values,
  perforated/imperforate pairs if available, blocks, covers, and used vs unused
  copies. The detection method and embedding model are chosen from those
  results. The UI is built after the trial.

## Left to the builder

- Framework and build tooling.
- Choice of embedding model (e.g. DINOv2-small or a MobileNet-class model, run
  through ONNX Runtime Web or transformers.js) and its quantization, decided by
  the trial results.
- How to combine visual and colour similarity, and how to make matching
  postmark-tolerant.
- Whether to add an automatic perforation check (e.g. a profile of the edge
  teeth along the border) or an overprint signal beyond the comparison view.
  Decide based on the trial.
- Stamp, block and cover detection method (e.g. OpenCV.js). Also how to handle
  glare, clear mounts, plastic sleeves and dark album backgrounds.
- Perspective/rotation correction of crops.
- Backup file format.
- Thresholds for "already saved" and "your unfiled stamp" proposals.
- Visual design, within these limits: large touch targets, readable for an
  older user, and as few steps as possible.

## Open risks

- Value-only, perforation-only and overprint-only differences may rank close
  together. The comparison view is the safety net, and the trial will show how
  close they come.
- Detection quality depends heavily on his actual album pages and on how club
  photos are taken (through sleeves or stock cards).
- Matching a single stamp against stamps inside blocks and covers depends on
  finding the inner stamps well.

## Decisions from the recognition trial (2026-11-20)

See `docs/superpowers/trial-results.md`. Approved by the user: continue with automatic detection
as the first pass, with correction.

- Model: DINOv2-small (q8, ~24 MB, one-time download), colour weight 0.5.
- Item kinds: single / block / **sheet** (souvenir sheet) / cover. The detector proposes "sheet"
  for large items; he can change it to cover.
- Page correction screen gains **tap-to-add** (tap a missed stamp, the app snaps a box to it) and
  shows **"needs splitting"** items (touching stamps the detector couldn't cut) for him to fix.
- At the club, if the photo shows several stamps, he taps the one he means.
- The comparison view shows an automatic **"edges differ"** hint (perforated vs imperforate).
- No yes/no from a score threshold: always the top 5 with pictures.
