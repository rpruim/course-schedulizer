import { useCallback, useMemo, useState } from "react";
import { pairingFingerprint, type PairOverride, type PairRef, type Schedule } from "@schedulizer/core";

const KEY = "schedulizer:pairings";
const MAX_KEPT = 30;

/** The user's pairing choices, by the comparison they were made in (the schedules compared, as they were). */
type Store = Record<string, PairOverride[]>;

/** Names a set of schedules and what is in them: it changes when a schedule is edited or the set changes. */
export const pairingSignature = (entries: { id: string; schedule: Schedule }[]): string =>
  entries.map((e) => `${e.id}:${pairingFingerprint(e.schedule)}`).sort().join("|");

const same = (a: PairRef, b: PairRef) => a.schedule === b.schedule && a.section === b.section && a.who === b.who;
const involves = (o: PairOverride, r: PairRef) => same(o.a, r) || same(o.b, r);
const between = (o: PairOverride, a: PairRef, b: PairRef) => (same(o.a, a) && same(o.b, b)) || (same(o.a, b) && same(o.b, a));

/** Say two sections are the same one (replacing any earlier choice that involved either of them). */
export const withPair = (list: PairOverride[], a: PairRef, b: PairRef): PairOverride[] => [
  ...list.filter((o) => !(o.kind === "pair" && (involves(o, a) || involves(o, b))) && !between(o, a, b)),
  { kind: "pair", a, b },
];

/** Say two sections are not the same one. */
export const withApart = (list: PairOverride[], a: PairRef, b: PairRef): PairOverride[] => [
  ...list.filter((o) => !between(o, a, b)),
  { kind: "apart", a, b },
];

/** Forget the manual pairings that involve a section. */
export const withoutPairsOf = (list: PairOverride[], r: PairRef): PairOverride[] => list.filter((o) => !(o.kind === "pair" && involves(o, r)));

function read(): Store {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  const keys = Object.keys(store);
  const kept = Object.fromEntries(keys.slice(Math.max(0, keys.length - MAX_KEPT)).map((k) => [k, store[k]!]));
  try {
    window.localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    /* choices are a convenience; losing them is not an error */
  }
  return kept;
}

/**
 * The pairing choices for the schedules being compared. They are kept (in this browser) for as long as none of the
 * schedules has changed, so going back to a comparison finds them again; an edit to any schedule starts afresh.
 */
export function usePairings(entries: { id: string; schedule: Schedule }[]) {
  const signature = useMemo(() => pairingSignature(entries), [entries]);
  const [store, setStore] = useState<Store>(read);
  const overrides = store[signature] ?? [];
  const update = useCallback(
    (fn: (list: PairOverride[]) => PairOverride[]) =>
      setStore((s) => {
        const next = fn(s[signature] ?? []);
        const { [signature]: _old, ...rest } = s;
        return write(next.length > 0 ? { ...rest, [signature]: next } : rest);
      }),
    [signature],
  );
  return {
    overrides,
    pair: (a: PairRef, b: PairRef) => update((l) => withPair(l, a, b)),
    apart: (a: PairRef, b: PairRef) => update((l) => withApart(l, a, b)),
    unpair: (r: PairRef) => update((l) => withoutPairsOf(l, r)),
    clear: () => update(() => []),
  };
}
