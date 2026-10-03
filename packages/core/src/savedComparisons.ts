import { COMPARE_COLUMNS, COUNT_KEY, type ColumnRole, type RowKind } from "./compare.js";
import type { Issue, Rec, SavedComparison, Schedule } from "./types.js";
import type { Table } from "./export.js";

/** The columns of the `Comparisons` sheet. */
export const COMPARISON_COLUMNS = ["Name", "Rows", "Group", "Aggregate"] as const;

const KEYS = new Set<string>([...COMPARE_COLUMNS.map((c) => c.key), COUNT_KEY]);
const lower = new Map([...KEYS].map((k) => [k.toLowerCase(), k]));

/** `Prefix, CourseNumber` → the column keys they name (case-insensitive); names that are not columns are returned apart. */
function keysOf(text: string): { keys: string[]; unknown: string[] } {
  const keys: string[] = [];
  const unknown: string[] = [];
  for (const part of text.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)) {
    const k = lower.get(part.toLowerCase());
    if (!k) unknown.push(part);
    else if (!keys.includes(k)) keys.push(k);
  }
  return { keys, unknown };
}

/** Read the `Comparisons` sheet: one saved comparison per row. A column listed under both Group and Aggregate is grouped. */
export function importComparisons(records: Rec[]): { comparisons: SavedComparison[]; issues: Issue[] } {
  const comparisons: SavedComparison[] = [];
  const issues: Issue[] = [];
  records.forEach((r, i) => {
    const row = i + 2;
    const name = (r.Name ?? "").trim();
    if (!name) {
      issues.push({ severity: "error", sheet: "Comparisons", row, message: "a saved comparison needs a Name" });
      return;
    }
    if (comparisons.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      issues.push({ severity: "warning", sheet: "Comparisons", row, message: `“${name}” is listed twice; the first is used` });
      return;
    }
    const rows: RowKind = /instructor/i.test(r.Rows ?? "") ? "instructor" : "section";
    const g = keysOf(r.Group ?? "");
    const a = keysOf(r.Aggregate ?? "");
    for (const bad of [...g.unknown, ...a.unknown]) issues.push({ severity: "warning", sheet: "Comparisons", row, message: `“${name}”: “${bad}” is not a column, so it is left out` });
    comparisons.push({ name, rows, group: g.keys.filter((k) => k !== COUNT_KEY), aggregate: a.keys.filter((k) => !g.keys.includes(k)) });
  });
  return { comparisons, issues };
}

export function comparisonsTable(schedule: Schedule): Table {
  return {
    header: [...COMPARISON_COLUMNS],
    rows: schedule.comparisons.map((c) => [c.name, c.rows, c.group.join(", "), c.aggregate.join(", ")]),
  };
}

/** The column roles a saved comparison stands for (every other column is ignored). */
export function savedToRoles(c: SavedComparison): Record<string, ColumnRole> {
  const roles: Record<string, ColumnRole> = {};
  for (const k of c.group) roles[k] = "group";
  for (const k of c.aggregate) roles[k] = "aggregate";
  return roles;
}

/** Save a set of roles under a name, listing columns in the order the Compare tab shows them. */
export function rolesToSaved(name: string, roles: Record<string, ColumnRole>, rows: RowKind): SavedComparison {
  const order = [...COMPARE_COLUMNS.map((c) => c.key), COUNT_KEY];
  const pick = (role: ColumnRole) => order.filter((k) => roles[k] === role);
  return { name: name.trim(), rows, group: pick("group").filter((k) => k !== COUNT_KEY), aggregate: pick("aggregate") };
}
