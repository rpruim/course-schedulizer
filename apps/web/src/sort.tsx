import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

export type SortValue = string | number | null | undefined;
export interface Sort {
  key: string;
  /** 1 ascending, −1 descending. */
  dir: 1 | -1;
}

const blank = (v: SortValue) => v === undefined || v === null || v === "";
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Compare two cells: numbers numerically, text naturally (`99` before `110`). Blanks sort last whichever the direction. */
function cmp(a: SortValue, b: SortValue, dir: 1 | -1): number {
  if (blank(a) || blank(b)) return blank(a) === blank(b) ? 0 : blank(a) ? 1 : -1;
  const c = typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
  return c * dir;
}

/**
 * Sort rows by a history of clicks, oldest first. Each click re-sorts the rows as the
 * previous clicks left them, and the sort is stable, so ties keep the order the earlier
 * clicks gave them (and, before any click, the order the rows came in).
 */
export function sortRows<T>(rows: T[], history: Sort[], get: (row: T, key: string) => SortValue): T[] {
  let out = rows;
  for (const s of history) out = [...out].sort((a, b) => cmp(get(a, s.key), get(b, s.key), s.dir));
  return out;
}

/** The click history after clicking a column: the latest sort flips direction; any other column starts ascending. */
export function clickColumn(history: Sort[], key: string): Sort[] {
  const last = history[history.length - 1];
  if (last?.key === key) return [...history.slice(0, -1), { key, dir: last.dir === 1 ? -1 : 1 }];
  return [...history.filter((s) => s.key !== key), { key, dir: 1 }];
}

export interface Sorting<T> {
  sorted: T[];
  history: Sort[];
  click(key: string): void;
  /** `+1`/`-1` if this is the column the rows are sorted by now, else 0. */
  state(key: string): 0 | 1 | -1;
}

/** Click-to-sort for a table's rows. */
export function useSort<T>(rows: T[], get: (row: T, key: string) => SortValue): Sorting<T> {
  const [history, setHistory] = useState<Sort[]>([]);
  const sorted = useMemo(() => sortRows(rows, history, get), [rows, history]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    sorted,
    history,
    click: (key) => setHistory((h) => clickColumn(h, key)),
    state: (key) => {
      const last = history[history.length - 1];
      return last?.key === key ? last.dir : 0;
    },
  };
}

/** A column header that sorts the table when clicked; click again to reverse. */
export function SortTh<T>({ sorting, sortKey, children, className, style }: { sorting: Sorting<T>; sortKey: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  const s = sorting.state(sortKey);
  return (
    <th className={className} style={style} aria-sort={s === 0 ? "none" : s === 1 ? "ascending" : "descending"}>
      <button type="button" className="sort" onClick={() => sorting.click(sortKey)} title="Click to sort; click again to reverse">
        {children}
        <span className="arrow" aria-hidden="true">{s === 1 ? "▲" : s === -1 ? "▼" : ""}</span>
      </button>
    </th>
  );
}
