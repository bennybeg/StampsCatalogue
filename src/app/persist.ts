type StorageLike = { persisted(): Promise<boolean>; persist(): Promise<boolean> };

/**
 * Ask the browser not to evict the collection. Chrome often says no before the app is installed and
 * yes afterwards, so this runs on every start until it is granted.
 */
export async function ensurePersisted(storage: StorageLike | undefined): Promise<boolean> {
  if (!storage?.persisted || !storage.persist) return false;
  if (await storage.persisted()) return true;
  return storage.persist();
}
