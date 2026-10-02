import { describe, expect, it } from "vitest";
import { importRecords, type Schedule } from "@schedulizer/core";
import { filterRows, multiSectionRows, sectionRows, termsInUse, termsInUseAcross, timeRange, yearsAcross, yearsOf } from "./model";

const sec = (prefix: string, n: string, letter: string, o: Record<string, string> = {}) => ({
  AcademicYear: "Y1", Term: "FA", Prefix: prefix, CourseNumber: n, Section: letter, ShortTitle: `${prefix} ${n}`, ...o,
});
const make = (r: Record<string, string>[], extra: Partial<Parameters<typeof importRecords>[0]> = {}): Schedule => {
  const x = importRecords({ sessions: r, ...extra });
  expect(x.issues).toEqual([]);
  return x.schedule;
};

describe("timeRange", () => {
  it("formats a meeting and wraps past midnight", () => {
    expect(timeRange({ start: 555, duration: 65 })).toBe("09:15–10:20");
    expect(timeRange({ start: 1410, duration: 60 })).toBe("23:30–00:30");
    expect(timeRange({ start: undefined, duration: undefined })).toBe("");
  });
});

describe("sectionRows", () => {
  const s = make(
    [
      sec("MATH", "110", "B", { Faculty: "Smith", FacultyLoad: "4", MeetingDays: "MWF", StartTime: "9:15", MeetingDuration: "65", Classroom: "NH 1" }),
      sec("MATH", "99", "A"),
      sec("DATA", "385", "A", { MeetingDays: "TR", StartTime: "10:20", MeetingDuration: "100", Classroom: "NH 2" }),
      sec("DATA", "385", "A", { MeetingDays: "F", StartTime: "10:20", MeetingDuration: "50", Classroom: "NH 3" }),
      sec("MATH", "110", "A", { Term: "SP", Faculty: "Smith", MeetingDays: "MWF", StartTime: "9:15", MeetingDuration: "65", Classroom: "NH 9" }),
    ],
    { crossListings: [{ SectionId: "Y1-FA-DATA385-A", Prefix: "STAT", CourseNumber: "385" }] },
  );
  const rows = sectionRows(s);

  it("makes one row per section in natural course order", () => {
    expect(rows.map((r) => `${r.prefix} ${r.courseNumber} ${r.section} ${r.term}`)).toEqual([
      "DATA 385 A FA", "MATH 99 A FA", "MATH 110 A SP", "MATH 110 B FA",
    ]);
  });
  it("uses the cross-listing display name and collects meetings", () => {
    const data = rows[0]!;
    expect(data.course).toBe("DATA/STAT 385");
    expect(data.meetings).toEqual([
      { days: "TR", time: "10:20–12:00", room: "NH 2" },
      { days: "F", time: "10:20–11:10", room: "NH 3" },
    ]);
  });
  it("has no meetings for an unscheduled section and carries instructor and load", () => {
    expect(rows[1]!.meetings).toEqual([]);
    expect(rows[3]).toMatchObject({ faculty: ["Smith"], load: 4 });
  });
  it("flags sections that are part of a conflict", () => {
    const clash = make([
      sec("A", "1", "A", { Faculty: "Smith", MeetingDays: "M", StartTime: "9:00", MeetingDuration: "50" }),
      sec("B", "2", "A", { Faculty: "Smith", MeetingDays: "M", StartTime: "9:30", MeetingDuration: "50" }),
      sec("C", "3", "A", { Faculty: "Smith", MeetingDays: "M", StartTime: "13:00", MeetingDuration: "50" }),
    ]);
    expect(sectionRows(clash).map((r) => r.conflict)).toEqual([true, true, false]);
  });
});

describe("filterRows", () => {
  const s = make([
    sec("MATH", "101", "A", { Faculty: "Ada Example", Classroom: "NH 101" }),
    sec("STAT", "201", "A", { Term: "SP", Faculty: "Ben Sample", Classroom: "SC 7" }),
    sec("STAT", "201", "A", { AcademicYear: "Y2", Faculty: "Ben Sample" }),
  ]);
  const rows = sectionRows(s);
  it("filters by year, term and text (course, instructor, room), case-insensitively", () => {
    expect(filterRows(rows, {})).toHaveLength(3);
    expect(filterRows(rows, { year: "Y2" })).toHaveLength(1);
    expect(filterRows(rows, { term: "SP" })).toHaveLength(1);
    expect(filterRows(rows, { text: "ada" }).map((r) => r.prefix)).toEqual(["MATH"]);
    expect(filterRows(rows, { text: "  sc 7 " }).map((r) => r.prefix)).toEqual(["STAT"]);
    expect(filterRows(rows, { text: "stat 201", term: "FA" })).toHaveLength(1);
    expect(filterRows(rows, { text: "nothing" })).toEqual([]);
  });
  it("lists years and terms in use", () => {
    expect(yearsOf(s)).toEqual(["Y1", "Y2"]);
    expect(termsInUse(s).map((t) => t.code)).toEqual(["FA", "SP"]);
  });
});

describe("multiSectionRows", () => {
  const mk = (rows: Record<string, string>[]) => make(rows);
  const a = mk([sec("MATH", "101", "A", { Faculty: "Smith", MeetingDays: "M", StartTime: "9:00", MeetingDuration: "50" }), sec("MATH", "102", "A")]);
  const b = mk([sec("MATH", "101", "A", { Faculty: "Lee" }), sec("STAT", "200", "A", { Term: "SP" })]);
  const entries = [{ id: "a", name: "Draft A", schedule: a }, { id: "b", name: "Draft B", schedule: b }];
  it("keeps the same section from different schedules together, in schedule order", () => {
    expect(multiSectionRows(entries).map((r) => `${r.prefix} ${r.courseNumber} ${r.section} ${r.scheduleName}`)).toEqual([
      "MATH 101 A Draft A", "MATH 101 A Draft B", "MATH 102 A Draft A", "STAT 200 A Draft B",
    ]);
    expect(multiSectionRows([...entries].reverse()).map((r) => r.scheduleName).slice(0, 2)).toEqual(["Draft B", "Draft A"]);
  });
  it("tags each row with its schedule, and flags conflicts only within one schedule", () => {
    const clash = mk([sec("A", "1", "A", { Faculty: "Smith", MeetingDays: "M", StartTime: "9:00", MeetingDuration: "50" })]);
    const same = mk([sec("B", "2", "A", { Faculty: "Smith", MeetingDays: "M", StartTime: "9:00", MeetingDuration: "50" })]);
    const rows = multiSectionRows([{ id: "x", name: "X", schedule: clash }, { id: "y", name: "Y", schedule: same }]);
    expect(rows.map((r) => [r.scheduleId, r.conflict])).toEqual([["x", false], ["y", false]]);
  });
  it("lists years and terms across schedules", () => {
    expect(yearsAcross([...entries, { id: "c", name: "C", schedule: mk([sec("M", "1", "A", { AcademicYear: "Z" })]) }])).toEqual(["Y1", "Z"]);
    expect(termsInUseAcross(entries).map((t) => t.code)).toEqual(["FA", "SP"]);
  });
  it("is empty for no schedules", () => expect(multiSectionRows([])).toEqual([]));
});
