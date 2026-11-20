import { colorSimilarity } from './color';

export type NBox = { x: number; y: number; w: number; h: number };
export type Candidate = { tempId: string; pos: NBox; embedding: Float32Array; color: Float32Array };
export type Known = { id: string; pos?: NBox; embedding: Float32Array; color: Float32Array };
export type Proposal =
  | { tempId: string; type: 'new' }
  | { tempId: string; type: 'alreadySaved'; itemId: string; score: number }
  | { tempId: string; type: 'fileUnfiled'; itemId: string; score: number };

export const ALREADY_MIN_IOU = 0.5;
export const ALREADY_MIN_SCORE = 0.5;
export const UNFILED_MIN_SCORE = 0.6;
export const UNFILED_MIN_MARGIN = 0.03;
const COLOR_WEIGHT = 0.5;

function score(a: { embedding: Float32Array; color: Float32Array }, b: { embedding: Float32Array; color: Float32Array }): number {
  let dot = 0;
  for (let i = 0; i < a.embedding.length; i++) dot += a.embedding[i] * b.embedding[i];
  return (1 - COLOR_WEIGHT) * dot + COLOR_WEIGHT * colorSimilarity(a.color, b.color);
}

function iou(a: NBox, b: NBox): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

type Pair = { c: number; itemId: string; score: number };

/** Assign pairs greedily by descending score; each candidate and each known item used once. */
function greedy(pairs: Pair[], taken: Set<number>): Map<number, Pair> {
  const used = new Set<string>(), out = new Map<number, Pair>();
  for (const p of [...pairs].sort((a, b) => b.score - a.score)) {
    if (taken.has(p.c) || out.has(p.c) || used.has(p.itemId)) continue;
    out.set(p.c, p);
    used.add(p.itemId);
  }
  return out;
}

/**
 * Proposals for the stamps found on a (re)photographed page. Every non-'new' proposal must be
 * confirmed by the user; nothing here is applied silently.
 */
export function planPageSave(cands: Candidate[], onPage: Known[], unfiled: Known[]): Proposal[] {
  const already: Pair[] = [];
  cands.forEach((c, ci) => {
    for (const k of onPage) {
      if (!k.pos || iou(c.pos, k.pos) < ALREADY_MIN_IOU) continue;
      const s = score(c, k);
      if (s >= ALREADY_MIN_SCORE) already.push({ c: ci, itemId: k.id, score: s });
    }
  });
  const alreadyMap = greedy(already, new Set());

  const filing: Pair[] = [];
  cands.forEach((c, ci) => {
    if (alreadyMap.has(ci)) return;
    const ranked = unfiled.map((u) => ({ id: u.id, s: score(c, u) })).sort((a, b) => b.s - a.s);
    const [best, second] = ranked;
    if (best && best.s >= UNFILED_MIN_SCORE && best.s - (second?.s ?? -Infinity) >= UNFILED_MIN_MARGIN)
      filing.push({ c: ci, itemId: best.id, score: best.s });
  });
  const filingMap = greedy(filing, new Set(alreadyMap.keys()));

  return cands.map((c, ci): Proposal => {
    const a = alreadyMap.get(ci);
    if (a) return { tempId: c.tempId, type: 'alreadySaved', itemId: a.itemId, score: a.score };
    const f = filingMap.get(ci);
    if (f) return { tempId: c.tempId, type: 'fileUnfiled', itemId: f.itemId, score: f.score };
    return { tempId: c.tempId, type: 'new' };
  });
}
