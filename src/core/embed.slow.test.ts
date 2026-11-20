import { describe, it, expect } from 'vitest';
import { createEmbedder, MODEL_CANDIDATES } from './embed';
import { stampArt, withPostmark } from './testing/synthetic';

const cos = (a: Float32Array, b: Float32Array) => a.reduce((s, v, i) => s + v * b[i], 0);

describe.each(MODEL_CANDIDATES)('embedder %s', (modelId) => {
  it('produces unit-length vectors of the declared size', async () => {
    const e = await createEmbedder(modelId);
    const v = await e.embed(stampArt('planet'));
    expect(v.length).toBe(e.dim);
    expect(Math.hypot(...v)).toBeCloseTo(1, 4);
  });

  it('ranks a postmarked copy closer than a different design', async () => {
    const e = await createEmbedder(modelId);
    const planet = await e.embed(stampArt('planet'));
    const used = await e.embed(withPostmark(stampArt('planet'), 0.2));
    const rocket = await e.embed(stampArt('rocket'));
    expect(cos(planet, used)).toBeGreaterThan(cos(planet, rocket));
  });
});
