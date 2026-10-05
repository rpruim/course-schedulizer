import { formatFaculty, formatNumber, formatTime } from "./format.js";
import { sectionShares } from "./load.js";
import { nonTeachingShown } from "./nonteaching.js";
import { listingsOf } from "./names.js";
import { departmentOf, levelOf, type Schedule, type Session } from "./types.js";

/**
 * Row-based schedule comparison (design/schedule-comparisons.qmd).
 *
 * Each schedule becomes a table of rows; the user gives every column a role —
 * ignore, group, or aggregate — and each schedule's table is reduced to one row per
 * combination of the grouping columns, with the aggregates computed. The reduced
 * tables are then joined (a full join) on the grouping columns, so every group that
 * appears in any schedule gets one row, with each schedule's values side by side.
 */

export type ColumnRole = "ignore" | "group" | "aggregate";
export type Cell = string | number;

/** Where a comparison row came from, so a row on screen can lead back to what it was made of. */
export type RowSource =
  | { kind: "section"; sectionId: string }
  /** `index` is the position in the schedule's non-teaching list (a full-year row split across terms shares one). */
  | { kind: "nonteaching"; index: number };

const SOURCE = Symbol("rowSource");

/** A row of cells, one per column (see `COMPARE_COLUMNS`). It also carries its `RowSource`, out of sight of `Object.keys`. */
export type CompareRow = Record<string, Cell> & { [SOURCE]?: RowSource };

/** Mark a row with where it came from. The mark survives object spread, and is not a column. */
const from = (row: CompareRow, source: RowSource): CompareRow => {
  Object.defineProperty(row, SOURCE, { value: source, enumerable: true, writable: true, configurable: true });
  return row;
};

/** Where a comparison row came from, if it knows. */
export const rowSource = (row: CompareRow): RowSource | undefined => row[SOURCE];

export interface CompareColumn {
  key: string;
  label: string;
  /** Numbers sum when aggregated; text is sorted and joined. */
  kind: "text" | "number";
}

/** The columns of a comparison row, in the order of the old app's export tab (plus cross-listings). */
/** In the order of the section editor: the course, when it is taught, who teaches it, when and where it meets, then the details. */
export const COMPARE_COLUMNS: CompareColumn[] = [
  { key: "Prefix", label: "Prefix", kind: "text" },
  { key: "CourseNumber", label: "CourseNumber", kind: "text" },
  { key: "Section", label: "Section", kind: "text" },
  { key: "ShortTitle", label: "ShortTitle", kind: "text" },
  { key: "AcademicYear", label: "AcademicYear", kind: "text" },
  { key: "Term", label: "Term", kind: "text" },
  { key: "TermPart", label: "TermPart", kind: "text" },
  { key: "DeliveryMode", label: "DeliveryMode", kind: "text" },
  { key: "InstructionalMethod", label: "InstructionalMethod", kind: "text" },
  { key: "Faculty", label: "Faculty", kind: "text" },
  { key: "FacultyLoad", label: "FacultyLoad", kind: "number" },
  { key: "MinimumCredits", label: "MinimumCredits", kind: "number" },
  { key: "MaximumCredits", label: "MaximumCredits", kind: "number" },
  { key: "MeetingDays", label: "MeetingDays", kind: "text" },
  { key: "StartTime", label: "StartTime", kind: "text" },
  { key: "MeetingDuration", label: "MeetingDuration", kind: "text" },
  { key: "Classroom", label: "Classroom", kind: "text" },
  { key: "Department", label: "Department", kind: "text" },
  { key: "CourseLevel", label: "CourseLevel", kind: "text" },
  { key: "Group", label: "Group", kind: "text" },
  { key: "Enrollment", label: "Enrollment", kind: "number" },
  { key: "EnrollmentDay10", label: "EnrollmentDay10", kind: "number" },
  { key: "Comment", label: "Comment", kind: "text" },
  { key: "CrossListings", label: "CrossListings", kind: "text" },
];

