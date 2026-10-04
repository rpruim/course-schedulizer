import { describe, expect, it } from "vitest";
import { recordsFromCsv } from "./csv.js";
import {
  COMPARE_COLUMNS, COUNT_KEY, rowSource, aggregateRows, compareTables, comparisonRows, defaultOnlyDifferences, difference, formatCell, resolvePartition, rowTones, toneAggregate, visibleRows,
  type ColumnRole, type CompareRow, type Comparison,
} from "./compare.js";
import { importRecords } from "./import.js";
import type { Schedule } from "./types.js";
import { fixtureText } from "./testutil.js";

const sec = (prefix: string, n: string, letter: string, o: Record<string, string> = {}) => ({
  AcademicYear: "Y", Term: "FA", Prefix: prefix, CourseNumber: n, Section: letter, ...o,
});
const make = (rows: Record<string, string>[], extra: Partial<Parameters<typeof importRecords>[0]> = {}): Schedule => {
  const r = importRecords({ sessions: rows, ...extra });
  expect(r.issues).toEqual([]);
  return r.schedule;
};
const roles = (r: Record<string, ColumnRole>) => ({ roles: r });
const group = (...keys: string[]): Record<string, ColumnRole> => Object.fromEntries(keys.map((k) => [k, "group" as const]));
const flat = (c: Comparison) => c.rows.map((r) => [...r.group, ...r.values.flatMap((vs) => vs.map((v) => (v === undefined ? "–" : v)))]);

describe("comparisonRows: sections", () => {
  const s = make(
    [
      sec("DIGI", "385", "A", { Faculty: "Ada (3), Ben", FacultyLoad: "4", MinimumCredits: "4", Enrollment: "20", MeetingDays: "MW\nF", StartTime: "09:15\n10:20", MeetingDuration: "65\n50", Classroom: "NH 1\nNH 2", ShortTitle: "Opt", Comment: "c" }),
      sec("MUSC", "110", "A", {}),
    ],
    { crossListings: [{ SectionId: "Y-FA-DIGI385-A", Prefix: "URBS", CourseNumber: "385" }] },
  );
  it("makes one row per section with the meetings joined in each cell", () => {
    const rows = comparisonRows(s);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      AcademicYear: "Y", Term: "FA", TermPart: "Full", Prefix: "DIGI", CourseNumber: "385", Section: "A", Faculty: "Ada (3), Ben", FacultyLoad: 4, MinimumCredits: 4,
      MeetingDays: "MW + F", StartTime: "09:15 + 10:20", MeetingDuration: "65 + 50", Classroom: "NH 1 + NH 2", ShortTitle: "Opt", Comment: "c", Enrollment: 20, CrossListings: "URBS 385",
    });
    expect(rows[1]).toMatchObject({ MeetingDays: "", StartTime: "", Classroom: "", Faculty: "", FacultyLoad: "", CrossListings: "" });
  });
  it("has a cell for every column", () => {
    for (const r of comparisonRows(s)) expect(Object.keys(r)).toEqual(COMPARE_COLUMNS.map((c) => c.key));
  });
});

describe("comparisonRows: instructors", () => {
  const s = make([sec("MUSC", "1", "A", { Faculty: "Ada (3), Ben", FacultyLoad: "4" }), sec("MUSC", "2", "A", { Faculty: "Cy", FacultyLoad: "2" }), sec("MUSC", "3", "A", { FacultyLoad: "1" })]);
  it("makes one row per section and instructor, each with that person's share", () => {
    expect(comparisonRows(s, "instructor").map((r) => [r.CourseNumber, r.Faculty, r.FacultyLoad])).toEqual([
      ["1", "Ada", 3], ["1", "Ben", 1], ["2", "Cy", 2], ["3", "", 1],
    ]);
  });
});

describe("comparisonRows: non-teaching load", () => {
  const s = make([sec("MUSC", "1", "A")], {
    nonTeaching: [
      { AcademicYear: "Y", Faculty: "Ada", Activity: "Chair", Term: "AY", Load: "3", Comment: "why" },
      { AcademicYear: "Y", Faculty: "Ben", Activity: "Sabbatical", Term: "SP", Load: "4" },
    ],
  });
  it("leaves non-teaching load out unless asked", () => {
    expect(comparisonRows(s).filter((r) => r.Prefix === "")).toEqual([]);
    expect(comparisonRows(s, "instructor").filter((r) => r.Prefix === "")).toEqual([]);
    expect(comparisonRows(s, "section", { nonTeaching: false })).toHaveLength(1);
  });
  it("adds rows with no course, a full-year load split across the spread terms", () => {
    const nt = comparisonRows(s, "section", { nonTeaching: true }).filter((r) => r.Prefix === "");
    expect(nt.map((r) => [r.Term, r.Faculty, r.FacultyLoad, r.InstructionalMethod])).toEqual([["FA", "Ada", 1.5, "Chair"], ["SP", "Ada", 1.5, "Chair"], ["SP", "Ben", 4, "Sabbatical"]]);
    expect(nt[0]).toMatchObject({ AcademicYear: "Y", TermPart: "Full", Comment: "why" });
  });
});

