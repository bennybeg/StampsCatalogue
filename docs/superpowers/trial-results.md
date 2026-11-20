# Recognition trial — results

Date: 2026-11-20 · Data: 13 album-page photos, 4 club photos (all sent via WhatsApp,
so downscaled to 1200×1600). No photos are reproduced here.

## Detection (album pages)

Method: difference from the page colour (most common colour in a 4% border frame),
Otsu threshold, holes filled, connected components; mostly-rectangular blobs are cut
where their outline steps; large items become "sheet"; inner stamps are found by
perforation-gutter splitting (blocks) or rectangle search (sheets/covers).
~50–200 ms per page on a laptop in Node.

Counted by eye from the annotated pages:

| Page type | Result |
|---|---|
| Separated stamps on dark stockbook strips | Nearly all found with tight boxes (e.g. 19/22 singles + 2/2 sheets on one page) |
| Souvenir sheets | Found as one item; inner stamp usually found when it has a visible frame/perforation ring |
| Stamps touching along a whole edge (se-tenant strips, dense rows: DDR, Bulgaria) | Often merged and then dropped — worst page found ~8 of ~21 |
| Stamps next to the light page edge / heavy glare | Sometimes merged into the edge and lost |
| Blocks (gutter split) | Correct on clean white-margin blocks; on coloured items produces thin junk slivers |

Failure types, most important first:
1. **Touching stamps** (whole-edge contact) — cannot be separated from the page colour alone.
2. **Light page edge / glare** joining nearby stamps.
3. **Gutter splitter slivers** on items that aren't true blocks.
4. Covers vs souvenir sheets are indistinguishable automatically — both come out as "sheet".

Conclusion: automatic detection is a good first pass, not a finished answer. The page
setup screen **must** make fixing it fast. Recommended for the app plan:
- **Tap-to-add**: tap a missed stamp, the app grows a rectangle from that point.
- Delete/merge/split of boxes with one gesture.
- Hide inner-stamp slivers under a minimum size (≥ 6% of the item's shorter side and aspect ≤ 2.5).

### After code review

Fixed with tests: thin gaps between stamps in full-resolution photos (working size 2400 px, lighter blur);
diamond/triangle stamps kept (convex-hull check); chains of touching stamps returned as
**unresolved** items for the user instead of silently dropped; a page photographed with the
table around it; a lone cover recognised as a sheet by absolute size; a white band inside one
stamp no longer splits it into a "block" (gutters must show perforation holes). Trade-off:
imperforate joined strips are no longer split automatically.

## Matching

Self-test: each of the 147 real stamp-sized crops was "re-photographed" (rotated 3°,
shrunk to 60%, darkened, blurred, JPEG q60, 12% fake postmark) and searched against all
256 crops from the 13 pages. Harsher than a careful real photo in most ways, though it
has no perspective distortion.

| Model | Size (q8) | Embed time (laptop) | Colour weight | Top-1 | Top-5 |
|---|---|---|---|---|---|
| CLIP ViT-B/32 | 89 MB | 18 ms | 0.3 | 61.9% | 83.7% |
| DINOv2-small | 24 MB | 25 ms | 0.0 | 44% * | 72% * |
| DINOv2-small | 24 MB | 25 ms | 0.3 | 79.6% | 94.6% |
| **DINOv2-small** | **24 MB** | **25 ms** | **0.5** | **84.4%** | **95.9%** |
| DINOv2-small, after review fixes (162 crops) | 24 MB | 25 ms | 0.5 | 79.6% | 96.9% |

\* measured over all 234 crops including junk slivers; the others are over the 147 real crops.
The last row is after the code-review detection fixes: more stamps are found (162 real crops
instead of 147), which adds more same-set look-alikes to the index; top-5 went up and top-1 went down.

Search over 256 entries is ≪ 1 ms; 3000 entries benchmarked < 100 ms in the unit test.

Look-alikes:
- **Perforated vs imperforate** (Polish set, same page): the pair ranks 1st and 2nd with
  near-equal scores (e.g. 0.593 vs 0.582). The picture alone cannot separate them.
- **Values within one set** (Hungarian set): about half of the remaining misses are a
  sibling stamp from the same page ranking first; the right one is almost always in the top 5.
- **Overprint** (Romanian rocket — plain, used, red overprint on one page): two of the three
  were missed by detection, so not measured. Needs a re-test after detection fixes.

Club photos (stamps he probably does not own): top scores 0.46–0.60. True matches in the
self-test: median 0.62, 10th percentile 0.51. **The ranges overlap**, e.g. a Chinese 1958
globe stamp scored 0.60 against a Hungarian Luna stamp with a similar globe-on-blue layout.

## Decisions

- **Model: DINOv2-small (q8, 24 MB), colour weight 0.5.** Smaller and clearly more accurate than CLIP.
- **No yes/no from a score threshold.** Always show the top 5 with the side-by-side view.
  The score can at most order them and colour a hint ("close match" / "no close match").
- **Automatic perforation check: worth adding** in the app plan. The perforated/imperforate
  pairs tie on appearance, and the edge is the only difference. A simple edge-profile
  test (teeth periodicity along the border) can at least flag "edges differ" in the compare view.
- Overprints: rely on the side-by-side view for now; re-measure once detection finds all three Romanian variants.

## What changes the app plan

1. Page setup needs tap-to-add and fast box editing (detection is ~60–95% per page).
2. Item kinds: single / block / **sheet** / cover. The detector proposes "sheet" for big items; he picks cover.
3. Club check: when the photo contains several stamps, he taps the one he means.
4. Model download: 24 MB once.
5. Re-run this trial on **full-resolution** photos from his phone (not WhatsApp copies) before tuning further.
