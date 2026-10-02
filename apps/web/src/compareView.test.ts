import { describe, expect, it } from "vitest";
import { compareTables, comparisonRows, importRecords, rowTones, type Comparison } from "@schedulizer/core";
import { PRESETS, aggregateDiffers, comparisonSheets, hueFor, readSettings, tableColumns, toneColor, toneHex } from "./compareView";

const sec = (prefix: string, n: string, o: Record<string, string> = {}) => ({ AcademicYear: "Y", Term: "FA", Prefix: prefix, CourseNumber: n, Section: "A", ...o });
const sched = (rows: Record<string, string>[]) => importRecords({ sessions: rows }).schedule;
const cmp = (a: Record<string, string>[], b: Record<string, string>[], preset = PRESETS[2]!, c?: Record<string, string>[]): Comparison =>
  compareTables(
    [{ id: "a", name: "Plan A", rows: comparisonRows(sched(a), preset.rows) }, { id: "b", name: "Plan B", rows: comparisonRows(sched(b), preset.rows) }, ...(c ? [{ id: "c", name: "Plan C", rows: comparisonRows(sched(c), preset.rows) }] : [])],
    { roles: preset.roles },
  );
const A = [sec("MATH", "101", { FacultyLoad: "4" }), sec("STAT", "200", { FacultyLoad: "3" })];
const B = [sec("MATH", "101", { FacultyLoad: "6" }), sec("DATA", "100", { FacultyLoad: "2" })];

describe("presets", () => {
  it("name only real columns, and the instructor one compares per instructor", () => {
    const keys = new Set(tableColumns(cmp(A, B)).map((c) => c.key));
    expect(keys.size).toBeGreaterThan(0);
    expect(PRESETS.map((p) => p.id)).toEqual(["mismatches", "sections", "courseLoad", "termLoad", "instructorLoad"]);
    expect(PRESETS.find((p) => p.id === "instructorLoad")!.rows).toBe("instructor");
    expect(Object.values(PRESETS[0]!.roles).every((r) => r === "group")).toBe(true);
  });
});

describe("tableColumns", () => {
  it("has the grouping columns, then a column per schedule for each aggregate, then a difference for two schedules", () => {
    const cols = tableColumns(cmp(A, B));
    expect(cols.map((c) => [c.key, c.label, c.sub ?? ""])).toEqual([
      ["g0", "Prefix", ""], ["g1", "CourseNumber", ""],
      ["a0_0", "FacultyLoad", "Plan A"], ["a0_1", "FacultyLoad", "Plan B"], ["d0", "Difference", "Plan B − Plan A"],
    ]);
  });
  it("has no difference column for three schedules or a text aggregate", () => {
    expect(tableColumns(cmp(A, B, PRESETS[2]!, A)).some((c) => c.key.startsWith("d"))).toBe(false);
    const text = compareTables([{ id: "a", name: "A", rows: comparisonRows(sched(A)) }, { id: "b", name: "B", rows: comparisonRows(sched(B)) }], { roles: { Prefix: "group", ShortTitle: "aggregate" } });
    expect(tableColumns(text).some((c) => c.key.startsWith("d"))).toBe(false);
  });
  it("shows values, a dash for a group a schedule lacks, and signed differences", () => {
    const c = cmp(A, B);
    const cols = tableColumns(c);
    const text = (key: string) => c.rows.map((r) => cols.find((x) => x.key === key)!.text(r));
    expect(text("g0")).toEqual(["DATA", "MATH", "STAT"]);
    expect(text("a0_0")).toEqual(["—", "4", "3"]);
    expect(text("a0_1")).toEqual(["2", "6", "—"]);
    expect(text("d0")).toEqual(["+2", "+2", "-3"]);
  });
  it("sorts numbers as numbers and gives the difference a value", () => {
    const c = cmp(A, B);
    const diff = tableColumns(c).find((x) => x.key === "d0")!;
    expect(c.rows.map((r) => diff.sort(r))).toEqual([2, 2, -3]);
  });
});