describe("resolvePartition", () => {
  it("lists group and aggregate columns in column order", () => {
    const p = resolvePartition(roles({ Term: "group", Prefix: "group", FacultyLoad: "aggregate", Faculty: "aggregate" }));
    expect(p.groups.map((c) => c.key)).toEqual(["Term", "Prefix"]);
    expect(p.aggregates.map((c) => c.key)).toEqual(["Faculty", "FacultyLoad"]);
    expect(p.countForced).toBe(false);
  });
  it("counts rows when nothing else is aggregated, and only then unless asked", () => {
    expect(resolvePartition(roles(group("Prefix"))).aggregates.map((c) => c.key)).toEqual([COUNT_KEY]);
    expect(resolvePartition(roles(group("Prefix"))).countForced).toBe(true);
    expect(resolvePartition(roles({ ...group("Prefix"), FacultyLoad: "aggregate" })).aggregates.map((c) => c.key)).toEqual(["FacultyLoad"]);
    const both = resolvePartition(roles({ ...group("Prefix"), FacultyLoad: "aggregate", [COUNT_KEY]: "aggregate" }));
    expect(both.aggregates.map((c) => c.key)).toEqual(["FacultyLoad", COUNT_KEY]);
    expect(both.countForced).toBe(false);
  });
});

describe("aggregateRows", () => {
  const rows: CompareRow[] = [
    { Prefix: "MUSC", FacultyLoad: 4, Faculty: "Smith", Enrollment: "" },
    { Prefix: "MUSC", FacultyLoad: 2, Faculty: "Ada", Enrollment: 5 },
    { Prefix: "MUSC", FacultyLoad: "", Faculty: "", Enrollment: "" },
    { Prefix: "URBS", FacultyLoad: 1.25, Faculty: "Lee", Enrollment: "" },
  ];
  const run = () => resolvePartition(roles({ Prefix: "group", FacultyLoad: "aggregate", Faculty: "aggregate", Enrollment: "aggregate", [COUNT_KEY]: "aggregate" }));
  it("sums numbers (blanks count as 0), sorts and joins text, and counts rows", () => {
    const p = run();
    const out = aggregateRows(rows, p.groups, p.aggregates);
    expect([...out.values()].map((g) => [g.group, g.values])).toEqual([
      [["MUSC"], { Faculty: "Ada; Smith", FacultyLoad: 6, Enrollment: 5, Rows: 3 }],
      [["URBS"], { Faculty: "Lee", FacultyLoad: 1.25, Enrollment: 0, Rows: 1 }],
    ]);
  });
  it("with no grouping columns makes a single group of everything", () => {
    const p = resolvePartition(roles({ FacultyLoad: "aggregate" }));
    expect([...aggregateRows(rows, p.groups, p.aggregates).values()].map((g) => g.values.FacultyLoad)).toEqual([7.25]);
  });
});

