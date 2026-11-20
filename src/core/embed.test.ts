import { describe, it, expect, vi } from 'vitest';
import * as hf from '@huggingface/transformers';
import { createEmbedder } from './embed';

describe('createEmbedder', () => {
  it('retries a model load that failed instead of caching the failure', async () => {
    const spy = vi.spyOn(hf.AutoProcessor, 'from_pretrained').mockRejectedValue(new Error('offline'));
    await expect(createEmbedder('nobody/missing-model')).rejects.toThrow('offline');
    await expect(createEmbedder('nobody/missing-model')).rejects.toThrow('offline');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
