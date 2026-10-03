import { useSyncExternalStore } from "react";

/**
 * Which schedules have their Meta card open. Kept outside the page so the choice is remembered while
 * other tabs are visited; `only` is called whenever a different schedule becomes current, so that
 * the current one is the one open.
 */
let open: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const set = (next: ReadonlySet<string>) => {
  open = next;
  listeners.forEach((l) => l());
};

export const metaOpen = {
  only: (id: string) => set(new Set(id ? [id] : [])),
  toggle: (id: string) => set(new Set(open.has(id) ? [...open].filter((x) => x !== id) : [...open, id])),
  get: () => open,
};

export const useMetaOpen = (): ReadonlySet<string> =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => open,
  );