describe("compareTables: the use cases in design/schedule-comparisons.qmd", () => {
  const a = make([
    sec("MUSC", "101", "A", { Faculty: "Smith", FacultyLoad: "4", MeetingDays: "MWF", StartTime: "9:00", MeetingDuration: "50", Classroom: "NH 1" }),
    sec("MUSC", "101", "B", { Faculty: "Lee", FacultyLoad: "4" }),
    sec("URBS", "200", "A", { Faculty: "Kim", FacultyLoad: "3" }),
    sec("URBS", "300", "A", { Term: "SP", Faculty: "Kim", FacultyLoad: "3" }),
  ]);
  const b = make([
    sec("MUSC", "101", "A", { Faculty: "Smith", FacultyLoad: "4", MeetingDays: "MWF", StartTime: "10:00", MeetingDuration: "50", Classroom: "NH 1" }), // moved an hour
    sec("URBS", "200", "A", { Faculty: "Kim", FacultyLoad: "3" }),
    sec("URBS", "200", "B", { Faculty: "Kim", FacultyLoad: "3" }), // a new section
    sec("DIGI", "100", "A", { Faculty: "Ada", FacultyLoad: "2" }), // a new course
  ]);
  const inputs = (kind: "section" | "instructor" = "section") => [
    { id: "a", name: "Plan A", rows: comparisonRows(a, kind) },
    { id: "b", name: "Plan B", rows: comparisonRows(b, kind) },
  ];

  it("1. every column a grouping column: finds sections that do not match exactly", () => {
    const all = Object.fromEntries(COMPARE_COLUMNS.map((c) => [c.key, "group" as const]));
    const c = compareTables(inputs(), roles(all));
    expect(c.aggregates.map((x) => x.key)).toEqual([COUNT_KEY]);
    // the moved MUSC 101 A appears twice (one row per schedule); sections that match exactly appear once with 1 and 1
    const matching = c.rows.filter((r) => r.present[0] && r.present[1]).map((r) => `${r.group[4]} ${r.group[5]} ${r.group[6]}`);
    expect(matching).toEqual(["URBS 200 A"]);
    expect(c.rows.filter((r) => r.differs)).toHaveLength(c.rows.length - 1);
  });

  it("2. group by course, ignore the rest: how many sections each course has", () => {
    const c = compareTables(inputs(), roles(group("Prefix", "CourseNumber")));
    expect(flat(c)).toEqual([
      ["DIGI", "100", "–", 1],
      ["MUSC", "101", 2, 1],
      ["URBS", "200", 1, 2],
      ["URBS", "300", 1, "–"],
    ]);
    expect(c.rows.map((r) => r.differs)).toEqual([true, true, true, true]);
  });

  it("3. group by course, aggregate load: total hours per course", () => {
    const c = compareTables(inputs(), roles({ ...group("Prefix", "CourseNumber"), FacultyLoad: "aggregate" }));
    expect(flat(c)).toEqual([["DIGI", "100", "–", 2], ["MUSC", "101", 8, 4], ["URBS", "200", 3, 6], ["URBS", "300", 3, "–"]]);
  });

  it("4. group by prefix and term, aggregate load: hours per prefix per term", () => {
    const c = compareTables(inputs(), roles({ ...group("Prefix", "Term"), FacultyLoad: "aggregate" }));
    // grouping columns appear in column order, so Term comes before Prefix
    expect(c.groups.map((g) => g.key)).toEqual(["Term", "Prefix"]);
    expect(flat(c)).toEqual([["FA", "DIGI", "–", 2], ["FA", "MUSC", 8, 4], ["FA", "URBS", 3, 6], ["SP", "URBS", 3, "–"]]);
    expect(c.rows.map((r) => r.differs)).toEqual([true, true, true, true]);
  });

  it("marks a group that agrees as not differing", () => {
    const c = compareTables(inputs(), roles({ ...group("Prefix", "CourseNumber", "Section"), FacultyLoad: "aggregate" }));
    const stat = c.rows.find((r) => r.group.join() === "URBS,200,A")!;
    expect([stat.differs, stat.present]).toEqual([false, [true, true]]);
    expect(c.rows.find((r) => r.group.join() === "MUSC,101,B")).toMatchObject({ differs: true, present: [true, false] });
  });

  it("can compare per instructor, adding up a person's load across sections", () => {
    const c = compareTables(inputs("instructor"), roles({ Faculty: "group", FacultyLoad: "aggregate" }));
    expect(flat(c)).toEqual([["Ada", "–", 2], ["Kim", 6, 6], ["Lee", 4, "–"], ["Smith", 4, 4]]);
  });

  it("compares three or more schedules", () => {
    const c = compareTables([...inputs(), { id: "c", name: "Plan C", rows: comparisonRows(a, "section") }], roles(group("Prefix", "CourseNumber")));
    expect(flat(c)[1]).toEqual(["MUSC", "101", 2, 1, 2]);
    expect(c.schedules.map((s) => s.name)).toEqual(["Plan A", "Plan B", "Plan C"]);
  });

  it("orders groups naturally, with numbers in numeric order", () => {
    const s = make([sec("M", "99", "A"), sec("M", "110", "A"), sec("M", "100", "A")]);
    const c = compareTables([{ id: "s", name: "S", rows: comparisonRows(s) }], roles(group("CourseNumber")));
    expect(c.rows.map((r) => r.group[0])).toEqual(["99", "100", "110"]);
  });
});

describe("showing only the differences", () => {
  const mk = (n: number, diffs: number): Comparison => ({
    schedules: [],
    groups: [],
    aggregates: [],
    countForced: false,
    rows: Array.from({ length: n }, (_, i) => ({ group: [String(i)], values: [], present: [true, true], members: [], differs: i < diffs })),
  });
  it("shows everything for 10 rows or fewer, only differences above that", () => {
    expect(defaultOnlyDifferences(mk(10, 3))).toBe(false);
    expect(defaultOnlyDifferences(mk(11, 3))).toBe(true);
    expect(visibleRows(mk(11, 3), true)).toHaveLength(3);
    expect(visibleRows(mk(11, 3), false)).toHaveLength(11);
  });
});