/** The virtual column that counts rows; it is an aggregate only. */
export const COUNT_KEY = "Rows";
/** Aggregated text values are sorted and joined with this. */
export const JOIN = "; ";
/** A section's several meetings are joined with this inside one cell. */
const MEETINGS = " + ";

const kindOf = new Map(COMPARE_COLUMNS.map((c) => [c.key, c.kind]));
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const blankRow = (): CompareRow => Object.fromEntries(COMPARE_COLUMNS.map((c) => [c.key, ""]));
const num = (n: number | undefined): Cell => (n === undefined ? "" : n);

/** What one row of a comparison table is. */
export type RowKind = "section" | "instructor";

/**
 * A schedule as a table. By default **one row per section** (a section's meetings share
 * one row, joined with ` + `), so counting rows counts sections and summing `FacultyLoad`
 * counts load once. With `"instructor"`, **one row per section and instructor**: `Faculty`
 * is a single name and `FacultyLoad` that person's share, so grouping by faculty adds up
 * each person's load even for team-taught sections. With `nonTeaching: true`, non-teaching
 * load is included too, as rows with no course (activity in `InstructionalMethod`), a
 * full-year row split across the spread terms, as in the registrar tab. Off by default.
 */
export interface RowOptions {
  /** Include non-teaching load rows. Default `false`. */
  nonTeaching?: boolean;
}

export function comparisonRows(schedule: Schedule, kind: RowKind = "section", options: RowOptions = {}): CompareRow[] {
  const rows: CompareRow[] = [];
  const bySection = new Map<string, Session[]>();
  for (const s of schedule.sessions) bySection.set(s.sectionId, [...(bySection.get(s.sectionId) ?? []), s]);

  for (const ms of bySection.values()) {
    const h = ms[0]!;
    // A section's meetings share one cell, joined with " + "; no meeting at all gives an empty cell.
    const join = (f: (m: Session) => string) => {
      const parts = ms.map(f);
      return parts.every((p) => p === "") ? "" : parts.join(MEETINGS);
    };
    const others = listingsOf(h, schedule.crossListings).slice(1);
    const base = (): CompareRow => ({
      ...blankRow(),
      Department: departmentOf(schedule.meta, h),
      AcademicYear: h.academicYear,
      Term: h.term,
      TermPart: h.termPart,
      Prefix: h.prefix,
      CourseNumber: h.courseNumber,
      Section: h.section,
      MinimumCredits: num(h.minimumCredits),
      MaximumCredits: num(h.maximumCredits),
      MeetingDays: join((m) => m.days),
      StartTime: join((m) => (m.start === undefined ? "" : formatTime(m.start))),
      MeetingDuration: join((m) => (m.duration === undefined ? "" : String(m.duration))),
      Classroom: join((m) => m.room),
      ShortTitle: h.shortTitle,
      InstructionalMethod: h.instructionalMethod,
      CourseLevel: levelOf(h),
      Group: h.group,
      DeliveryMode: h.deliveryMode,
      Comment: h.comment,
      Enrollment: num(h.enrollment),
      EnrollmentDay10: num(h.enrollmentDay10),
      CrossListings: others.map((l) => `${l.prefix} ${l.courseNumber}`).join(", "),
    });
    const source: RowSource = { kind: "section", sectionId: h.sectionId };
    if (kind === "section") {
      rows.push(from({ ...base(), Faculty: formatFaculty(h.faculty), FacultyLoad: num(h.facultyLoad) }, source));
    } else if (h.faculty.length === 0) {
      rows.push(from({ ...base(), Faculty: "", FacultyLoad: num(h.facultyLoad) }, source));
    } else {
      for (const share of sectionShares(h.facultyLoad ?? 0, h.faculty)) rows.push(from({ ...base(), Faculty: share.name, FacultyLoad: share.load }, source));
    }
  }

  for (const [index, n] of (options.nonTeaching ? schedule.nonTeaching : []).entries()) {
    for (const part of nonTeachingShown(schedule, n)) {
      rows.push(from({
        ...blankRow(),
        AcademicYear: n.academicYear,
        Term: part.term,
        TermPart: "Full",
        Faculty: n.faculty,
        FacultyLoad: part.load,
        InstructionalMethod: n.activity,
        Comment: n.comment,
      }, { kind: "nonteaching", index }));
    }
  }
  return rows;
}

