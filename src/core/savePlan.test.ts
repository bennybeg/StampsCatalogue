import { describe, it, expect } from 'vitest';
import { planPageSave, type Candidate, type Known } from './savePlan';

const unit = (v: number[]) => { const n = Math.hypot(...v); return Float32Array.from(v.map((x) => x / n)); };
const col = (k: number) => { const h = new Float32Array(72); h[k] = 1; return h; };
const A = { embedding: unit([1, 0, 0, 0]), color: col(0) };
const B = { embedding: unit([0, 1, 0, 0]), color: col(1) };
const at = (x: number, y: number) => ({ x, y, w: 0.2, h: 0.2 });
const cand = (tempId: string, pos = at(0.1, 0.1), look = A): Candidate => ({ tempId, pos, ...look });
const known = (id: string, pos: Known['pos'], look = A): Known => ({ id, pos, ...look });

describe('planPageSave', () => {
  it('proposes "already saved" for the same stamp at the same spot', () => {
    expect(planPageSave([cand('c1')], [known('k1', at(0.1, 0.1))], [])).toEqual([{ tempId: 'c1', type: 'alreadySaved', itemId: 'k1', score: expect.any(Number) }]);
  });

  it('treats the same stamp at a different spot as new', () => {
    expect(planPageSave([cand('c1', at(0.6, 0.6))], [known('k1', at(0.1, 0.1))], [])[0].type).toBe('new');
  });

  it('keeps two copies of one stamp as two separate "already saved" items', () => {
    const r = planPageSave([cand('c1', at(0.1, 0.1)), cand('c2', at(0.5, 0.1))], [known('k1', at(0.1, 0.1)), known('k2', at(0.5, 0.1))], []);
    expect(r.map((p) => p.type)).toEqual(['alreadySaved', 'alreadySaved']);
    expect(r.map((p) => (p as { itemId: string }).itemId)).toEqual(['k1', 'k2']);
  });

  it('proposes filing an unfiled stamp that clearly matches', () => {
    const r = planPageSave([cand('c1')], [], [known('u1', undefined), known('u2', undefined, B)]);
    expect(r[0]).toMatchObject({ type: 'fileUnfiled', itemId: 'u1' });
  });

  it('does not guess between two equally good unfiled stamps', () => {
    expect(planPageSave([cand('c1')], [], [known('u1', undefined), known('u2', undefined)])[0].type).toBe('new');
  });

  it('gives one unfiled stamp to at most one candidate', () => {
    const near = { embedding: unit([1, 0.15, 0, 0]), color: col(0) };
    const r = planPageSave([cand('c1', at(0.1, 0.1), near), cand('c2', at(0.5, 0.5))], [], [known('u1', undefined), known('u2', undefined, B)]);
    expect(r.map((p) => p.type)).toEqual(['new', 'fileUnfiled']);
  });
});
