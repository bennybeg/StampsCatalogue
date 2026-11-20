import { colorSimilarity } from './color';

export type IndexEntry = { id: string; embedding: Float32Array; color: Float32Array };
export type Match = { id: string; score: number; visual: number; color: number };

/** Top-k entries by `(1 - colorWeight) * cosine + colorWeight * colour intersection`. Embeddings are L2-normalized. */
export function rankMatches(
  query: Omit<IndexEntry, 'id'>,
  index: IndexEntry[],
  opts: { k?: number; colorWeight?: number } = {},
): Match[] {
  const k = opts.k ?? 5;
  const cw = opts.colorWeight ?? 0.3;
  const q = query.embedding;
  const all: Match[] = index.map((e) => {
    let dot = 0;
    for (let i = 0; i < q.length; i++) dot += q[i] * e.embedding[i];
    const color = colorSimilarity(query.color, e.color);
    return { id: e.id, score: (1 - cw) * dot + cw * color, visual: dot, color };
  });
  return all.sort((a, b) => b.score - a.score).slice(0, k);
}
