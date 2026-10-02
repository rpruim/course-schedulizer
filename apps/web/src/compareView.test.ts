import { describe, expect, it } from "vitest";
import { compareTables, comparisonRows, importRecords, rowTones, type Comparison } from "@schedulizer/core";
import { PRESETS, aggregateDiffers, hueFor, readSettings, tableColumns, toneColor } from "./compareView";

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
    expect(s).toEqual({ roles: { Term: "group", Rows: "aggregate" }, rows: "instructor" });
    expect(readSettings(JSON.stringify({ roles: { Rows: "group", Term: "group" } })).roles).toEqual({ Term: "group" });
  });
});
