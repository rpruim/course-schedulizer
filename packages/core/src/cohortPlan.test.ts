import { describe, expect, it } from "vitest";
import { importRecords } from "./import.js";
import { describeRule, findRuleViolations, rulesOf, rulesToRows, saveRule, validateRule, type Rule } from "./rules.js";
import { readWorkbook, writeWorkbook } from "./xlsx.js";

type Rec = Record<string, string>;
const sec = (prefix: string, n: string, letter: string, days: string, start: string, o: Rec = {}): Rec => ({
  AcademicYear: "Y", Term: "FA", Prefix: prefix, CourseNumber: n, Section: letter, Faculty: `${prefix}${n}${letter}`, MeetingDays: days, StartTime: start, MeetingDuration: "65", Classroom: `${prefix}${n}${letter}`, ...o,
});
/** The textbook cohort: 50 students take MATH 161, ENGR 101, CHEM 101; 25 take MATH 162, ENGR 101, CHEM 101. */
const rows = (seats: Record<string, number>): Rec[] => [
  ...["MATH 161", "ENGR 101", "CHEM 101"].map((Course) => ({ Constraint: "Cohort", Type: "cohort planning", Course, Count: "50", Element: "1" })),
  ...["MATH 162", "ENGR 101", "CHEM 101"].map((Course) => ({ Constraint: "Cohort", Type: "cohort planning", Course, Count: "25", Element: "2" })),
  ...Object.entries(seats).map(([Course, Capacity]) => ({ Constraint: "Cohort", Type: "cohort planning", Course, Capacity: String(Capacity) })),
];
const sessions = (chemSections: number): Rec[] => [
  sec("MATH", "161", "A", "MWF", "8:00"), sec("MATH", "161", "B", "MWF", "9:15"), sec("MATH", "162", "A", "MWF", "11:00"),
  sec("ENGR", "101", "A", "TR", "8:00"), sec("ENGR", "101", "B", "TR", "9:15"),
  ...["A", "B", "C"].slice(0, chemSections).map((l, i) => sec("CHEM", "101", l, "TR", ["11:00", "12:15", "13:30"][i]!)),
];
const build = (s: Rec[], c: Rec[]) => {
  const r = importRecords({ sessions: s, constraints: c });
  expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
  return r.schedule;
};
const cohort = (s: ReturnType<typeof build>) => findRuleViolations(s).filter((v) => v.type === "cohortPlan");
const SEATS = { "MATH 161": 32, "MATH 162": 30, "ENGR 101": 40, "CHEM 101": 25 };

describe("cohort planning", () => {
  it("is met when all 75 students can get seats", () => {
    expect(cohort(build(sessions(3), rows(SEATS)))).toEqual([]);
  });
  it("is not met when a course has too few seats in all, and says which", () => {
    const v = cohort(build(sessions(2), rows(SEATS)));
    expect(v).toHaveLength(1);
    expect(v[0]!.message).toBe("50 of 75 students can all get seats: CHEM 101 has 50 seats in all but 75 students need it");
    expect(v[0]!.term).toBe("FA");
    expect(v[0]!.sectionIds.length).toBeGreaterThan(0);
  });
  it("takes the times into account", () => {
    // every ENGR section meets with every CHEM section, so no student can take both
    const s = [sec("MATH", "161", "A", "MWF", "8:00"), sec("MATH", "162", "A", "MWF", "9:15"), sec("ENGR", "101", "A", "TR", "8:00"), sec("CHEM", "101", "A", "TR", "8:00")];
    const v = cohort(build(s, rows({ ...SEATS, "CHEM 101": 100, "ENGR 101": 100 })));
    expect(v[0]!.message).toContain("0 of 75 students can all get seats");
    expect(v[0]!.message).toContain("no clash-free choice of sections lets 50 students take MATH 161, ENGR 101, CHEM 101");
  });
  it("says so when a course of a group is not offered in the term", () => {
    const s = sessions(3).filter((x) => x.CourseNumber !== "162");
    const v = cohort(build(s, rows(SEATS)));
    expect(v[0]!.message).toBe("50 of 75 students can all get seats: MATH 162 is not offered in FA");
  });
  it("looks at each term on its own, and only at terms where its courses run", () => {
    const sp = sessions(3).map((x) => ({ ...x, Term: "SP", AcademicYear: "Y" }));
    const v = cohort(build([...sessions(3), ...sp.filter((x) => x.Prefix !== "CHEM")], rows(SEATS)));
    expect(v.map((x) => x.term)).toEqual(["SP"]); // CHEM 101 is missing in spring
    const limited = rows(SEATS).map((r) => ({ ...r, Term: "FA" }));
    expect(cohort(build([...sessions(3), ...sp.filter((x) => x.Prefix !== "CHEM")], limited))).toEqual([]);
  });
  it("is quietly skipped when the seats are not given (the editor will not save such a rule)", () => {
    const v = cohort(build(sessions(3), rows({ "MATH 161": 32 })));
    expect(v[0]!.message).toContain("are not given for");
  });
});

