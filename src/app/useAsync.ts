import { useCallback, useEffect, useState } from 'react';

/** Run an async loader on mount (and on `reload()`); returns its latest value. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): { value: T | undefined; reload(): void } {
  const [value, setValue] = useState<T>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    load().then((v) => { if (live) setValue(v); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { value, reload: useCallback(() => setTick((n) => n + 1), []) };
}
