# SlimSAM Stamp Finding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find far more stamps automatically on album pages and club photos by adding SlimSAM (grid of point prompts) to the existing detector, and use SlimSAM for tap-to-select.

**Architecture:** `src/core/samPick.ts` holds the pure post-processing (mask → box candidate, filtering, merging with the classical detector) and is unit-tested with synthetic masks. `src/core/sam.ts` wraps the SlimSAM model (image embedding once, batched point prompts). The worker's `detect` becomes classical + SAM merged, with progress messages; `snap` tries a SAM point prompt first. Builds on branch `manual-frames`.

**Tech Stack:** existing (`@huggingface/transformers` `SamModel` with `Xenova/slimsam-77-uniform`, q8, ~13 MB).

**Spec:** `docs/superpowers/specs/2026-11-20-stamp-matcher-design.md`; spike evidence: `trial/sam-spike.ts` (user approved integration after the spike: ~22/27 vs 14/27 on the user's own page, ~20/21 vs ~8/21 on touching stamps).

## Global Constraints

- Offline after first load; no network besides one-time model downloads (now DINOv2 24 MB + SlimSAM 13 MB).
- SAM runs at 1024 px longest side; box coordinates returned in the caller's image coordinates.
- Never silently drop a stamp the classical detector found: SAM boxes are **added** and duplicates merged; the user still edits.
- Page detection must report progress (it takes ~20–40 s on a phone).
- If SlimSAM fails to load, detection falls back to the classical detector (no error for the user).

## Review Focus

1. SlimSAM unavailable (offline first run, load error) — `detect` still returns classical boxes (test in Task 3).
2. A stamp found by both methods appears once, not twice (test in Task 1).
3. Long detection — UI shows progress and stays responsive; a second photo while busy doesn't mix results (test in Task 4).
4. Tap on a stamp touching its neighbours — box covers only the tapped stamp (SAM point path; covered by the spike, unit-tested via `bestPointBox` selection in Task 1).
5. Portrait sub-boxes / dark empty strip — filtered out (tests in Task 1).

---

### Task 1: SAM post-processing (pure)

**Files:** Create `src/core/samPick.ts`; Test `src/core/samPick.test.ts`

**Interfaces — Produces:**
- `type SamCand = Box & { score: number }`
- `maskBox(mask: Float32Array, offset: number, validW: number, validH: number, scale: number): { box: Box; fill: number } | null` — bbox of `mask > 0` within the valid `validW×validH` region of a 256×256 low-res mask, scaled by `scale` (= image px per mask px)
- `isStampLike(b: { box: Box; fill: number }, iou: number, imgW: number, imgH: number): boolean` — `iou ≥ 0.85`, `fill ≥ 0.85`, area 0.2%–30% of the image, aspect ≤ 3.5
- `isEmptyStrip(img: RgbaImage, b: Box): boolean` — sampled mean < 110 and std < 18
- `pickStamps(cands: SamCand[]): Box[]` — NMS (IoU > 0.6, keep higher score); drop boxes containing ≥ 2 kept boxes (> 85% inside); drop boxes > 85% inside a kept box at least 15% larger (stamp parts)
- `bestPointBox(masks: { box: Box; fill: number; iou: number }[], imgW: number, imgH: number): Box | null` — the smallest stamp-like mask of the 3 for a tap, else null
- `mergeDetections(classical: Detected[], sam: Box[]): Detected[]` — classical items kept as they are; a SAM box is added as `{ kind: 'single', inner: [] }` unless it overlaps a classical box with IoU > 0.5 or lies > 85% inside one

- [ ] Tests: `maskBox` on a synthetic 256² mask with a 40×50 block at (10,20), scale 4 → `{x:40,y:80,w:160,h:200}`, fill 1; ignores mask pixels outside the valid region. `isStampLike` rejects iou 0.8, fill 0.7, 0.1% area, aspect 4. `isEmptyStrip` true for a flat dark box, false for a stamp. `pickStamps`: duplicate boxes → one; a row box containing two stamps → dropped; a portrait box inside a stamp → dropped. `bestPointBox` picks the smallest stamp-like of three nested masks. `mergeDetections`: SAM duplicate of a classical box not added; a new SAM box added; classical blocks keep their inner boxes.
- [ ] Run (FAIL) → implement → run (PASS) → commit `feat(core): SAM box post-processing`.

### Task 2: SlimSAM wrapper

**Files:** Create `src/core/sam.ts`; Test `src/core/sam.slow.test.ts`

**Interfaces — Produces:**
- `createSegmenter(): Promise<Segmenter>` (cached; failed load not cached) with `prepare(img: RgbaImage): Promise<Prepared>` (resize to 1024 longest side, image embedding) and `Prepared.points(pts: [number, number][]): Promise<{ box: Box; fill: number; iou: number }[][]>` (per point, 3 masks; boxes in the caller's image coordinates)
- `samFindStamps(img: RgbaImage, onProgress?: (f: number) => void): Promise<Box[]>` — grid every 44 px at 1024 scale, batches of 64, skips points inside boxes already kept with iou > 0.95 & fill > 0.9; candidates through `isStampLike`, `isEmptyStrip`, `pickStamps`
- `samBoxAt(img: RgbaImage, x: number, y: number): Promise<Box | null>` — `bestPointBox` of one point prompt

- [ ] Slow test (downloads the model): synthetic page with 6 stamps where two pairs touch edge-to-edge → `samFindStamps` returns ≥ 5 boxes each within ±10 px of a true stamp; `samBoxAt` on one of the touching stamps returns its box (±10 px).
- [ ] Run (FAIL) → implement → run (PASS) → commit `feat(core): SlimSAM segmenter`.

### Task 3: Worker — merged detection with progress, SAM tap

**Files:** Modify `src/worker/handlers.ts`, `src/worker/client.ts`; Test `src/worker/client.test.ts`, `src/worker/handlers.test.ts`

**Interfaces:**
- `Handlers.detect(img, onProgress?)`: classical `detectItems` + `samFindStamps` → `mergeDetections`; if SAM throws, return classical
- `Handlers.snap`: `samBoxAt` first, else `snapBoxAt`
- `Handlers.warmUp`: also `createSegmenter()` (failure there doesn't fail warm-up)
- RPC progress: worker posts `{ id, progress: number }`; client method signature `detect(img, onProgress?)` forwards it (callbacks are not sent over the wire)
- Handlers take their dependencies through `makeHandlers(deps)` so tests can fake SAM

- [ ] Tests: `client`: progress messages before the reply reach `onProgress`, in order. `handlers`: `detect` with a SAM fake that throws → classical result; with a SAM fake returning one extra box → merged result has it; `snap` uses SAM box when available, classical when SAM returns null.
- [ ] Run (FAIL) → implement → run (PASS) → commit `feat(worker): SAM in detection and tap`.

### Task 4: UI progress

**Files:** Modify `src/app/screens/PageCapture.tsx`, `src/app/screens/Check.tsx`, i18n; Test `src/app/screens/PageCapture.test.tsx`

- Page screen shows `t('findingStampsPct', { pct })` while detecting; a new photo chosen while detecting replaces the old run (results of a stale run are ignored — request counter).
- [ ] Tests: fake recognizer reporting 0.5 progress → "50%" visible; two photos in quick succession → only the second photo's boxes shown.
- [ ] Run (FAIL) → implement → run (PASS); `npm run build` → commit `feat(app): detection progress`.
