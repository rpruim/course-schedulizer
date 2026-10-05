import { useCallback, useState } from "react";

/** Choices kept while the app is open, so a page can come back as it was left. */
const kept = new Map<string, unknown>();

/**
 * Like `useState`, but the value is remembered under `key` for the next time a page with that key opens.
 * `fromLink` (a choice a link made) wins over what was remembered, and is remembered in turn.
 */
export function useRemembered<T>(key: string, initial: T, fromLink?: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const v = fromLink !== undefined ? fromLink : kept.has(key) ? (kept.get(key) as T) : initial;
    kept.set(key, v);
    return v;
  });
  const set = useCallback(
    (v: T) => {
      kept.set(key, v);
      setValue(v);
    },
    [key],
  );
  return [value, set];
}
