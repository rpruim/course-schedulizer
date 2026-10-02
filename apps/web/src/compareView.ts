import {
  COMPARE_COLUMNS,
  COUNT_KEY,
  difference,
  formatCell,
  type Cell,
  type ColumnRole,
  type Comparison,
  type ComparisonRow,
  type RowKind,
  type Tone,
} from "@schedulizer/core";
import type { SortValue } from "./sort";

export type Roles = Record<string, ColumnRole>;

export interface Preset {
  id: string;
  label: string;
  description: string;
  roles: Roles;
  rows: RowKind;
}

const group = (...keys: string[]): Roles => Object.fromEntries(keys.map((k) => [k, "group" as const]));

/** Ready-made partitions: the example uses in design/schedule-comparisons.qmd, plus load per instructor. */
export const PRESETS: Preset[] = [
  {
    id: "mismatches",
    label: "Find any mismatch",
    description: "Every column is a grouping column: a section that is not identical in both schedules shows up as a row for each. Use it to check that a schedule came back from the registrar unchanged.",
    roles: Object.fromEntries(COMPARE_COLUMNS.map((c) => [c.key, "group" as const])),
    rows: "section",
  },
  {
    id: "sections",
    label: "Sections per course",
    description: "Group by prefix and course number, ignore the rest: how many sections each course has in each schedule.",
    roles: group("Prefix", "CourseNumber"),
    rows: "section",
  },
  {
    id: "courseLoad",
    label: "Load per course",
    description: "Group by prefix and course number and add up the faculty load: total hours for each course.",
    roles: { ...group("Prefix", "CourseNumber"), FacultyLoad: "aggregate" },
    rows: "section",
  },
  {
    id: "termLoad",
    label: "Load per subject and term",
    description: "Group by prefix and term and add up the faculty load: the hours assigned to each subject each term.",
    roles: { ...group("Prefix", "Term"), FacultyLoad: "aggregate" },
    rows: "section",
  },
  {
    id: "instructorLoad",
    label: "Load per instructor",
    description: "One row per section and instructor, grouped by instructor and term: each person's load, with a team-taught section's load divided among its instructors.",
    roles: { ...group("Term", "Faculty"), FacultyLoad: "aggregate" },
    rows: "instructor",
  },
];

export const DEFAULT_PRESET = PRESETS[2]!;

/** Hues for telling schedules apart: the first two are a blue–orange diverging pair. */
export const SCHEDULE_HUES = [210, 28, 145, 285, 350, 55, 180, 320];

export const hueFor = (scheduleIndex: number) => SCHEDULE_HUES[scheduleIndex % SCHEDULE_HUES.length]!;

/** The background for a row with a tone (`undefined` for none): the leading schedule's hue, stronger for a bigger gap. */
export function toneColor(tone: Tone | undefined): string | undefined {
  if (!tone) return undefined;
  const alpha = 0.14 + 0.46 * Math.max(0, Math.min(1, tone.strength));
  return `hsl(${hueFor(tone.larger)} 75% 52% / ${alpha.toFixed(3)})`;
}

export interface TableColumn {
  key: string;
  label: string;
  /** A second line: the schedule this column is for. */
  sub?: string;
  numeric: boolean;
  /** Which aggregate this column belongs to, so a differing cell can be marked. */
  aggregate?: number;
  value(row: ComparisonRow): Cell | undefined;
  text(row: ComparisonRow): string;
  sort(row: ComparisonRow): SortValue;
}

/**
 * The columns of the comparison table: the grouping columns, then for each aggregate one
 * column per schedule and, when exactly two schedules are compared, a difference column
 * (B − A) for each numeric aggregate.
 */
export function tableColumns(c: Comparison): TableColumn[] {
  const cols: TableColumn[] = c.groups.map((g, i) => ({
    key: `g${i}`,
    label: g.label,
    numeric: false,
    value: (r) => r.group[i],
    text: (r) => r.group[i] ?? "",
    sort: (r) => r.group[i],
  }));
  c.aggregates.forEach((a, ai) => {
    c.schedules.forEach((s, si) => {
      cols.push({
        key: `a${ai}_${si}`,
        label: a.key === COUNT_KEY ? "Rows" : a.label,
        sub: s.name,
        numeric: a.kind === "number",
        aggregate: ai,
        value: (r) => r.values[ai]![si],
        text: (r) => (r.present[si] ? formatCell(r.values[ai]![si]) : "—"),
        sort: (r) => r.values[ai]![si],
      });
    });
    if (c.schedules.length === 2 && a.kind === "number") {
      const [first, second] = c.schedules;
      cols.push({
        key: `d${ai}`,
        label: "Difference",
        sub: `${second!.name} − ${first!.name}`,
        numeric: true,
        value: (r) => difference(r, ai),
        text: (r) => {
          const d = difference(r, ai);
          return d === undefined || d === 0 ? "" : `${d > 0 ? "+" : ""}${formatCell(d)}`;
        },
        sort: (r) => difference(r, ai),
      });
    }
  });
  return cols;
}

/** Does this aggregate differ between the schedules in this row (a group missing from one counts)? */
export function aggregateDiffers(row: ComparisonRow, aggregate: number): boolean {
  const vs = row.values[aggregate]!;
  const same = (a: Cell | undefined, b: Cell | undefined) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9 : a === b);
  return row.present.some((p) => !p) || vs.some((v) => !same(v, vs[0]));
}

const STORAGE_KEY = "schedulizer:compare";

export interface CompareSettings {
  roles: Roles;
  rows: RowKind;
}

const ROLES = new Set(["ignore", "group", "aggregate"]);

/** Saved settings, repaired: only known columns and roles survive; anything missing falls back to the default preset. */
export function readSettings(text: string | null): CompareSettings {
  const fallback: CompareSettings = { roles: { ...DEFAULT_PRESET.roles }, rows: DEFAULT_PRESET.rows };
  if (!text) return fallback;
  try {
    const raw = JSON.parse(text) as { roles?: Record<string, unknown>; rows?: unknown };
    const known = new Set([...COMPARE_COLUMNS.map((c) => c.key), COUNT_KEY]);
    const roles: Roles = {};
    for (const [k, v] of Object.entries(raw.roles ?? {})) {
      if (known.has(k) && typeof v === "string" && ROLES.has(v) && !(k === COUNT_KEY && v === "group")) roles[k] = v as ColumnRole;
    }
    if (Object.keys(roles).length === 0) return fallback;
    return { roles, rows: raw.rows === "instructor" ? "instructor" : "section" };
  } catch {
    return fallback;
  }
}

export function loadSettings(): CompareSettings {
  try {
    return readSettings(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return readSettings(null);
  }
}

export function saveSettings(s: CompareSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage may be full or disabled; the settings just are not remembered
  }
}
