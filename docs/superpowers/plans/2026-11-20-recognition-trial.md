# Recognition Core + Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the browser-compatible recognition core (stamp detection, colour signature, image embedding, ranking) and a Node trial harness that runs it on real album/club photos, so the detection method and embedding model are chosen from evidence before any UI is built.

**Architecture:** `src/core/` holds pure TypeScript modules that operate on an in-memory `RgbaImage` and run unchanged in the browser later (OpenCV.js + transformers.js, both WASM). `trial/` holds Node-only scripts that load photos with `sharp`, call the core, and write annotated images and an HTML report to `trial-output/`. The app (UI, IndexedDB, PWA) is a separate later plan.

**Tech Stack:** TypeScript, Node 20+, Vitest, `@techstark/opencv-js`, `@huggingface/transformers`, `sharp` (trial only), `tsx` to run scripts.

**Spec:** `docs/superpowers/specs/2026-11-20-stamp-matcher-design.md`

## Global Constraints

- Everything in `src/core/` must be browser-compatible: no `fs`, `path`, `sharp`, or other Node-only imports.
- All recognition runs locally; no network calls except the one-time model download.
- Model size: "tens of MB, not hundreds" — reject candidates whose quantized weights exceed ~100 MB.
- Search over ~3000 items must take < ~1 s after the query embedding is computed.
- Crops keep the full stamp edge plus a small margin (perforations visible): margin = 4% of the box's longer side, clamped to image bounds.
- Matching must be postmark-tolerant (used ↔ unused match) yet rank colour, value, perforated/imperforate and overprinted/plain variants apart where it can.
- `test-photos/` and `trial-output/` are git-ignored; never commit their contents.

## Review Focus

1. **Phone photos with EXIF rotation** — a portrait photo must load upright, not sideways (test in Task 6).
2. **Full-resolution 12–50 MP photos** — detection must downscale internally and still return boxes in original-image coordinates (test in Task 3).
3. **Adjacent stamps separated by a thin gap** — must come back as two items, not one merged box (test in Task 3).
4. **Slightly rotated stamps on the page** — the returned box must still contain the whole stamp, edges included (test in Task 3).
5. **A page with no stamps / blank photo** — returns an empty list, no crash (test in Task 3).

---

## Test photo layout (the user provides these)

```
test-photos/
  pages/      album page photos (*.jpg)
  club/       single-stamp photos taken "as at the club" (*.jpg)
  labels.json optional: { "<club file name>": "<page file name>#<item index>" }
```

---

### Task 1: Project scaffold + image utilities

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `src/core/image.ts`
- Modify: `.gitignore` (add `trial-output/`)
- Test: `src/core/image.test.ts`

**Interfaces:**
- Produces:
  - `type RgbaImage = { width: number; height: number; data: Uint8ClampedArray }` (RGBA, row-major)
  - `type Box = { x: number; y: number; w: number; h: number }` (integer pixels, original-image coords)
  - `crop(img: RgbaImage, box: Box): RgbaImage`
  - `withMargin(box: Box, img: RgbaImage, ratio = 0.04): Box` — expands by `ratio * max(w,h)` each side, clamped
  - `resizeTo(img: RgbaImage, maxSide: number): { image: RgbaImage; scale: number }` — returns original if already small; `scale` = new/old

- [ ] **Step 1:** `npm init`, install dev deps `typescript vitest tsx @types/node`, deps `@techstark/opencv-js @huggingface/transformers sharp`. Scripts: `"test": "vitest run"`, `"test:slow": "vitest run --config vitest.slow.config.ts"`. tsconfig: `strict`, `module: ESNext`, `moduleResolution: Bundler`, `target: ES2022`.
- [ ] **Step 2: Write failing tests** in `image.test.ts`:
  - `crop` of a 10×10 image with box `{x:2,y:3,w:4,h:5}` → width 4, height 5, pixel (0,0) equals source pixel (2,3).
  - `withMargin({x:10,y:10,w:100,h:50}, 200×200 img)` → `{x:6,y:6,w:108,h:58}`.
  - `withMargin({x:0,y:0,w:100,h:100}, 100×100 img)` → `{x:0,y:0,w:100,h:100}` (clamped).
  - `resizeTo(4000×3000, 1600)` → image 1600×1200, scale 0.4; `resizeTo(800×600, 1600)` → same object, scale 1.
- [ ] **Step 3:** Run `npm test` — expect FAIL (module not found).
- [ ] **Step 4:** Implement `src/core/image.ts` (resize: bilinear or area averaging, pure TS).
- [ ] **Step 5:** Run `npm test` — expect PASS.
- [ ] **Step 6:** Commit `feat: scaffold project and image utilities`.

---

### Task 2: Colour signature

**Files:**
- Create: `src/core/color.ts`
- Test: `src/core/color.test.ts`

**Interfaces:**
- Consumes: `RgbaImage`
- Produces:
  - `colorSignature(img: RgbaImage): Float32Array` — HSV histogram, 8 hue × 3 sat × 3 val = 72 bins, L1-normalized, computed over the **central 70%** of the image (reduces postmark/edge influence)
  - `colorSimilarity(a: Float32Array, b: Float32Array): number` — histogram intersection in [0,1]

