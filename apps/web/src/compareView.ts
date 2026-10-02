import {
  COMPARE_COLUMNS,
  COUNT_KEY,
  difference,
  formatCell,
  type Cell,
  type SheetSpec,
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

const HUE_NAMES = ["blue", "orange", "green", "purple", "pink", "yellow", "teal", "magenta"];

/** `RRGGBB` for a row's tone as it looks on a white sheet (the colour blended with white at the tone's opacity). */
export function toneHex(tone: Tone | undefined): string | undefined {
  if (!tone) return undefined;
  const alpha = 0.14 + 0.46 * Math.max(0, Math.min(1, tone.strength));
  const s = 0.75;
  const l = 0.52;
  const h = hueFor(tone.larger) / 360;
  const hue2rgb = (p: number, q: number, t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    return u < 1 / 6 ? p + (q - p) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const rgb = [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
  return rgb.map((c) => Math.round((alpha * c + (1 - alpha)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
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
  /** Include non-teaching load rows in the tables being compared. Off by default. */
  nonTeaching: boolean;
}

const ROLES = new Set(["ignore", "group", "aggregate"]);

/** Saved settings, repaired: only known columns and roles survive; anything missing falls back to the default preset. */
export function readSettings(text: string | null): CompareSettings {
  const fallback: CompareSettings = { roles: { ...DEFAULT_PRESET.roles }, rows: DEFAULT_PRESET.rows, nonTeaching: false };
  if (!text) return fallback;
  try {
    const raw = JSON.parse(text) as { roles?: Record<string, unknown>; rows?: unknown; nonTeaching?: unknown };
    const known = new Set([...COMPARE_COLUMNS.map((c) => c.key), COUNT_KEY]);
    const roles: Roles = {};
    for (const [k, v] of Object.entries(raw.roles ?? {})) {
      if (known.has(k) && typeof v === "string" && ROLES.has(v) && !(k === COUNT_KEY && v === "group")) roles[k] = v as ColumnRole;
    }
    if (Object.keys(roles).length === 0) return fallback;
    return { roles, rows: raw.rows === "instructor" ? "instructor" : "section", nonTeaching: raw.nonTeaching === true };
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

export interface ExportInfo {
  rowKind: RowKind;
  nonTeaching: boolean;
  /** Only the rows that differ were shown. */
  onlyDifferences: boolean;
  exportedAt: Date;
}

const two = (n: number) => String(n).padStart(2, "0");

/**
 * The comparison as it is on screen, for a spreadsheet: sheet 1 has the rows shown, in the
 * order shown, with the same columns, the difference column, and each row filled with its
 * colour; sheet 2 says what was compared and how, so the file explains itself.
 */
export function comparisonSheets(c: Comparison, columns: TableColumn[], rows: ComparisonRow[], tones: Map<ComparisonRow, Tone | undefined> | undefined, info: ExportInfo): SheetSpec[] {
  const cell = (col: TableColumn, r: ComparisonRow): string | number | null => {
    if (col.key.startsWith("d")) return col.value(r) === undefined ? null : (col.value(r) as number); // the difference column
    if (col.aggregate === undefined) return col.text(r); // a grouping column
    const absent = !r.present[Number(col.key.split("_")[1])];
    if (absent) return null;
    const v = col.value(r);
    return v === undefined ? null : v;
  };
  const header = columns.map((col) => (col.sub ? `${col.label}\n${col.sub}` : col.label));
  const body = rows.map((r) => columns.map((col) => cell(col, r)));
  const fills = rows.map((r) => toneHex(tones?.get(r)));

  const aggDescription = c.aggregates.map((a) => (a.key === COUNT_KEY ? "Rows (count of rows)" : `${a.label} (${a.kind === "number" ? "sum" : "sorted and joined"})`));
  const when = info.exportedAt;
  const about: [string, string][] = [
    ["Schedules compared", c.schedules.map((s) => s.name).join("\n")],
    ["Group by", c.groups.map((g) => g.label).join(", ") || "(nothing: one group)"],
    ["Aggregate", aggDescription.join("\n")],
    ["One row for each", info.rowKind === "instructor" ? "section and instructor (a team-taught section's load is divided)" : "section"],
    ["Non-teaching items", info.nonTeaching ? "included" : "not included"],
    ["Rows", info.onlyDifferences ? `only the ${rows.length} of ${c.rows.length} groups that differ` : `all ${c.rows.length} groups`],
  ];
  if (tones) {
    const one = c.aggregates[0]!.key === COUNT_KEY ? "number of rows" : c.aggregates[0]!.label;
    about.push(["Row colours", `${c.schedules.length === 2 ? "Larger" : "Largest"} ${one}: ${c.schedules.map((s, i) => `${s.name} = ${HUE_NAMES[i % HUE_NAMES.length]}`).join(", ")}; darker means a bigger difference`]);
  }
  about.push(["Exported", `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())} ${two(when.getHours())}:${two(when.getMinutes())}`]);

  return [
    { name: "Comparison", header, rows: body, rowFills: fills, filter: true },
    { name: "About this comparison", header: ["Setting", "Value"], rows: about },
  ];
}