describe("rowTones", () => {
  const cmp = (values: (number | undefined)[][], kind: "number" | "text" = "number"): Comparison => ({
    schedules: values[0]!.map((_, i) => ({ id: String(i), name: String(i) })),
    groups: [],
    aggregates: [{ key: "FacultyLoad", label: "FacultyLoad", kind }],
    countForced: false,
    rows: values.map((v, i) => ({ group: [String(i)], values: [v], present: v.map((x) => x !== undefined), members: [], differs: true })),
  });
  it("is the sign and relative size of the difference for two schedules", () => {
    const t = rowTones(cmp([[4, 4], [2, 4], [4, 3], [0, 8], [undefined, 2]]))!;
    expect(t[0]).toBeUndefined();
    expect(t[1]).toEqual({ larger: 1, strength: 0.25 });
    expect(t[2]).toEqual({ larger: 0, strength: 0.125 });
    expect(t[3]).toEqual({ larger: 1, strength: 1 });
    expect(t[4]).toEqual({ larger: 1, strength: 0.25 }); // a missing group counts as 0
  });
  it("is the schedule with the largest value, for three or more", () => {
    const t = rowTones(cmp([[1, 5, 2], [4, 4, 1], [3, 3, 3], [6, 1, 1]]))!;
    expect(t[0]).toEqual({ larger: 1, strength: 3 / 5 });
    expect(t[1]).toBeUndefined(); // tie for the lead
    expect(t[2]).toBeUndefined();
    expect(t[3]).toEqual({ larger: 0, strength: 1 });
  });
  it("only applies to exactly one numeric aggregate", () => {
    expect(rowTones(cmp([[1, 2]], "text"))).toBeUndefined();
    const two = cmp([[1, 2]]);
    expect(rowTones({ ...two, aggregates: [...two.aggregates, ...two.aggregates] })).toBeUndefined();
  });
  it("ignores text aggregates beside the one numeric aggregate (a difference column exists only for numbers)", () => {
    const one = cmp([[2, 4], [4, 4]]);
    const withText: Comparison = {
      ...one,
      aggregates: [{ key: "Faculty", label: "Faculty", kind: "text" }, ...one.aggregates],
      rows: one.rows.map((r) => ({ ...r, values: [["Ada", "Ben"], ...r.values] })),
    };
    expect(toneAggregate(withText)).toBe(1);
    expect(rowTones(withText)).toEqual([{ larger: 1, strength: 1 }, undefined]);
    // the same with the text column after the number
    const after: Comparison = { ...withText, aggregates: [...one.aggregates, withText.aggregates[0]!], rows: withText.rows.map((r) => ({ ...r, values: [r.values[1]!, r.values[0]!] })) };
    expect(toneAggregate(after)).toBe(0);
    expect(rowTones(after)).toEqual([{ larger: 1, strength: 1 }, undefined]);
    // two numeric aggregates: nothing to say which to color by
    expect(toneAggregate({ ...withText, aggregates: [...one.aggregates, ...one.aggregates] })).toBeUndefined();
  });
});

describe("difference / formatCell", () => {
  const row = (vs: (number | string | undefined)[]) => ({ group: [], values: [vs], present: [], members: [], differs: true });
  it("is B − A for two schedules, with a missing group as 0", () => {
    expect(difference(row([4, 6]), 0)).toBe(2);
    expect(difference(row([undefined, 6]), 0)).toBe(6);
    expect(difference(row([1.1, 1.3]), 0)).toBe(0.2);
    expect(difference(row([1, 2, 3]), 0)).toBeUndefined();
  });
  it("formats cells", () => {
    expect([formatCell(1.5), formatCell("x"), formatCell(undefined), formatCell(0)]).toEqual(["1.5", "x", "", "0"]);
  });
});