- [ ] **Step 1: Write failing tests:**
  - Solid red vs solid red → similarity `> 0.99`.
  - Solid red vs solid blue → similarity `< 0.1`.
  - Red image vs same red image with a black 30%-area blob in one corner (fake postmark) → similarity `> 0.7`.
  - Signature length 72, sums to 1 (±1e-5).
- [ ] **Step 2:** Run `npm test -- color` — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat: colour signature`.

---

### Task 3: Item detection on a page

**Files:**
- Create: `src/core/cv.ts`, `src/core/detect.ts`
- Test: `src/core/detect.test.ts`, `src/core/testing/synthetic.ts` (helpers to draw rectangles on a background)

**Interfaces:**
- Consumes: `RgbaImage`, `Box`, `resizeTo`
- Produces:
  - `getCv(): Promise<CV>` — loads OpenCV.js once, resolves when runtime ready
  - `type Detected = { box: Box; kind: 'single' | 'block' | 'cover'; inner: Box[] }`
  - `detectItems(img: RgbaImage, opts?: { workingMaxSide?: number /* default 1600 */ }): Promise<Detected[]>` — boxes in original coords, sorted top-to-bottom then left-to-right (row tolerance = 25% of median box height); `inner` empty in this task
  - `drawRect(img, box, rgb)` and `blankImage(w, h, rgb)` in `synthetic.ts`

Approach: downscale with `resizeTo`; grayscale → Gaussian blur → Canny + dilate **and** Otsu threshold; `findContours(RETR_EXTERNAL)`; keep contours whose `minAreaRect` area ≥ 0.2% of the page and whose contour fills ≥ 70% of that rect; use the axis-aligned bounding rect of the rotated rect; scale back; drop boxes ≥ 90% overlapped by another. `kind`: `'cover'` if longer side ≥ 3× the median single-stamp longer side and aspect between 1.3 and 2.6; otherwise `'single'` (blocks are classified in Task 4).

- [ ] **Step 1: Write failing tests** (synthetic dark-grey 1200×1600 page, light stamps with a darker inner design):
  - 6 separated stamps in a 2×3 grid → 6 items, order row-major.
  - Two stamps 4 px apart (at 1200×1600) → 2 items.
  - Stamp rotated 8° → 1 item whose box contains all 4 rotated corners.
  - Same 6-stamp page upscaled to 6000×8000 → 6 items, boxes = original × 5 (±2%).
  - Blank page → `[]`.
  - 1 envelope-sized rectangle (900×500) + 3 stamps (120×150) → envelope `kind: 'cover'`.
- [ ] **Step 2:** Run `npm test -- detect` — FAIL.
- [ ] **Step 3:** Implement `getCv` and `detectItems`.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat: page item detection`.

---

### Task 4: Inner stamps in blocks and covers

**Files:**
- Modify: `src/core/detect.ts`
- Test: `src/core/detect.test.ts`

**Interfaces:**
- Produces: `detectInner(item: RgbaImage): Promise<Box[]>` (coords relative to the item); `detectItems` now fills `inner` for every item and sets `kind: 'block'` when an item that isn't a cover has ≥ 2 inner stamps.

Approach: inside an item, stamps in a block are joined by perforation lines, so look for regularly spaced bright/dark lines (row/column projection profiles of an edge map) and split into a grid; for covers, run the page detector on the cover crop with a lower min-area (stamps are small relative to the envelope) and return rectangles in the upper-right half first.

- [ ] **Step 1: Write failing tests:**
  - Synthetic 2×2 block (four 120×150 stamps touching, separated by a 2 px dotted line) → `kind: 'block'`, 4 inner boxes, each within ±6 px of truth.
  - Single stamp → `kind: 'single'`, `inner` length ≤ 1.
  - Cover with one stamp drawn in the upper-right → `kind: 'cover'`, 1 inner box overlapping truth with IoU ≥ 0.7.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run full `npm test` — PASS (Task 3 tests still pass).
- [ ] **Step 5:** Commit `feat: detect stamps inside blocks and covers`.

---

### Task 5: Embedder + ranking

**Files:**
- Create: `src/core/embed.ts`, `src/core/match.ts`
- Create: `vitest.slow.config.ts` (includes `**/*.slow.test.ts`, 5-min timeout; default config excludes them)
- Test: `src/core/match.test.ts`, `src/core/embed.slow.test.ts`

