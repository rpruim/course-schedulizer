import { describe, expect, it } from "vitest";
import { findConflicts } from "./conflicts.js";
import { importRecords } from "./import.js";
import { describeRule, emptyRule, findRuleViolations, rulesOf, setRuleActive } from "./rules.js";
import { readWorkbook, writeWorkbook } from "./xlsx.js";

type Rec = Record<string, string>;
const sec = (prefix: string, n: string, letter: string, start: string): Rec => ({
  AcademicYear: "Y", Term: "FA", Prefix: prefix, CourseNumber: n, Section: letter, Faculty: "Ada Example", MeetingDays: "MWF", StartTime: start, MeetingDuration: "50", Classroom: "R1",
});
const build = (constraints: Rec[], sessions = [sec("AMUS", "112", "A", "8:00"), sec("BHAV", "112", "A", "9:15")]) => importRecords({ sessions, constraints }).schedule;
// two courses that should not meet in the morning: broken
const window = (extra: Rec = {}): Rec[] => [{ Constraint: "No mornings", Type: "window", Course: "AMUS 112", From: "7:00", To: "12:00", Should: "should not", ...extra }];

describe("activating and deactivating rules", () => {
  it("rules are active unless the file says No", () => {
    expect(rulesOf(build(window())).map((r) => r.active)).toEqual([true]);
    expect(rulesOf(build(window({ Active: "No" }))).map((r) => r.active)).toEqual([false]);
    expect(rulesOf(build(window({ Active: "Yes" }))).map((r) => r.active)).toEqual([true]);
  });
  it("a deactivated rule is not checked", () => {
    const on = build(window());
    expect(findRuleViolations(on).map((v) => v.rule)).toContain("No mornings");
    expect(findRuleViolations(setRuleActive(on, "No mornings", false)).map((v) => v.rule)).not.toContain("No mornings");
    expect(findRuleViolations(setRuleActive(setRuleActive(on, "No mornings", false), "No mornings", true)).map((v) => v.rule)).toContain("No mornings");
  });
  it("a deactivated colocate rule stops silencing the conflict", () => {
    const s = build([{ Constraint: "Together", Type: "colocate", Course: "AMUS 112" }, { Constraint: "Together", Type: "colocate", Course: "BHAV 112" }], [sec("AMUS", "112", "A", "8:00"), sec("BHAV", "112", "A", "8:00")]);
    const conflicts = (x: typeof s) => findConflicts(x).length;
    expect(conflicts(s)).toBe(0);
    expect(conflicts(setRuleActive(s, "Together", false))).toBeGreaterThan(0);
  });
  it("is saved in the Excel file and read back", async () => {
    const s = setRuleActive(build(window()), "No mornings", false);
    const back = await readWorkbook(await writeWorkbook(s));
    expect(back.issues).toEqual([]);
    expect(rulesOf(back.schedule).map((r) => r.active)).toEqual([false]);
  });
});

describe("the terms come first in a rule's sentence", () => {
  const item = (course: string) => ({ course, section: "", instructor: "" });
  it("for every kind of rule", () => {
    const r = { ...emptyRule("takeable"), name: "x", term: "FA", count: undefined, items: [item("AMUS 112"), item("BHAV 112")] };
    expect(describeRule(r)).toBe("In FA, a student must be able to take all of AMUS 112, BHAV 112.");
    expect(describeRule({ ...emptyRule("colocate"), name: "x", term: "FA, SP", items: [item("AMUS 112")] })).toBe("In FA, SP, AMUS 112 is colocated (same instructor): its sections may share a room at the same or overlapping times without a conflict.");
    expect(describeRule({ ...emptyRule("colocate"), name: "x", term: "FA", items: [item("*")] })).toMatch(/^In FA, any courses are colocated/);
    expect(describeRule({ ...emptyRule("consecutive"), name: "x", term: "FA", items: [{ course: "", section: "", instructor: "Kim" }] })).toMatch(/^In FA, Kim should teach at most 3/);
  });
});
