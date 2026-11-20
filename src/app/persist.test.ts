import { describe, it, expect, vi } from 'vitest';
import { ensurePersisted } from './persist';

describe('ensurePersisted', () => {
  it('asks again on a later start when not yet persisted', async () => {
    const storage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) };
    expect(await ensurePersisted(storage)).toBe(true);
    expect(storage.persist).toHaveBeenCalledTimes(1);
  });
  it('does not ask when already persisted', async () => {
    const storage = { persisted: vi.fn(async () => true), persist: vi.fn(async () => true) };
    expect(await ensurePersisted(storage)).toBe(true);
    expect(storage.persist).not.toHaveBeenCalled();
  });
});