describe("aggregateDiffers", () => {
  it("is true when a schedule lacks the group or the values differ, false when they agree", () => {
    const c = cmp([sec("MATH", "101", { FacultyLoad: "4" }), sec("STAT", "1", { FacultyLoad: "1" }), sec("DATA", "1", { FacultyLoad: "1" })], [sec("MATH", "101", { FacultyLoad: "4" }), sec("STAT", "1", { FacultyLoad: "2" })]);
    expect(c.rows.map((r) => aggregateDiffers(r, 0))).toEqual([true, false, true]);
  });
});

describe("toneColor", () => {
  it("is nothing without a tone, else the leading schedule's hue with strength as opacity", () => {
    expect(toneColor(undefined)).toBeUndefined();
    expect(toneColor({ larger: 0, strength: 0 })).toBe(`hsl(${hueFor(0)} 75% 52% / 0.140)`);
    expect(toneColor({ larger: 1, strength: 1 })).toBe(`hsl(${hueFor(1)} 75% 52% / 0.600)`);
    expect(toneColor({ larger: 1, strength: 5 })).toBe(toneColor({ larger: 1, strength: 1 }));
    expect(hueFor(0)).not.toBe(hueFor(1));
  });
  it("lines up with the core's tones", () => {
    const c = cmp(A, B);
    const tones = rowTones(c)!;
    expect(tones.map((t) => t?.larger)).toEqual([1, 1, 0]);
  });
});

describe("readSettings", () => {
  it("falls back to the default when there is nothing, or the text is damaged", () => {
    const d = readSettings(null);
    expect(d.rows).toBe("section");
    expect(d.roles).toMatchObject({ Prefix: "group", FacultyLoad: "aggregate" });
    expect(readSettings("{nope")).toEqual(d);
    expect(readSettings(JSON.stringify({ roles: {} }))).toEqual(d);
  });
  it("keeps valid saved roles and drops unknown columns and roles", () => {
    const s = readSettings(JSON.stringify({ roles: { Term: "group", Bogus: "group", Prefix: "wat", Rows: "aggregate" }, rows: "instructor" }));
    expect(s).toEqual({ roles: { Term: "group", Rows: "aggregate" }, rows: "instructor", nonTeaching: false });
    expect(readSettings(JSON.stringify({ roles: { Rows: "group", Term: "group" } })).roles).toEqual({ Term: "group" });
  });
});

describe("settings: non-teaching items", () => {
  it("are off unless saved as on", () => {
    expect(readSettings(null).nonTeaching).toBe(false);
    expect(readSettings(JSON.stringify({ roles: { Term: "group" } })).nonTeaching).toBe(false);
    expect(readSettings(JSON.stringify({ roles: { Term: "group" }, nonTeaching: true })).nonTeaching).toBe(true);
    expect(readSettings(JSON.stringify({ roles: { Term: "group" }, nonTeaching: "yes" })).nonTeaching).toBe(false);
  });
});

describe("toneHex", () => {
  it("is the row colour as it looks on a white sheet", () => {
    expect(toneHex(undefined)).toBeUndefined();
    const strong = toneHex({ larger: 0, strength: 1 })!;
    const weak = toneHex({ larger: 0, strength: 0 })!;
    expect(strong).toMatch(/^[0-9A-F]{6}$/);
    expect(weak).toMatch(/^[0-9A-F]{6}$/);
    const lum = (hex: string) => [0, 2, 4].reduce((n, i) => n + parseInt(hex.slice(i, i + 2), 16), 0);
    expect(lum(weak)).toBeGreaterThan(lum(strong)); // a bigger difference is darker
    expect(strong[4]! + strong[5]!).not.toBe("00"); // never pure primary
    expect(parseInt(toneHex({ larger: 0, strength: 1 })!.slice(4), 16)).toBeGreaterThan(parseInt(toneHex({ larger: 1, strength: 1 })!.slice(4), 16)); // blue has more blue than orange
  });
});