describe("a cohort planning rule as the editor sees it", () => {
  const s = build(sessions(3), rows(SEATS));
  it("is gathered from its rows: the groups, the courses in each, and the seats", () => {
    const [rule] = rulesOf(s);
    expect(rule).toMatchObject({ name: "Cohort", type: "cohortPlan", items: [] });
    expect(rule!.elements).toEqual([{ students: 50, courses: ["MATH 161", "ENGR 101", "CHEM 101"] }, { students: 25, courses: ["MATH 162", "ENGR 101", "CHEM 101"] }]);
    expect(rule!.capacities).toEqual([{ course: "MATH 161", seats: 32 }, { course: "MATH 162", seats: 30 }, { course: "ENGR 101", seats: 40 }, { course: "CHEM 101", seats: 25 }]);
    expect(describeRule(rule!)).toBe("50 students must be able to take MATH 161, ENGR 101, CHEM 101; 25 students must be able to take MATH 162, ENGR 101, CHEM 101. Seats in each section: MATH 161 32, MATH 162 30, ENGR 101 40, CHEM 101 25.");
  });
  it("goes back to rows and round trips, also through the Excel file", async () => {
    const [rule] = rulesOf(s);
    expect(rulesOf(saveRule({ ...s, constraints: [] }, undefined, rule!)).map((r) => [r.elements, r.capacities])).toEqual([[rule!.elements, rule!.capacities]]);
    expect(rulesToRows(rule!).filter((r) => r.element !== undefined)).toHaveLength(6);
    const back = await readWorkbook(await writeWorkbook(s));
    expect(back.issues).toEqual([]);
    expect(rulesOf(back.schedule)[0]).toEqual(rule);
  });
  it("cannot be saved with a course whose seats are missing, a blank group size, or a course listed twice", () => {
    const [rule] = rulesOf(s);
    const field = (r: Rule) => validateRule(s, r, "Cohort").map((p) => p.field);
    expect(field(rule!)).toEqual([]);
    expect(field({ ...rule!, capacities: rule!.capacities.filter((c) => c.course !== "CHEM 101") })).toEqual(["elements.0", "elements.1"]);
    expect(field({ ...rule!, capacities: rule!.capacities.map((c) => (c.course === "CHEM 101" ? { ...c, seats: undefined } : c)) })).toEqual(["capacities.3"]);
    expect(field({ ...rule!, elements: [{ students: undefined, courses: ["MATH 161"] }] })).toEqual(["elements.0"]);
    expect(field({ ...rule!, elements: [{ students: 5, courses: ["MATH 161", "math  161"] }] })).toEqual(["elements.0"]);
    expect(field({ ...rule!, elements: [] })).toEqual(["elements"]);
    expect(field({ ...rule!, elements: [{ students: 5, courses: ["MATH *"] }] })).toEqual(["elements.0"]);
  });
  it("may have seats for courses no group uses", () => {
    const [rule] = rulesOf(s);
    expect(validateRule(s, { ...rule!, capacities: [...rule!.capacities, { course: "PHYS 101", seats: 20 }] }, "Cohort")).toEqual([]);
  });
});