describe("on the registrar-case fixture", () => {
  const s = importRecords({
    sessions: recordsFromCsv(fixtureText("cases/registrar-sessions.csv")),
    crossListings: recordsFromCsv(fixtureText("cases/registrar-crosslistings.csv")),
    nonTeaching: recordsFromCsv(fixtureText("cases/registrar-nonteaching.csv")),
  }).schedule;
  it("a schedule compared with itself has no differences, whatever the partition", () => {
    const all = Object.fromEntries(COMPARE_COLUMNS.map((c) => [c.key, "group" as const]));
    for (const r of [all, group("Prefix"), { ...group("Term"), FacultyLoad: "aggregate" as const }]) {
      const rows = comparisonRows(s, "section", { nonTeaching: true });
      const c = compareTables([{ id: "a", name: "A", rows }, { id: "b", name: "B", rows }], roles(r));
      expect(c.rows.length).toBeGreaterThan(0);
      expect(c.rows.every((x) => !x.differs)).toBe(true);
    }
  });
  it("totals the load once per section (a 2-meeting section is not counted twice)", () => {
    const total = (nonTeaching: boolean) =>
      compareTables([{ id: "a", name: "A", rows: comparisonRows(s, "section", { nonTeaching }) }], roles({ FacultyLoad: "aggregate" })).rows[0]!.values[0]![0];
    // sections: 4+4+4+1.8+4+4+2+2 = 25.8; non-teaching adds 3 (a full year, split) + 4 = 7
    expect(total(false)).toBeCloseTo(25.8);
    expect(total(true)).toBeCloseTo(32.8);
  });
});

describe("where rows came from", () => {
  const s = make(
    [
      sec("MUSC", "1", "A", { Faculty: "Ada (3), Ben", FacultyLoad: "4" }),
      sec("MUSC", "1", "A", { MeetingDays: "F", StartTime: "9:00", MeetingDuration: "50" }),
      sec("MUSC", "2", "B", { Faculty: "Cy", FacultyLoad: "2" }),
    ],
    { nonTeaching: [{ AcademicYear: "Y", Faculty: "Ada", Activity: "Chair", Term: "AY", Load: "3" }, { AcademicYear: "Y", Faculty: "Ben", Activity: "Sabbatical", Term: "SP", Load: "4" }] },
  );
  it("marks a section row with its section, and a non-teaching row with its position", () => {
    const rows = comparisonRows(s, "section", { nonTeaching: true });
    expect(rows.map((r) => rowSource(r))).toEqual([
      { kind: "section", sectionId: "Y-FA-MUSC1-A" },
      { kind: "section", sectionId: "Y-FA-MUSC2-B" },
      { kind: "nonteaching", index: 0 }, // a full-year row, split across FA and SP
      { kind: "nonteaching", index: 0 },
      { kind: "nonteaching", index: 1 },
    ]);
  });
  it("marks every instructor row of a section with that section", () => {
    const rows = comparisonRows(s, "instructor");
    expect(rows.map((r) => [r.Faculty, rowSource(r)])).toEqual([
      ["Ada", { kind: "section", sectionId: "Y-FA-MUSC1-A" }],
      ["Ben", { kind: "section", sectionId: "Y-FA-MUSC1-A" }],
      ["Cy", { kind: "section", sectionId: "Y-FA-MUSC2-B" }],
    ]);
  });
  it("is not a column, and survives copying", () => {
    const row = comparisonRows(s)[0]!;
    expect(Object.keys(row)).toEqual(COMPARE_COLUMNS.map((c) => c.key));
    expect(rowSource({ ...row })).toEqual({ kind: "section", sectionId: "Y-FA-MUSC1-A" });
    expect(rowSource({ Prefix: "x" })).toBeUndefined();
  });
  it("lists the rows behind each comparison row, per schedule, and none where a schedule lacks the group", () => {
    const other = make([sec("MUSC", "1", "A", { FacultyLoad: "9" }), sec("URBS", "5", "A")]);
    const c = compareTables(
      [{ id: "a", name: "A", rows: comparisonRows(s) }, { id: "b", name: "B", rows: comparisonRows(other) }],
      roles(group("Prefix", "CourseNumber")),
    );
    const byGroup = Object.fromEntries(c.rows.map((r) => [r.group.join(" "), r.members.map((m) => m.map((x) => rowSource(x)))]));
    expect(byGroup).toEqual({
      "MUSC 1": [[{ kind: "section", sectionId: "Y-FA-MUSC1-A" }], [{ kind: "section", sectionId: "Y-FA-MUSC1-A" }]],
      "MUSC 2": [[{ kind: "section", sectionId: "Y-FA-MUSC2-B" }], []],
      "URBS 5": [[], [{ kind: "section", sectionId: "Y-FA-URBS5-A" }]],
    });
  });
  it("lists several rows when a group has several (sections of a course)", () => {
    const two = make([sec("MUSC", "1", "A"), sec("MUSC", "1", "B")]);
    const c = compareTables([{ id: "a", name: "A", rows: comparisonRows(two) }], roles(group("Prefix", "CourseNumber")));
    expect(c.rows[0]!.members[0]!.map((r) => r.Section)).toEqual(["A", "B"]);
  });
});