**Interfaces:**
- Consumes: `RgbaImage`, `colorSignature`, `colorSimilarity`
- Produces:
  - `MODEL_CANDIDATES: readonly string[]` — `['Xenova/dinov2-small', 'Xenova/clip-vit-base-patch32']` (verify both ids exist on huggingface.co with ONNX weights; if one doesn't, substitute its `onnx-community/` equivalent and note it in the commit message)
  - `createEmbedder(modelId: string, opts?: { quantized?: boolean /* default true */ }): Promise<Embedder>`
  - `interface Embedder { modelId: string; dim: number; embed(img: RgbaImage): Promise<Float32Array> }` — output L2-normalized
  - `type IndexEntry = { id: string; embedding: Float32Array; color: Float32Array }`
  - `type Match = { id: string; score: number; visual: number; color: number }`
  - `rankMatches(query: Omit<IndexEntry,'id'>, index: IndexEntry[], opts?: { k?: number /* 5 */; colorWeight?: number /* 0.3 */ }): Match[]` — `visual` = cosine, `score = (1-colorWeight)*visual + colorWeight*color`, descending

- [ ] **Step 1: Write failing fast tests** (`match.test.ts`, hand-built vectors):
  - Query identical to entry `b` → `b` ranks first, `visual` ≈ 1.
  - Two entries with equal `visual`, different `color` → higher-colour one ranks first.
  - `k: 2` on 5 entries → 2 results.
  - 3000 random 384-d entries → `rankMatches` completes in < 100 ms.
- [ ] **Step 2: Write failing slow test** (`embed.slow.test.ts`), for each candidate: embedding length = `dim`, norm ≈ 1; a synthetic stamp vs itself with a dark blob over 20% (fake postmark) has cosine **higher** than vs a different synthetic stamp design.
- [ ] **Step 3:** Run `npm test -- match` and `npm run test:slow` — FAIL.
- [ ] **Step 4:** Implement `match.ts`; implement `embed.ts` with `pipeline('image-feature-extraction', modelId)`, converting `RgbaImage` → `RawImage` (drop alpha), CLS/pooled output, L2 normalize.
- [ ] **Step 5:** Run both — PASS.
- [ ] **Step 6:** Commit `feat: embedder and ranking`.

---

### Task 6: Trial — detection report

**Files:**
- Create: `trial/load.ts`, `trial/detect-pages.ts`
- Test: `trial/load.test.ts`

**Interfaces:**
- Consumes: `detectItems`, `crop`, `withMargin`
- Produces:
  - `loadImage(path: string): Promise<RgbaImage>` — via `sharp(path).rotate()` (applies EXIF orientation) `.ensureAlpha().raw()`
  - `saveImage(img: RgbaImage, path: string): Promise<void>` (JPEG q85)
  - Script `npx tsx trial/detect-pages.ts` writes, per page: `trial-output/pages/<name>.annotated.jpg` (boxes coloured by kind, inner boxes thin, index numbers) and crops `trial-output/crops/<name>#<i>.jpg` (with margin); plus `trial-output/crops/index.json`: `[{ id, page, index, kind, box }]`. Prints per-page item counts and time.

- [ ] **Step 1: Write failing test:** a JPEG written by `sharp` with EXIF orientation 6 from a 200×100 raw image loads as 100×200.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement `load.ts` and `detect-pages.ts` (inner stamps of blocks/covers are also cropped as `<name>#<i>.<j>.jpg` and listed with `kind: 'inner'`, `parent`).
- [ ] **Step 4:** Run test — PASS. Run the script on `test-photos/pages/` — expect annotated images for every page, no crash.
- [ ] **Step 5:** Commit `feat: trial detection report` (code only; `trial-output/` stays ignored).

---

### Task 7: Trial — matching report

**Files:**
- Create: `trial/match-club.ts`

**Interfaces:**
- Consumes: `loadImage`, `createEmbedder`, `MODEL_CANDIDATES`, `colorSignature`, `rankMatches`, `detectItems`, `trial-output/crops/index.json`
- Produces: script `npx tsx trial/match-club.ts [--colorWeight 0.3]` that, for each model candidate:
  - embeds every crop in `index.json` (timing per crop);
  - for each `test-photos/club/*.jpg`: if `detectItems` finds exactly one item, crops it, else uses the whole photo; ranks top 5;
  - writes `trial-output/report-<model>.html`: one row per club photo — the query thumbnail, then 5 match thumbnails with id, `score`, `visual`, `color`; the correct one (if in `labels.json`) outlined green;
  - prints and writes to the report: model size on disk, average embed ms, and if `labels.json` exists, top-1 and top-5 accuracy.

- [ ] **Step 1:** Implement the script.
- [ ] **Step 2:** Run it on the test photos. Expected: one HTML report per model, accuracy printed when labels exist.
- [ ] **Step 3:** Re-run with `--colorWeight 0` and `0.5` to see the effect of colour weighting.
- [ ] **Step 4:** Commit `feat: trial matching report`.

---

### Task 8: Trial findings

**Files:**
- Create: `docs/superpowers/trial-results.md`

- [ ] **Step 1:** Write the findings, with no photos embedded (privacy): detection hit rate per page (found/actual, counted from annotated images), failure types (glare, mounts, merged neighbours, blocks, covers); per model: top-1/top-5, embed time, size; how close same-set values, perforated/imperforate, overprinted, and used-vs-unused pairs ranked; chosen model and colour weight with the reason; whether an automatic perforation check is worth adding; anything that changes the app plan.
- [ ] **Step 2:** Commit `docs: recognition trial results`.
- [ ] **Step 3:** Share the findings with the user before writing the app plan.