export interface Partition {
  /** Role of each column by key; a column not listed is ignored. `Rows` may be `aggregate` or `ignore`. */
  roles: Record<string, ColumnRole>;
}

/** Group and aggregate columns, in column order. The row count is an aggregate when asked for or when nothing else is. */
export function resolvePartition(p: Partition): { groups: CompareColumn[]; aggregates: CompareColumn[]; countForced: boolean } {
  const role = (k: string) => p.roles[k] ?? "ignore";
  const groups = COMPARE_COLUMNS.filter((c) => role(c.key) === "group");
  const real = COMPARE_COLUMNS.filter((c) => role(c.key) === "aggregate");
  const countForced = real.length === 0;
  const aggregates = [...real, ...(role(COUNT_KEY) === "aggregate" || countForced ? [{ key: COUNT_KEY, label: "Rows", kind: "number" as const }] : [])];
  return { groups, aggregates, countForced };
}

const same = (a: Cell | undefined, b: Cell | undefined) =>
  typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9 : a === b;

/** Reduce one schedule's rows to one row per combination of the grouping columns. */
export function aggregateRows(rows: CompareRow[], groups: CompareColumn[], aggregates: CompareColumn[]): Map<string, { group: string[]; values: Record<string, Cell>; rows: CompareRow[] }> {
  const buckets = new Map<string, { group: string[]; rows: CompareRow[] }>();
  for (const r of rows) {
    const group = groups.map((g) => String(r[g.key] ?? ""));
    const key = JSON.stringify(group);
    const b = buckets.get(key) ?? { group, rows: [] };
    b.rows.push(r);
    buckets.set(key, b);
  }
  const out = new Map<string, { group: string[]; values: Record<string, Cell>; rows: CompareRow[] }>();
  for (const [key, b] of buckets) {
    const values: Record<string, Cell> = {};
    for (const a of aggregates) {
      if (a.key === COUNT_KEY) values[a.key] = b.rows.length;
      else if ((kindOf.get(a.key) ?? "text") === "number") values[a.key] = Math.round(b.rows.reduce((n, r) => n + (Number(r[a.key]) || 0), 0) * 1e6) / 1e6;
      else values[a.key] = b.rows.map((r) => String(r[a.key] ?? "")).filter((v) => v !== "").sort(natural).join(JOIN);
    }
    out.set(key, { group: b.group, values, rows: b.rows });
  }
  return out;
}

export interface ComparisonRow {
  /** Values of the grouping columns. */
  group: string[];
  /** `values[a][s]`: aggregate `a` for schedule `s`, or `undefined` if the schedule has no such group. */
  values: (Cell | undefined)[][];
  /** Which schedules have this group. */
  present: boolean[];
  /** `members[s]`: the rows of schedule `s` that make up this group (none if it lacks the group). */
  members: CompareRow[][];
  /** The schedules do not all agree: a group missing from one, or an aggregate that differs. */
  differs: boolean;
}

export interface Comparison {
  schedules: { id: string; name: string }[];
  groups: CompareColumn[];
  aggregates: CompareColumn[];
  countForced: boolean;
  /** One row per group found in any schedule, in group order. */
  rows: ComparisonRow[];
}

export interface CompareInput {
  id: string;
  name: string;
  rows: CompareRow[];
}

