import { displayNames } from "./names.js";
import { AY, type Instructor, type Issue, type Schedule } from "./types.js";

export const UNASSIGNED = "(unassigned)";

export type LoadKind = "teaching" | "nonteaching";

export interface LoadRow {
  academicYear: string;
  faculty: string;
  term: string;
  kind: LoadKind;
  load: number;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const nameKey = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Split a section's load among its instructors: `Name (n)` shares first, the
 * remainder equally among the unmarked. No instructors → `(unassigned)`.
 */
export function sectionShares(load: number, instructors: Instructor[]): { name: string; load: number }[] {
  if (instructors.length === 0) return [{ name: UNASSIGNED, load }];
  const explicit = instructors.reduce((sum, i) => sum + (i.load ?? 0), 0);
  const unmarked = instructors.filter((i) => i.load === undefined).length;
  const each = unmarked ? Math.max(0, load - explicit) / unmarked : 0;
  return instructors.map((i) => ({ name: i.name, load: i.load ?? each }));
}

/**
 * Tidy faculty load: one row per (year, faculty, term, kind). Teaching load is
 * credited to the section's term; `AY` non-teaching load is
 * split evenly across `settings.spreadTerms`. Faculty names match
 * case-insensitively; the first spelling seen is displayed. Zero rows are kept
 * (someone who teaches a zero-load section still appears).
 */
export function facultyLoad(schedule: Schedule): LoadRow[] {
  return collectLoad(schedule).rows;
}

interface Collected {
  rows: LoadRow[];
  /** `[year, faculty, term, kind]` (faculty by its displayed name) → what the load came from, one entry per section or non-teaching row. */
  items: Map<string, { label: string; id: string }[]>;
}

const itemKey = (year: string, faculty: string, term: string, kind: LoadKind) => JSON.stringify([year, nameKey(faculty), term, kind]);

function collectLoad(schedule: Schedule): Collected {
  const names = displayNames(schedule);
  const items = new Map<string, { label: string; id: string }[]>();
  const display = new Map<string, string>();
  const name = (n: string) => {
    const k = nameKey(n);
    if (!display.has(k)) display.set(k, n.trim().replace(/\s+/g, " "));
    return k === nameKey(UNASSIGNED) ? UNASSIGNED : k;
  };
  const acc = new Map<string, { academicYear: string; key: string; term: string; kind: LoadKind; load: number }>();
  const add = (academicYear: string, who: string, term: string, kind: LoadKind, load: number, item: { label: string; id: string }) => {
    const key = name(who);
    const ik = itemKey(academicYear, key === nameKey(UNASSIGNED) ? UNASSIGNED : who, term, kind);
    items.set(ik, [...(items.get(ik) ?? []), item]);
    const id = JSON.stringify([academicYear, key, term, kind]);
    const row = acc.get(id) ?? { academicYear, key, term, kind, load: 0 };
    row.load += load;
    acc.set(id, row);
  };

  const seen = new Set<string>();
  for (const s of schedule.sessions) {
    if (seen.has(s.sectionId)) continue;
    seen.add(s.sectionId);
    for (const sh of sectionShares(s.facultyLoad ?? 0, s.faculty)) {
      if (sh.name !== "*") add(s.academicYear, sh.name, s.term, "teaching", sh.load, { label: names.get(s.sectionId) ?? `${s.prefix} ${s.courseNumber}`, id: `s:${s.sectionId}` });
    }
  }
  const spread = schedule.settings.spreadTerms;
  schedule.nonTeaching.forEach((n, index) => {
    const item = { label: n.activity, id: `n:${index}` };
    if (n.term === AY && spread.length) for (const t of spread) add(n.academicYear, n.faculty, t, "nonteaching", n.load / spread.length, item);
    else add(n.academicYear, n.faculty, n.term, "nonteaching", n.load, item);
  });
  const rows = [...acc.values()].map((r) => ({
    academicYear: r.academicYear,
    faculty: r.key === UNASSIGNED ? UNASSIGNED : (display.get(r.key) ?? r.key),
    term: r.term,
    kind: r.kind,
    load: round(r.load),
  }));
  return { rows, items };
}

/** `Math 171 (2); Math 271` — each distinct item once, with the number of instances in parentheses when repeated. */
export function summarizeItems(items: string[]): string {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map(([i, n]) => (n > 1 ? `${i} (${n})` : i))
    .join("; ");
}

/**
 * What a cell of the faculty-load table is made of, as text for a tooltip: course names for
 * teaching load, activities for non-teaching load. `term` omitted = the whole year (a Total cell);
 * `kind` omitted = both kinds. Empty string when there is nothing.
 */
export function loadItems(schedule: Schedule, academicYear: string): (faculty: string, term?: string, kind?: LoadKind) => string {
  const { items } = collectLoad(schedule);
  return (faculty, term, kind) => {
    const hits = new Map<string, string>(); // by origin, so load spread over terms is one item
    for (const [key, list] of items) {
      const [y, f, t, k] = JSON.parse(key) as [string, string, string, LoadKind];
      if (y === academicYear && f === nameKey(faculty) && (term === undefined || t === term) && (kind === undefined || k === kind)) for (const i of list) hits.set(i.id, i.label);
    }
    return summarizeItems([...hits.values()]);
  };
}

/** Validation warnings about how section loads are divided (never errors). */
export function loadWarnings(schedule: Schedule): Issue[] {
  const out: Issue[] = [];
  const seen = new Set<string>();
  for (const s of schedule.sessions) {
    if (seen.has(s.sectionId)) continue;
    seen.add(s.sectionId);
    const total = s.facultyLoad ?? 0;
    const explicit = s.faculty.reduce((sum, i) => sum + (i.load ?? 0), 0);
    const allExplicit = s.faculty.length > 0 && s.faculty.every((i) => i.load !== undefined);
    if (explicit > total + 1e-9) out.push({ severity: "warning", sheet: "Sessions", message: `section ${s.sectionId}: instructor shares (${round(explicit)}) exceed the section load (${total})` });
    else if (allExplicit && Math.abs(explicit - total) > 1e-9) out.push({ severity: "warning", sheet: "Sessions", message: `section ${s.sectionId}: instructor shares (${round(explicit)}) do not add up to the section load (${total})` });
  }
  return out;
}

export interface LoadTableRow {
  faculty: string;
  teaching: Record<string, number>;
  nonteaching: Record<string, number>;
  total: number;
}

export interface LoadTable {
  /** Columns: configured terms that have load in this year, then `AY` if non-teaching load is not spread. */
  terms: string[];
  /** People, by total load descending (then name). */
  rows: LoadTableRow[];
  /** Load on sections with no instructor; not part of `totals`. */
  unassigned?: LoadTableRow;
  totals: { teaching: Record<string, number>; nonteaching: Record<string, number>; total: number };
  /**
   * False when the schedule has no non-teaching load at all (e.g. a file shared without it, or an
   * archived first tab), so totals cover teaching load only. A view should say so.
   */
  hasNonTeaching: boolean;
}

/** The wide faculty-load table (faculty × terms, teaching and non-teaching separately) for one academic year. */
export function loadTable(schedule: Schedule, academicYear: string): LoadTable {
  const rows = facultyLoad(schedule).filter((r) => r.academicYear === academicYear);
  const used = new Set(rows.map((r) => r.term));
  const terms = [...schedule.settings.terms.map((t) => t.code).filter((c) => used.has(c)), ...[...used].filter((t) => !schedule.settings.terms.some((x) => x.code === t) && t !== AY), ...(used.has(AY) ? [AY] : [])];
  const people = new Map<string, LoadTableRow>();
  for (const r of rows) {
    const p = people.get(r.faculty) ?? { faculty: r.faculty, teaching: {}, nonteaching: {}, total: 0 };
    p[r.kind][r.term] = round((p[r.kind][r.term] ?? 0) + r.load);
    p.total = round(p.total + r.load);
    people.set(r.faculty, p);
  }
  const unassigned = people.get(UNASSIGNED);
  people.delete(UNASSIGNED);
  const list = [...people.values()].sort((a, b) => b.total - a.total || a.faculty.localeCompare(b.faculty));
  const totals: LoadTable["totals"] = { teaching: {}, nonteaching: {}, total: 0 };
  for (const p of list) {
    for (const kind of ["teaching", "nonteaching"] as const) {
      for (const [t, v] of Object.entries(p[kind])) totals[kind][t] = round((totals[kind][t] ?? 0) + v);
    }
    totals.total = round(totals.total + p.total);
  }
  const hasNonTeaching = schedule.nonTeaching.some((n) => n.academicYear === academicYear);
  return { terms, rows: list, ...(unassigned ? { unassigned } : {}), totals, hasNonTeaching };
}