describe("comparisonSheets", () => {
  const info = { rowKind: "section" as const, nonTeaching: false, onlyDifferences: false, exportedAt: new Date(2026, 9, 2, 8, 5) };
  const c = cmp(A, B);
  const columns = tableColumns(c);
  const tones = new Map(c.rows.map((r, i) => [r, rowTones(c)![i]] as const));

  it("has the columns and rows as shown, with numbers as numbers and a blank where a schedule lacks the group", () => {
    const [main] = comparisonSheets(c, columns, c.rows, tones, info);
    expect(main!.name).toBe("Comparison");
    expect(main!.header).toEqual(["Prefix", "CourseNumber", "FacultyLoad\nPlan A", "FacultyLoad\nPlan B", "Difference\nPlan B − Plan A"]);
    expect(main!.rows).toEqual([["DATA", "100", null, 2, 2], ["MATH", "101", 4, 6, 2], ["STAT", "200", 3, null, -3]]);
    expect(main!.filter).toBe(true);
  });
  it("fills each row with its colour, and none where the row has no tone", () => {
    const [main] = comparisonSheets(c, columns, c.rows, tones, info);
    expect(main!.rowFills!.every((f) => /^[0-9A-F]{6}$/.test(f ?? ""))).toBe(true);
    const none = comparisonSheets(c, columns, c.rows, undefined, info)[0]!;
    expect(none.rowFills!.every((f) => f === undefined)).toBe(true);
  });
  it("exports the rows it is given, in the order given", () => {
    const reversed = [...c.rows].reverse();
    expect(comparisonSheets(c, columns, reversed, tones, info)[0]!.rows.map((r) => r[0])).toEqual(["STAT", "MATH", "DATA"]);
    expect(comparisonSheets(c, columns, [c.rows[1]!], tones, info)[0]!.rows).toHaveLength(1);
  });
  it("says what was compared and how on a second sheet", () => {
    const about = comparisonSheets(c, columns, c.rows, tones, info)[1]!;
    expect(about.name).toBe("About this comparison");
    expect(Object.fromEntries(about.rows as [string, string][])).toEqual({
      "Schedules compared": "Plan A\nPlan B",
      "Group by": "Prefix, CourseNumber",
      Aggregate: "FacultyLoad (sum)",
      "One row for each": "section",
      "Non-teaching items": "not included",
      Rows: "all 3 groups",
      "Row colours": "Larger FacultyLoad: Plan A = blue, Plan B = orange; darker means a bigger difference",
      Exported: "2026-10-02 08:05",
    });
  });
  it("describes only-differences, instructor rows, non-teaching items and a count column", () => {
    const counted = compareTables([{ id: "a", name: "A", rows: comparisonRows(sched(A), "instructor", { nonTeaching: true }) }, { id: "b", name: "B", rows: comparisonRows(sched(B), "instructor", { nonTeaching: true }) }], { roles: { Prefix: "group" } });
    const about = Object.fromEntries(comparisonSheets(counted, tableColumns(counted), counted.rows.slice(0, 2), undefined, { ...info, rowKind: "instructor", nonTeaching: true, onlyDifferences: true })[1]!.rows as [string, string][]);
    expect(about["One row for each"]).toMatch(/section and instructor/);
    expect(about["Non-teaching items"]).toBe("included");
    expect(about.Rows).toBe("only the 2 of 3 groups that differ");
    expect(about.Aggregate).toBe("Rows (count of rows)");
    expect(about["Row colours"]).toBeUndefined();
  });
  it("leaves text aggregates as text, and writes a Difference only for two schedules", () => {
    const text = compareTables([{ id: "a", name: "A", rows: comparisonRows(sched([sec("MATH", "1", { Faculty: "Smith" })])) }, { id: "b", name: "B", rows: comparisonRows(sched([sec("MATH", "1", { Faculty: "Lee" })])) }], { roles: { Prefix: "group", Faculty: "aggregate" } });
    const sheet = comparisonSheets(text, tableColumns(text), text.rows, undefined, info)[0]!;
    expect(sheet.header).toEqual(["Prefix", "Faculty\nA", "Faculty\nB"]);
    expect(sheet.rows).toEqual([["MATH", "Smith", "Lee"]]);
  });
});
