import { describe, it, expect } from 'vitest';
import { rankMatches, type IndexEntry } from './match';

function unit(v: number[]): Float32Array {
  const n = Math.hypot(...v);
  return Float32Array.from(v.map((x) => x / n));
}
const hist = (k: number) => { const h = new Float32Array(4); h[k] = 1; return h; };

const entries: IndexEntry[] = [
  { id: 'a', embedding: unit([1, 0, 0]), color: hist(0) },
  { id: 'b', embedding: unit([0, 1, 0]), color: hist(1) },
  { id: 'c', embedding: unit([0, 0, 1]), color: hist(2) },
  { id: 'd', embedding: unit([1, 1, 0]), color: hist(3) },
  { id: 'e', embedding: unit([0, 1, 1]), color: hist(0) },
];

describe('rankMatches', () => {
  it('ranks the identical entry first with visual similarity 1', () => {
    const [top] = rankMatches({ embedding: unit([0, 1, 0]), color: hist(1) }, entries);
    expect(top.id).toBe('b');
    expect(top.visual).toBeCloseTo(1, 5);
  });

  it('breaks a visual tie by colour', () => {
    const tied: IndexEntry[] = [
      { id: 'blue', embedding: unit([1, 0, 0]), color: hist(2) },
      { id: 'red', embedding: unit([1, 0, 0]), color: hist(0) },
    ];
    const ranked = rankMatches({ embedding: unit([1, 0, 0]), color: hist(0) }, tied);
    expect(ranked.map((m) => m.id)).toEqual(['red', 'blue']);
    expect(ranked[0].score).toBeCloseTo(1, 5);
    expect(ranked[1].score).toBeCloseTo(0.7, 5);
  });

  it('returns k results', () => {
    expect(rankMatches({ embedding: unit([1, 0, 0]), color: hist(0) }, entries, { k: 2 })).toHaveLength(2);
  });

  it('searches 3000 384-d entries in under 100 ms', () => {
    const rand = () => unit(Array.from({ length: 384 }, () => Math.random() - 0.5));
    const big: IndexEntry[] = Array.from({ length: 3000 }, (_, i) => ({ id: String(i), embedding: rand(), color: new Float32Array(72).fill(1 / 72) }));
    const q = { embedding: rand(), color: new Float32Array(72).fill(1 / 72) };
    rankMatches(q, big); // warm-up
    const t = performance.now();
    rankMatches(q, big);
    expect(performance.now() - t).toBeLessThan(100);
  });
});