/** Compare two or more schedules' row tables: aggregate each, then full-join on the grouping columns. */
export function compareTables(inputs: CompareInput[], partition: Partition): Comparison {
  const { groups, aggregates, countForced } = resolvePartition(partition);
  const reduced = inputs.map((i) => aggregateRows(i.rows, groups, aggregates));
  const keys = new Map<string, string[]>();
  for (const r of reduced) for (const [k, v] of r) if (!keys.has(k)) keys.set(k, v.group);
  const ordered = [...keys].sort(([, a], [, b]) => {
    for (let i = 0; i < a.length; i++) {
      const c = natural(a[i]!, b[i]!);
      if (c) return c;
    }
    return 0;
  });
  const rows: ComparisonRow[] = ordered.map(([key, group]) => {
    const present = reduced.map((r) => r.has(key));
    const values = aggregates.map((a) => reduced.map((r) => r.get(key)?.values[a.key]));
    const differs = present.some((p) => !p) || values.some((vs) => vs.some((v) => !same(v, vs[0])));
    const members = reduced.map((r) => r.get(key)?.rows ?? []);
    return { group, values, present, members, differs };
  });
  return { schedules: inputs.map((i) => ({ id: i.id, name: i.name })), groups, aggregates, countForced, rows };
}

/** Rows to show: all of them unless `onlyDifferences`, which the caller defaults with `defaultOnlyDifferences`. */
export const visibleRows = (c: Comparison, onlyDifferences: boolean) => (onlyDifferences ? c.rows.filter((r) => r.differs) : c.rows);

/** Show every row when there are few of them (10 or fewer), otherwise only the ones that differ. */
export const defaultOnlyDifferences = (c: Comparison, threshold = 10) => c.rows.length > threshold;

/** How a row is colored when exactly one (numeric) aggregate is compared. */
export interface Tone {
  /** Index of the schedule with the larger value. */
  larger: number;
  /** 0–1: how large the difference is, relative to the largest difference in the table. */
  strength: number;
}

/**
 * The aggregate that rows are colored by: the only numeric one (the row count counts). Text aggregates have no difference to
 * measure, so they do not count; with no numeric aggregate, or with several, nothing is colored. Returns its index in
 * `c.aggregates`, or `undefined`.
 */
export function toneAggregate(c: Comparison): number | undefined {
  const numeric = c.aggregates.flatMap((a, i) => (a.kind === "number" ? [i] : []));
  return numeric.length === 1 ? numeric[0] : undefined;
}

/**
 * Tones for coloring rows. Only when there is exactly one numeric aggregate (see `toneAggregate`; text aggregates such as
 * the faculty may sit beside it). With two schedules it is the sign and size of B − A; with more,
 * the schedule with the largest value, by how far it leads the runner-up. A missing group
 * counts as 0; ties get no tone. Rows that do not differ are `undefined`.
 */
export function rowTones(c: Comparison): (Tone | undefined)[] | undefined {
  const a = toneAggregate(c);
  if (a === undefined) return undefined;
  const lead = c.rows.map((r) => {
    const v = r.values[a]!.map((x) => (typeof x === "number" ? x : 0));
    const max = Math.max(...v);
    const top = v.indexOf(max);
    const second = Math.max(...v.filter((_, i) => i !== top));
    const gap = v.filter((x) => Math.abs(x - max) < 1e-9).length > 1 ? 0 : max - (Number.isFinite(second) ? second : 0);
    return { top, gap };
  });
  const biggest = Math.max(0, ...lead.map((l) => l.gap));
  return lead.map((l) => (l.gap > 1e-9 && biggest > 0 ? { larger: l.top, strength: l.gap / biggest } : undefined));
}

/** `B − A` for a numeric aggregate of two schedules (a missing group counts as 0), else `undefined`. */
export function difference(row: ComparisonRow, aggregate: number): number | undefined {
  const vs = row.values[aggregate];
  if (!vs || vs.length !== 2) return undefined;
  const [a, b] = vs.map((x) => (typeof x === "number" ? x : typeof x === "string" && x !== "" && !Number.isNaN(Number(x)) ? Number(x) : 0)) as [number, number];
  return Math.round((b - a) * 1e6) / 1e6;
}

export const formatCell = (v: Cell | undefined): string => (v === undefined ? "" : typeof v === "number" ? formatNumber(v) : v);
