import { describe, expect, it } from "vitest";
import { conflictedSessions, findConflicts, nonStandardSessions } from "./conflicts.js";
import { recordsFromCsv } from "./csv.js";
import { importConstraints, importRecords } from "./import.js";
import { mergeSchedules } from "./merge.js";
import { copyRule, deleteRule, describeRule, emptyRule, findRuleViolations, rulesOf, rulesToRows, ruleSubject, saveRule, validateRule, type Rule } from "./rules.js";
import { fixtureText } from "./testutil.js";
import { readWorkbook, writeWorkbook } from "./xlsx.js";

type Rec = Record<string, string>;
const sec = (prefix: string, n: string, letter: string, days: string, start: string, o: Rec = {}): Rec => ({
  AcademicYear: "Y", Term: "FA", Prefix: prefix, CourseNumber: n, Section: letter, MeetingDays: days, StartTime: start, MeetingDuration: "50", ...o,
});
const build = (sessions: Rec[], constraints: Rec[] = []) => {
  const r = importRecords({ sessions, constraints });
  expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
  return r.schedule;
};
/** The violations of the schedule's own rules (the built-in standard-times check, which flags most test meetings, is left out). */
const violations = (s: ReturnType<typeof build>) => findRuleViolations(s).filter((v) => !v.builtin);
const msgs = (s: ReturnType<typeof build>) => violations(s).map((v) => v.message);
const allMsgs = (s: ReturnType<typeof build>) => findRuleViolations(s).map((v) => v.message);

describe("legacy cohort constraints (fixtures T17, T18)", () => {
  const s = importRecords({
    sessions: recordsFromCsv(fixtureText("cases/conflicts.csv")),
    constraints: recordsFromCsv(fixtureText("cases/constraints.csv")),
  }).schedule;
  it("breaks the rule when the courses cannot all be taken", () => {
    const v = violations(s);
    expect(v.map((x) => [x.rule, x.academicYear])).toEqual([["MUSC major year 2", "T17"], ["Cohort 2", "T18"]]);
    expect(v[0]!.message).toBe("Only 2 of the 3 courses can be taken together (needs all 3): MUSC 234 A × URBS 246 A");
    expect(v[1]!.message).toContain("MUSC 273 A × URBS 283 A"); // names one section, so MUSC 273 B is not involved
    expect(v[1]!.sectionIds).toHaveLength(2);
  });
  it("highlights the meetings involved", () => {
    expect(conflictedSessions([], violations(s)).size).toBe(4);
  });
});

describe("take together: some n / any n", () => {
  const three = [sec("MUSC", "1", "A", "MWF", "9:00"), sec("MUSC", "2", "A", "MWF", "9:00"), sec("MUSC", "3", "A", "TR", "9:00")];
  const rule = (extra: Rec = {}) => ["MUSC 1", "MUSC 2", "MUSC 3"].map((c) => ({ Constraint: "R", Course: c, ...extra }));
  it("needs every course by default", () => {
    expect(msgs(build(three, rule()))).toEqual(["Only 2 of the 3 courses can be taken together (needs all 3): MUSC 1 A × MUSC 2 A"]);
  });
  it("'some 2' needs one workable pair; 'any 2' needs every pair to work", () => {
    expect(msgs(build(three, rule({ Count: "2", Choose: "some" })))).toEqual([]);
    expect(msgs(build(three, rule({ Count: "2", Choose: "any" })))).toEqual(["Not every 2 of the 3 courses can be taken together: MUSC 1 + MUSC 2"]);
  });
  it("'any' with all courses (or no number) is the same as 'some'", () => {
    expect(msgs(build(three, rule({ Choose: "any" })))).toEqual(msgs(build(three, rule())));
    expect(msgs(build(three, rule({ Count: "3", Choose: "any" })))).toEqual(msgs(build(three, rule())));
  });
  it("'any 2' of a pattern checks each pair, and lets a second section save a pair", () => {
    const s = build(
      [sec("MUSC", "301", "A", "MWF", "9:00"), sec("MUSC", "302", "A", "MWF", "9:00"), sec("MUSC", "302", "B", "MWF", "11:00"), sec("MUSC", "303", "A", "TR", "9:00"), sec("MUSC", "304", "A", "MWF", "9:20")],
      [{ Constraint: "300s", Course: "MUSC 3*", Count: "2", Choose: "any" }],
    );
    // 301 vs 304 overlap (the only sections), so that pair fails; 301 + 302 works through 302 B
    expect(msgs(s)).toEqual(["Not every 2 of the 4 courses can be taken together: MUSC 301 + MUSC 304"]);
    expect(violations(s)[0]!.sectionIds.sort()).toEqual(["Y-FA-MUSC301-A", "Y-FA-MUSC304-A"]);
  });
  it("is satisfied when enough can be taken", () => {
    expect(msgs(build(three, rule({ Count: "2" })))).toEqual([]);
  });
  it("two clashing courses are a violation for n = 2", () => {
    expect(msgs(build(three.slice(0, 2), rule({ Count: "2" }).slice(0, 2)))).toEqual(["Only 1 of the 2 courses can be taken together (needs all 2): MUSC 1 A × MUSC 2 A"]);
  });
  it("lets a student pick another section when a course has several", () => {
    const s = build([sec("MUSC", "1", "A", "MWF", "9:00"), sec("MUSC", "1", "B", "MWF", "11:00"), sec("MUSC", "2", "A", "MWF", "9:00")], [{ Constraint: "R", Course: "MUSC 1" }, { Constraint: "R", Course: "MUSC 2" }]);
    expect(msgs(s)).toEqual([]);
  });
  it("is broken when every section of one course overlaps every section of another", () => {
    const s = build([sec("MUSC", "1", "A", "MWF", "9:00"), sec("MUSC", "1", "B", "MWF", "9:20"), sec("MUSC", "2", "A", "MWF", "9:00")], [{ Constraint: "R", Course: "MUSC 1" }, { Constraint: "R", Course: "MUSC 2" }]);
    expect(msgs(s)).toHaveLength(1);
  });
  it("expands a pattern into each matching course", () => {
    const s = build([sec("MUSC", "301", "A", "MWF", "9:00"), sec("MUSC", "302", "A", "MWF", "9:00"), sec("MUSC", "303", "A", "TR", "9:00"), sec("MUSC", "201", "A", "MWF", "9:00")], [{ Constraint: "300s", Course: "MUSC 3*" }]);
    expect(msgs(s)).toEqual(["Only 2 of the 3 courses can be taken together (needs all 3): MUSC 301 A × MUSC 302 A"]);
  });
  it("back-to-back is fine, and so are meetings in different weeks of the term", () => {
    const s = build(
      [sec("MUSC", "1", "A", "MWF", "9:00"), sec("MUSC", "2", "A", "MWF", "9:50"), sec("MUSC", "4", "A", "MWF", "9:00", { TermPart: "First" }), sec("MUSC", "5", "A", "MWF", "9:00", { TermPart: "Second" })],
      [{ Constraint: "R1", Course: "MUSC 1" }, { Constraint: "R1", Course: "MUSC 2" }, { Constraint: "R2", Course: "MUSC 4" }, { Constraint: "R2", Course: "MUSC 5" }],
    );
    expect(msgs(s)).toEqual([]);
  });
  it("skips a term where fewer than two of the courses are offered", () => {
    const s = build([sec("MUSC", "1", "A", "MWF", "9:00"), sec("MUSC", "2", "A", "MWF", "9:00", { Term: "SP" })], [{ Constraint: "R", Course: "MUSC 1" }, { Constraint: "R", Course: "MUSC 2" }]);
    expect(msgs(s)).toEqual([]);
  });
  it("can be limited to one term", () => {
    const sessions = [sec("MUSC", "1", "A", "MWF", "9:00"), sec("MUSC", "2", "A", "MWF", "9:00"), sec("MUSC", "1", "A", "MWF", "9:00", { Term: "SP" }), sec("MUSC", "2", "A", "MWF", "9:00", { Term: "SP" })];
    const s = build(sessions, ["MUSC 1", "MUSC 2"].map((c) => ({ Constraint: "R", Course: c, Term: "SP" })));
    expect(violations(s).map((v) => v.term)).toEqual(["SP"]);
  });
  it("sees a course by any of its listings", () => {
    const r = importRecords({
      sessions: [sec("DIGI", "385", "A", "MW", "9:00"), sec("MUSC", "250", "A", "MW", "9:00")],
      crossListings: [{ SectionId: "Y-FA-DIGI385-A", Prefix: "URBS", CourseNumber: "385" }],
      constraints: [{ Constraint: "R", Course: "urbs  385" }, { Constraint: "R", Course: "MUSC 250" }],
    });
    expect(violations(r.schedule)).toHaveLength(1);
  });
});

describe("window rules", () => {
  const rule = (o: Rec, course = "MUSC *") => [{ Constraint: "W", Course: course, Type: "window", ...o }];
  it("flags a section that meets in a window it should not (overlap, back-to-back allowed)", () => {
    const s = build(
      [sec("MUSC", "1", "A", "MWF", "10:20"), sec("MUSC", "2", "A", "TR", "10:20"), sec("MUSC", "3", "A", "MWF", "9:00"), sec("MUSC", "4", "A", "MWF", "10:50")],
      rule({ From: "10:00", To: "10:50", Days: "MWF" }),
    );
    expect(msgs(s)).toEqual(["MUSC 1 A meets during 10:00–10:50 on M W F"]);
  });
  it("any of the days vs all of the days", () => {
    const sessions = [sec("MUSC", "1", "A", "M", "10:00", { SectionId: "a" }), sec("MUSC", "2", "A", "MWF", "10:00")];
    expect(msgs(build(sessions, rule({ From: "10:00", To: "10:50", Days: "MWF", DayRule: "any" })))).toHaveLength(2);
    expect(msgs(build(sessions, rule({ From: "10:00", To: "10:50", Days: "MWF", DayRule: "all" })))).toEqual(["MUSC 2 A meets during 10:00–10:50 on M W F"]);
  });
  it("without days, looks at Monday to Friday", () => {
    expect(msgs(build([sec("MUSC", "1", "A", "R", "10:00")], rule({ From: "10:00", To: "10:50" })))).toHaveLength(1);
  });
  it("a should rule uses 'entirely within' by default", () => {
    const s = build([sec("MUSC", "1", "A", "MWF", "16:30"), sec("MUSC", "2", "A", "MWF", "13:00")], rule({ From: "08:00", To: "17:00", Should: "should", Days: "MWF" }));
    expect(msgs(s)).toEqual(["MUSC 1 A does not meet within 08:00–17:00 on any of M W F"]);
  });
  it("can ask for overlap instead", () => {
    const s = build([sec("MUSC", "1", "A", "MWF", "16:30")], rule({ From: "08:00", To: "17:00", Should: "should", Days: "MWF", Meets: "overlaps" }));
    expect(msgs(s)).toEqual([]);
  });
  it("with 'at least', that many sections must satisfy it (an evening section)", () => {
    const evening = rule({ From: "17:00", To: "22:00", Should: "should", Count: "1" }, "BHAV 100");
    const day = [sec("BHAV", "100", "A", "MWF", "9:00"), sec("BHAV", "100", "B", "TR", "13:00")];
    expect(msgs(build(day, evening))).toEqual(["Only 0 of 2 sections meet within 17:00–22:00 on any of M T W R F (needs 1)"]);
    expect(msgs(build([...day, sec("BHAV", "100", "C", "T", "18:00")], evening))).toEqual([]);
  });
  it("is about instructors too", () => {
    const s = build([sec("MUSC", "1", "A", "MWF", "8:00", { Faculty: "Kim" }), sec("MUSC", "2", "A", "MWF", "8:00", { Faculty: "Lee" })], [{ Constraint: "Kim not early", Type: "window", Instructor: "kim", From: "00:00", To: "09:00" }]);
    expect(msgs(s)).toEqual(["MUSC 1 A meets during 00:00–09:00 on M W F"]);
  });
  it("ignores sections with no scheduled time", () => {
    expect(msgs(build([{ AcademicYear: "Y", Term: "FA", Prefix: "MUSC", CourseNumber: "1", Section: "A" }], rule({ From: "10:00", To: "11:00", Should: "should" })))).toEqual([]);
  });
  it("highlights the section's meetings", () => {
    const s = build([sec("MUSC", "1", "A", "MWF", "10:00")], rule({ From: "10:00", To: "10:50" }));
    expect(conflictedSessions([], violations(s)).size).toBe(1);
  });
});

describe("importing constraint rows", () => {
  it("reads rule settings from any row of a rule, and the first-version columns still work", () => {
    const { constraints, issues } = importConstraints([
      { Constraint: "W", Course: "MUSC 3*", Type: "window", From: "10:00", To: "10:50", Days: "mwf", DayRule: "all", Should: "should not", Meets: "within" },
      { Constraint: "W", Course: "URBS 3*" },
      { Constraint: "Old", Course: "MUSC 1" },
    ]);
    expect(issues).toEqual([]);
    expect(constraints.map((c) => [c.type, c.from, c.to, c.days, c.dayRule, c.should, c.meets])).toEqual([
      ["window", 600, 650, "MWF", "all", "should not", "within"],
      ["window", 600, 650, "MWF", "all", "should not", "within"],
      ["takeable", undefined, undefined, "", "any", "should not", ""],
    ]);
  });
  it("still reads the first version's AtLeast column as Count", () => {
    const { constraints, issues } = importConstraints([{ Constraint: "R", Course: "MUSC 1", AtLeast: "2" }, { Constraint: "R", Course: "MUSC 2" }]);
    expect(issues).toEqual([]);
    expect(constraints.map((c) => [c.count, c.choose])).toEqual([[2, "some"], [2, "some"]]);
    expect(importConstraints([{ Constraint: "R", Course: "A", Count: "2", Choose: "every" }]).issues[0]!.message).toMatch(/Choose/);
  });
  it("infers a window rule from its times, and reports missing or contradictory settings", () => {
    expect(importConstraints([{ Constraint: "W", Course: "MUSC 1", From: "9:00", To: "10:00" }]).constraints[0]!.type).toBe("window");
    expect(importConstraints([{ Constraint: "W", Course: "MUSC 1", Type: "window", From: "9:00" }]).issues[0]!.message).toMatch(/needs both From and To/);
    expect(importConstraints([{ Constraint: "W", Course: "MUSC 1", Type: "window", From: "10:00", To: "9:00" }]).issues[0]!.message).toMatch(/From must be earlier than To/);
    expect(importConstraints([{ Constraint: "R", Course: "A", Count: "2" }, { Constraint: "R", Course: "B", Count: "3" }]).issues[0]!.message).toMatch(/Count "3" differs/);
    expect(importConstraints([{ Constraint: "R", Course: "A", DayRule: "sometimes" }]).issues[0]!.message).toMatch(/DayRule/);
    expect(importConstraints([{ Constraint: "W", Course: "A", From: "noon", To: "13:00" }]).issues[0]!.message).toMatch(/not a time/);
  });
  it("survives an Excel round trip", async () => {
    const s = build([sec("MUSC", "1", "A", "MWF", "9:00")], [
      { Constraint: "W", Course: "MUSC 3*", Type: "window", From: "10:00", To: "10:50", Days: "MWF", DayRule: "all", Should: "should", Meets: "overlaps", Count: "1", Term: "FA", Comment: "why" },
      { Constraint: "A", Course: "MUSC 1", Count: "2", Choose: "any" },
      { Constraint: "A", Course: "MUSC 2" },
      { Constraint: "W", Instructor: "Kim" },
      { Constraint: "T", Course: "MUSC 1" },
      { Constraint: "T", Course: "MUSC 2", Section: "B" },
      { Constraint: "S", Type: "standard", Course: "MUSC *", Term: "FA" },
      { Constraint: "C", Type: "consecutive", Instructor: "Kim", Count: "3", Bound: "atLeast", Gap: "30" },
      { Constraint: "C", Instructor: "Lee" },
    ]);
    const back = await readWorkbook(await writeWorkbook(s));
    expect(back.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(back.schedule.constraints).toEqual(s.constraints);
  });
});

describe("editing rules", () => {
  const s = build([sec("MUSC", "1", "A", "MWF", "9:00")], [{ Constraint: "A", Course: "MUSC 1" }, { Constraint: "A", Course: "MUSC 2" }, { Constraint: "B", Course: "MUSC 3" }]);
  it("gathers rows into rules", () => {
    expect(rulesOf(s).map((r) => [r.name, r.type, r.items.map((i) => i.course)])).toEqual([["A", "takeable", ["MUSC 1", "MUSC 2"]], ["B", "takeable", ["MUSC 3"]]]);
  });
  it("saves a rule over the one it replaces, keeping its place, or adds a new one", () => {
    const r = { ...rulesOf(s)[0]!, name: "A2", count: 1 };
    const t = saveRule(s, "A", r);
    expect(rulesOf(t).map((x) => x.name)).toEqual(["A2", "B"]);
    expect(rulesOf(t)[0]!.count).toBe(1);
    const u = saveRule(t, undefined, { ...emptyRule("window"), name: "N", items: [{ course: "MUSC 5", section: "", instructor: "" }] });
    expect(rulesOf(u).map((x) => x.name)).toEqual(["A2", "B", "N"]);
    expect(rulesOf(deleteRule(u, "B")).map((x) => x.name)).toEqual(["A2", "N"]);
    expect(rulesOf(u)[2]).toMatchObject({ type: "window", from: 600, to: 660 });
  });
  it("tells courses from instructors, and does not allow a mix", () => {
    const base = { ...emptyRule("window"), name: "W" };
    const people = { ...base, items: [{ course: "", section: "", instructor: "Kim" }, { course: "", section: "", instructor: "Lee" }] };
    expect(ruleSubject(people)).toBe("instructors");
    expect(describeRule(people)).toBe("Every section taught by Kim, Lee should not meet during 10:00–11:00 on any of M T W R F.");
    expect(describeRule({ ...people, count: 1 })).toBe("At least 1 of the sections taught by Kim, Lee should not meet during 10:00–11:00 on any of M T W R F.");
    const mixed = { ...base, items: [{ course: "MUSC 1", section: "", instructor: "" }, { course: "", section: "", instructor: "Kim" }] };
    expect(ruleSubject(mixed)).toBe("courses");
    expect(validateRule(build([]), mixed).map((p) => p.field)).toEqual(["items.1"]);
    expect(validateRule(build([]), people)).toEqual([]);
  });
  it("validates", () => {
    const base: Rule = { ...emptyRule("takeable"), name: "X", items: [{ course: "MUSC 1", section: "", instructor: "" }, { course: "MUSC 2", section: "", instructor: "" }] };
    expect(validateRule(s, base)).toEqual([]);
    expect(validateRule(s, { ...base, name: "" }).map((p) => p.field)).toEqual(["name"]);
    expect(validateRule(s, { ...base, name: "b" }).map((p) => p.field)).toEqual(["name"]);
    expect(validateRule(s, { ...base, name: "b" }, "B")).toEqual([]); // renaming to itself is fine
    expect(validateRule(s, { ...base, items: [base.items[0]!] }).map((p) => p.field)).toEqual(["items"]);
    expect(validateRule(s, { ...base, count: 5 }).map((p) => p.field)).toEqual(["count"]);
    const w = { ...emptyRule("window"), name: "W", items: [{ course: "MUSC 1", section: "", instructor: "" }] };
    expect(validateRule(s, w)).toEqual([]);
    expect(validateRule(s, { ...w, from: 700, to: 600 }).map((p) => p.field)).toEqual(["to"]);
    expect(validateRule(s, { ...w, items: [{ course: "", section: "", instructor: "" }] }).map((p) => p.field)).toEqual(["items.0"]);
  });
  it("describes a rule in a sentence", () => {
    const item = (course: string, section = "") => ({ course, section, instructor: "" });
    expect(describeRule({ ...emptyRule("takeable"), name: "x", items: [item("MUSC 231"), item("URBS 243", "B")], count: 2 })).toBe("A student must be able to take some 2 of MUSC 231, URBS 243 B.");
    expect(describeRule({ ...emptyRule("takeable"), name: "x", items: [item("MUSC 3*")], count: 2, choose: "any" })).toBe("A student must be able to take any 2 of MUSC 3*.");
    expect(describeRule({ ...emptyRule("takeable"), name: "x", items: [item("MUSC 3*")] })).toBe("A student must be able to take all of MUSC 3*.");
    expect(describeRule({ ...emptyRule("window"), name: "x", items: [item("MUSC 231")], from: 600, to: 650, days: "MWF" })).toBe("Every section of MUSC 231 should not meet during 10:00–10:50 on any of M W F.");
    expect(describeRule({ ...emptyRule("window"), name: "x", items: [item("BHAV 100")], from: 1020, to: 1320, should: "should", count: 1, term: "FA" })).toBe("In FA, at least 1 of the sections of BHAV 100 should meet within 17:00–22:00 on any of M T W R F.");
  });
});

describe("standard times (built in) and the rules that change them", () => {
  const meet = (n: string, days: string, start: string, dur: string, extra: Rec = {}) => sec("MUSC", n, "A", days, start, { MeetingDuration: dur, ...extra });
  const allow = (extra: Rec) => ({ Constraint: "Allow", Type: "standard", Action: "allow", ...extra });

  it("always flags meetings outside the standard patterns, saying what would be standard", () => {
    const s = build([meet("1", "MWF", "9:15", "65"), meet("2", "MWF", "9:30", "65"), meet("3", "MWF", "9:15", "50"), meet("4", "TR", "10:20", "100"), meet("5", "MTWR", "10:20", "100")]);
    expect(allMsgs(s)).toEqual([
      "MUSC 2 A meets M W F 09:30–10:35 (65 min), which is not a standard time (standard M W F starts for 65 minutes: 8:00, 9:15, 11:00, 12:15, 13:30, 14:45)",
      "MUSC 3 A meets M W F 09:15–10:05 (50 min), which is not a standard time (standard M W F lengths: 65, 120, 60 minutes)",
      "MUSC 5 A meets M T W R 10:20–12:00 (100 min), which is not a standard time (no standard time uses the days M T W R)",
    ]);
    const v = findRuleViolations(s)[0]!;
    expect(v).toMatchObject({ rule: "Standard times", builtin: true, type: "standard" });
  });
  it("is orange, not red: its meetings are not counted as conflicts", () => {
    const v = findRuleViolations(build([meet("2", "MWF", "9:30", "65")]));
    expect(conflictedSessions([], v).size).toBe(0);
    expect(nonStandardSessions(v).size).toBe(1);
  });
  it("ignores sections with no time, and checks each meeting of a section", () => {
    expect(allMsgs(build([{ AcademicYear: "Y", Term: "FA", Prefix: "MUSC", CourseNumber: "9", Section: "A" }]))).toEqual([]);
    const s = build([meet("1", "MW", "9:15", "50", { SectionId: "x" }), meet("1", "F", "9:15", "50", { SectionId: "x" })]);
    expect(allMsgs(s)).toEqual(["MUSC 1 A meets F 09:15–10:05 (50 min), which is not a standard time (standard F lengths: 170, 80 minutes)"]);
  });
  it("a rule can allow a time (a known exception), for some courses", () => {
    const sessions = [meet("391", "R", "15:05", "50"), sec("URBS", "391", "A", "R", "15:05", { MeetingDuration: "50" })];
    expect(allMsgs(build(sessions))).toHaveLength(2);
    const rows = [{ Constraint: "Allow", Type: "standard", Course: "MUSC 391" }, allow({ Days: "R", Duration: "50", Starts: "15:05" })];
    expect(allMsgs(build(sessions, rows))).toEqual([expect.stringContaining("URBS 391 A")]);
    expect(allMsgs(build(sessions, [{ ...rows[0]!, Course: "*" }, rows[1]!]))).toEqual([]);
  });
  it("a rule can disallow a time that is standard elsewhere", () => {
    const sessions = [meet("1", "MWF", "8:00", "65"), meet("2", "MWF", "9:15", "65")];
    const rows = [{ Constraint: "No early", Type: "standard", Course: "*" }, { Constraint: "No early", Type: "standard", Action: "disallow", Days: "MWF", Duration: "65", Starts: "8:00" }];
    expect(allMsgs(build(sessions, rows))).toEqual([expect.stringContaining("MUSC 1 A meets M W F 08:00–09:05 (65 min), which is a standard time, but not allowed by “No early”; allowable M W F starts for 65 minutes: 9:15, 11:00, 12:15, 13:30, 14:45")]);
  });
  it("a disallow with no length or starts removes every pattern on those days", () => {
    const rows = [{ Constraint: "No MWF", Type: "standard", Course: "*" }, { Constraint: "No MWF", Action: "disallow", Days: "MWF" }];
    expect(allMsgs(build([meet("1", "MWF", "9:15", "65")], rows))).toEqual([expect.stringContaining("no standard time uses the days M W F")]);
    expect(allMsgs(build([meet("1", "TR", "10:20", "100")], rows))).toEqual([]);
  });
  it("later changes win, and a rule can be limited to some terms", () => {
    const rows = [
      { Constraint: "Both", Type: "standard", Course: "*", Term: "SP" },
      { Constraint: "Both", Action: "allow", Days: "R", Duration: "50", Starts: "15:05" },
      { Constraint: "Both", Action: "disallow", Days: "R", Duration: "50", Starts: "15:05, 16:00" },
    ];
    expect(allMsgs(build([meet("1", "R", "15:05", "50", { Term: "SP" })], rows))).toHaveLength(1); // allowed, then disallowed
    const allowed = [{ Constraint: "A", Type: "standard", Course: "*", Term: "SP" }, allow({ Constraint: "A", Days: "R", Duration: "50", Starts: "15:05" })];
    expect(allMsgs(build([meet("1", "R", "15:05", "50", { Term: "SP" })], allowed))).toEqual([]);
    expect(allMsgs(build([meet("1", "R", "15:05", "50", { Term: "FA" })], allowed))).toHaveLength(1); // the rule is for SP only
  });
  it("reads, writes and describes standard-time rules", async () => {
    const rows = [
      { Constraint: "Colloquium", Type: "standard", Course: "MUSC 391", Term: "FA, SP", Comment: "weekly" },
      { Constraint: "Colloquium", Action: "allow", Days: "R", Duration: "50", Starts: "15:05, 16:00" },
      { Constraint: "Colloquium", Action: "disallow", Days: "MWF", Duration: "65", Starts: "8:00" },
      { Constraint: "Colloquium", Action: "disallow", Days: "TR" },
    ];
    const s = build([meet("1", "MWF", "9:15", "65")], rows);
    const [rule] = rulesOf(s);
    expect(rule!.items).toEqual([{ course: "MUSC 391", section: "", instructor: "" }]);
    expect(rule!.changes).toEqual([
      { action: "allow", days: "R", duration: 50, starts: [905, 960] },
      { action: "disallow", days: "MWF", duration: 65, starts: [480] },
      { action: "disallow", days: "TR", starts: [] },
    ]);
    expect(describeRule(rule!)).toBe("In FA, SP, modified standard times for MUSC 391: also allow R for 50 minutes starting 15:05, 16:00; stop allowing M W F for 65 minutes starting 8:00; stop allowing T R.");
    const back = await readWorkbook(await writeWorkbook(s));
    expect(back.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(back.schedule.constraints).toEqual(s.constraints);
    expect(rulesToRows(rule!)).toEqual(s.constraints.map((c) => ({ ...c, comment: c.comment })));
  });
  it("validates the changes", () => {
    const base = { ...emptyRule("standard"), name: "S", items: [{ course: "*", section: "", instructor: "" }], changes: [{ action: "allow" as const, days: "R", duration: 50, starts: [905] }] };
    expect(validateRule(build([]), base)).toEqual([]);
    expect(validateRule(build([]), { ...base, changes: [] }).map((p) => p.field)).toEqual(["changes"]);
    expect(validateRule(build([]), { ...base, changes: [{ action: "allow", days: "R", starts: [] }] }).map((p) => p.field)).toEqual(["changes.0"]);
    expect(validateRule(build([]), { ...base, changes: [{ action: "disallow", days: "", starts: [] }] }).map((p) => p.field)).toEqual(["changes.0"]);
    expect(validateRule(build([]), { ...base, changes: [{ action: "disallow", days: "MWF", starts: [] }] })).toEqual([]);
  });
});

describe("rules apply to the terms listed", () => {
  it("takes several terms, separated by commas or spaces, and rejects unknown ones", () => {
    const base = { ...emptyRule("window"), name: "W", items: [{ course: "MUSC *", section: "", instructor: "" }] };
    expect(validateRule(build([]), { ...base, term: "FA, SP" })).toEqual([]);
    expect(validateRule(build([]), { ...base, term: "FA XX" }).map((p) => p.message)).toEqual(["“XX” is not a term of this schedule."]);
    const rows = [{ Constraint: "W", Type: "window", Course: "MUSC *", From: "9:00", To: "10:00", Term: "FA, SP" }];
    const s = build([sec("MUSC", "1", "A", "MWF", "9:15"), sec("MUSC", "2", "A", "MWF", "9:15", { Term: "SP" }), sec("MUSC", "3", "A", "MWF", "9:15", { Term: "SU" })], rows);
    expect(violations(s).map((v) => v.term)).toEqual(["FA", "SP"]);
  });
});

describe("back-to-back (consecutive) rule", () => {
  const fac = (name: string) => ({ Faculty: name, MeetingDuration: "50" });
  const day = [
    sec("MUSC", "1", "A", "MWF", "9:00", fac("Kim")),
    sec("MUSC", "2", "A", "MWF", "10:00", fac("Kim")), // starts 10 min after the first ends
    sec("MUSC", "3", "A", "MWF", "11:05", fac("Kim")), // 15 min after
    sec("MUSC", "4", "A", "MWF", "13:00", fac("Kim")), // a long gap
    sec("MUSC", "5", "A", "TR", "9:00", fac("Lee")),
  ];
  const most = (n: string, who = "Kim", extra: Rec = {}) => [{ Constraint: "Run", Type: "consecutive", Instructor: who, Count: n, Bound: "atMost", ...extra }];
  it("at most n: flags a run longer than n, naming the classes", () => {
    expect(msgs(build(day, most("2")))).toEqual(
      ["Kim teaches 3 consecutive classes on M: MUSC 1 A 09:00–09:50, MUSC 2 A 10:00–10:50, MUSC 3 A 11:05–11:55 (at most 2)", "Kim teaches 3 consecutive classes on W: MUSC 1 A 09:00–09:50, MUSC 2 A 10:00–10:50, MUSC 3 A 11:05–11:55 (at most 2)", "Kim teaches 3 consecutive classes on F: MUSC 1 A 09:00–09:50, MUSC 2 A 10:00–10:50, MUSC 3 A 11:05–11:55 (at most 2)"],
    );
    expect(msgs(build(day, most("3")))).toEqual([]);
  });
  it("uses the gap: 20 minutes by default, or the rule's own", () => {
    const wide = [sec("MUSC", "1", "A", "M", "9:00", fac("Kim")), sec("MUSC", "2", "A", "M", "10:20", fac("Kim"))]; // 30 min between
    expect(msgs(build(wide, most("1")))).toEqual([]);
    expect(msgs(build(wide, most("1", "Kim", { Gap: "30" })))).toHaveLength(1);
    const touching = [sec("MUSC", "1", "A", "M", "9:00", fac("Kim")), sec("MUSC", "2", "A", "M", "9:50", fac("Kim"))];
    expect(msgs(build(touching, most("1")))).toHaveLength(1); // back to back counts
    const overlapping = [sec("MUSC", "1", "A", "M", "9:00", fac("Kim")), sec("MUSC", "2", "A", "M", "9:40", fac("Kim"))];
    expect(msgs(build(overlapping, most("1")))).toEqual([]); // that is a conflict, not back to back
  });
  it("classes in different weeks of the term are not consecutive", () => {
    const halves = [sec("MUSC", "1", "A", "M", "9:00", { ...fac("Kim"), TermPart: "First" }), sec("MUSC", "2", "A", "M", "10:00", { ...fac("Kim"), TermPart: "Second" })];
    expect(msgs(build(halves, most("1")))).toEqual([]);
  });
  it("at least n: met when the term has a run of that many, else flagged for that term", () => {
    const least = (n: string, who = "Kim", extra: Rec = {}) => [{ Constraint: "Run", Type: "consecutive", Instructor: who, Count: n, Bound: "atLeast", ...extra }];
    expect(msgs(build(day, least("3")))).toEqual([]);
    expect(msgs(build(day, least("4")))).toEqual(["Kim never teaches 4 consecutive classes in FA (the most is 3, on M)"]);
    expect(msgs(build(day, least("2", "Lee")))).toEqual(["Lee never teaches 2 consecutive classes in FA (the most is 1)"]);
    expect(msgs(build(day, least("2", "Nobody")))).toEqual([]); // not teaching at all: nothing to check
  });
  it("at least n is checked in each term, and only in the terms the rule lists", () => {
    const fall = day.slice(0, 3);
    const spring = [sec("MUSC", "7", "A", "MWF", "9:00", { ...fac("Kim"), Term: "SP" }), sec("MUSC", "8", "A", "MWF", "13:00", { ...fac("Kim"), Term: "SP" })];
    const least = (extra: Rec = {}) => [{ Constraint: "Run", Type: "consecutive", Instructor: "Kim", Count: "2", Bound: "atLeast", ...extra }];
    expect(violations(build([...fall, ...spring], least())).map((v) => v.term)).toEqual(["SP"]); // fine in fall, not in spring
    expect(msgs(build([...fall, ...spring], least({ Term: "FA" })))).toEqual([]); // the rule is for fall only
    expect(violations(build([...fall, ...spring], least({ Term: "FA, SP" }))).map((v) => v.term)).toEqual(["SP"]);
    expect(violations(build([...fall, ...spring], least({ Term: "SP" }))).map((v) => v.term)).toEqual(["SP"]);
  });
  it("covers several instructors in one rule, and counts a section's own back-to-back meetings once", () => {
    const rows = [{ Constraint: "Run", Type: "consecutive", Instructor: "Kim", Count: "1", Bound: "atMost" }, { Constraint: "Run", Instructor: "Lee" }];
    const s = build([sec("MUSC", "1", "A", "M", "9:00", fac("Kim")), sec("MUSC", "2", "A", "M", "10:00", fac("Kim")), sec("MUSC", "5", "A", "T", "9:00", fac("Lee")), sec("MUSC", "6", "A", "T", "10:00", fac("Lee"))], rows);
    expect(violations(s).map((v) => v.message.split(" teaches")[0])).toEqual(["Kim", "Lee"]);
    const lab = build([sec("MUSC", "1", "A", "M", "9:00", { ...fac("Kim"), SectionId: "x" }), sec("MUSC", "1", "A", "M", "9:50", { ...fac("Kim"), SectionId: "x" })], most("1"));
    expect(msgs(lab)).toEqual([]);
  });
  it("highlights the classes in a too-long run", () => {
    expect(conflictedSessions([], violations(build(day.slice(0, 3), most("2")))).size).toBe(3);
  });
  it("describes itself and validates", () => {
    const r = { ...emptyRule("consecutive"), name: "x", items: [{ course: "", section: "", instructor: "Kim" }, { course: "", section: "", instructor: "Lee" }], count: 2 };
    expect(describeRule(r)).toBe("Each of Kim, Lee should teach at most 2 consecutive classes (a class follows another when it starts within 20 minutes of the other's end).");
    expect(describeRule({ ...r, bound: "atLeast", items: [r.items[0]!] })).toBe("In each term, Kim should teach at least 2 consecutive classes (a class follows another when it starts within 20 minutes of the other's end).");
    expect(validateRule(build([]), r)).toEqual([]);
    expect(validateRule(build([]), { ...r, items: [{ course: "MUSC 1", section: "", instructor: "" }] }).map((p) => p.field)).toEqual(["items.0"]);
    expect(validateRule(build([]), { ...r, count: undefined as never }).map((p) => p.field)).toEqual(["count"]);
  });
});

describe("the demo schedule with constraint rules (fixtures/cases/rules-*.csv)", () => {
  const demo = () => {
    const r = importRecords({ sessions: recordsFromCsv(fixtureText("cases/rules-sessions.csv")), constraints: recordsFromCsv(fixtureText("cases/rules-constraints.csv")) });
    expect(r.issues).toEqual([]);
    return r.schedule;
  };
  it("has one of each kind of rule, some met and some not", () => {
    const s = demo();
    expect(rulesOf(s).map((r) => [r.name, r.type])).toEqual([
      ["AMUS major, year 2", "takeable"],
      ["Digital information minor: any two electives", "takeable"],
      ["Digital information minor: some pair of electives", "takeable"],
      ["Colloquium hour is free", "window"],
      ["Gus does not teach before 9:00", "window"],
      ["Behavior in Sport needs an evening section", "window"],
      ["Kim Mockup: at most two classes in a row", "consecutive"],
      ["Lee Standin: at least two classes in a row", "consecutive"],
      ["Colloquium time", "standard"],
      ["No 8:00 MWF", "standard"],
      ["Corpus studies may meet one day of TR", "subset"],
      ["The seminar runs at two levels", "colocate"],
    ]);
    expect(violations(demo()).map((v) => [v.rule, v.message])).toEqual([
      ["Digital information minor: any two electives", "Not every 2 of the 3 courses can be taken together: BHAV 312 + DIGI 318"],
      ["Colloquium hour is free", "AMUS 368 A meets during 15:05–15:55 on R"],
      ["Gus does not teach before 9:00", "AMUS 145 B meets during 00:00–09:00 on M W F"],
      ["Behavior in Sport needs an evening section", "Only 0 of 2 sections meet within 17:00–22:00 on any of M T W R F (needs 1)"],
      ["Kim Mockup: at most two classes in a row", expect.stringContaining("Kim Mockup teaches 3 consecutive classes on M: DIGI 306 A 13:30–14:35, AMUS 145 A 14:45–15:50, DIGI 378 A 16:00–17:00 (at most 2)")],
      ["Kim Mockup: at most two classes in a row", expect.stringContaining("on W")],
      ["Kim Mockup: at most two classes in a row", expect.stringContaining("on F")],
      ["Lee Standin: at least two classes in a row", "Lee Standin never teaches 2 consecutive classes in FA (the most is 1)"],
    ]);
  });
  it("names every section a rule violation involves, so the section editor can list it", () => {
    const rule = findRuleViolations(demo()).filter((v) => !v.builtin && v.rule.startsWith("Kim"));
    expect(new Set(rule.flatMap((v) => v.sectionIds))).toEqual(new Set(["R2-FA-AMUS145-A", "R2-FA-DIGI306-A", "R2-FA-DIGI378-A"]));
  });
  it("does not report the seminar listed at two levels as a conflict, because a rule allows it", () => {
    const s = demo();
    expect(findConflicts(s).filter((c) => c.sectionIdA.includes("DIGI371") || c.sectionIdB.includes("DIGI371"))).toEqual([]);
    const without = { ...s, constraints: s.constraints.filter((c) => c.type !== "colocate") };
    expect(findConflicts(without).map((c) => c.type)).toEqual(["Instructor", "Room"]);
  });
  it("flags only the standard-time exceptions the rules do not cover", () => {
    const odd = findRuleViolations(demo()).filter((v) => v.builtin);
    expect(odd.map((v) => v.sectionIds[0])).toEqual(["R2-FA-AMUS145-B", "R2-FA-BHAV112-C", "R2-SP-DIGI325-A"]); // AMUS 375 on Tuesday alone is allowed by the subset rule; DIGI 325 on Friday alone is not covered
    expect(odd[0]!.message).toContain("allowable M W F starts for 65 minutes: 9:15, 11:00, 12:15, 13:30, 14:45"); // 8:00 is disallowed, so it is no longer offered
  });
});

describe("subset of standard times", () => {
  const meet = (n: string, days: string, start: string, dur: string, prefix = "MUSC", extra: Rec = {}) => sec(prefix, n, "A", days, start, { MeetingDuration: dur, ...extra });
  const rule = (course: string, extra: Rec = {}): Rec[] => [{ Constraint: "Subsets are intended", Type: "subset", Course: course, ...extra }];

  it("flags Tuesday alone at 8:00 for 100 minutes, and says a subset rule would allow it", () => {
    const s = build([meet("1", "T", "8:00", "100"), meet("2", "TR", "8:00", "100")]);
    expect(allMsgs(s)).toEqual(["MUSC 1 A meets T 08:00–09:40 (100 min), which is not a standard time (only some of the days of T R at that time; a “Subset of standard times” rule allows that)"]);
  });
  it("lets the courses it names use some, but not all, of the days of a standard time", () => {
    const sessions = [meet("1", "T", "8:00", "100"), meet("2", "MW", "9:15", "65"), meet("3", "W", "11:00", "65", "URBS")];
    expect(allMsgs(build(sessions))).toHaveLength(3);
    expect(allMsgs(build(sessions, rule("MUSC *")))).toEqual([expect.stringContaining("URBS 3 A")]); // the rule does not name URBS
    expect(allMsgs(build(sessions, rule("*")))).toEqual([]);
  });
  it("still flags a meeting whose start or length is not standard, or whose days are in no standard time", () => {
    const sessions = [meet("1", "T", "8:30", "100"), meet("2", "T", "8:00", "90"), meet("3", "MT", "9:15", "65"), meet("4", "TWR", "8:00", "100")];
    expect(allMsgs(build(sessions, rule("*")))).toHaveLength(4);
  });
  it("does not change what is standard: a whole pattern is fine either way, and a modified list is used", () => {
    expect(allMsgs(build([meet("1", "TR", "8:00", "100")], rule("*")))).toEqual([]);
    // a standard-times rule that adds a pattern: subsets of the new pattern are allowed too
    const rows = [...rule("*"), { Constraint: "Colloquium", Type: "standard", Course: "*" }, { Constraint: "Colloquium", Action: "allow", Days: "MW", Duration: "75", Starts: "15:00" }];
    expect(allMsgs(build([meet("1", "W", "15:00", "75")], rows))).toEqual([]);
    expect(allMsgs(build([meet("1", "W", "15:00", "75")], rows.slice(0, 1)))).toHaveLength(1);
  });
  it("can be limited to some terms, like other rules", () => {
    const sessions = [meet("1", "T", "8:00", "100"), meet("2", "T", "8:00", "100", "MUSC", { Term: "SP" })];
    expect(allMsgs(build(sessions, rule("*", { Term: "FA" })))).toEqual([expect.stringContaining("MUSC 2 A")]);
  });
  it("reads and writes as a rule with a type of its own, and is described in a sentence", () => {
    const s = build([meet("1", "T", "8:00", "100")], rule("MUSC 3*", { Term: "FA" }));
    const r = rulesOf(s)[0]!;
    expect(r.type).toBe("subset");
    expect(describeRule(r)).toBe("In FA, MUSC 3* may meet on only some of the days of a standard time (for example Tuesday alone when TR is standard).");
    expect(describeRule({ ...r, items: [{ course: "*", section: "", instructor: "" }], term: "" })).toMatch(/^Every course may meet/);
    expect(rulesToRows(r)[0]).toMatchObject({ type: "subset", course: "MUSC 3*", term: "FA" });
    expect(importConstraints([{ Constraint: "X", Type: "Subset of standard times", Course: "*" }]).constraints[0]!.type).toBe("subset");
  });
  it("needs courses, not instructors, and no changes", () => {
    const s = build([]);
    expect(validateRule(s, { ...emptyRule("subset"), name: "S" }).map((p) => p.field)).toEqual(["items"]);
    expect(validateRule(s, { ...emptyRule("subset"), name: "S", items: [{ course: "*", section: "", instructor: "" }] })).toEqual([]);
    expect(validateRule(s, { ...emptyRule("subset"), name: "S", items: [{ course: "", section: "", instructor: "Ada" }] }).map((p) => p.message)).toContain("A “subset of standard times” rule lists courses.");
  });
  it("survives a round trip through the Excel file", async () => {
    const s = build([meet("1", "T", "8:00", "100")], rule("*"));
    const back = (await readWorkbook(await writeWorkbook(s))).schedule;
    expect(rulesOf(back).map((r) => r.type)).toEqual(["subset"]);
    expect(allMsgs(back)).toEqual([]);
  });
});

describe("rules and merged schedules", () => {
  const custom = (s: Parameters<typeof findRuleViolations>[0]) => findRuleViolations(s).filter((v) => !v.builtin);
  const a = () => importRecords({ sessions: [sec("MUSC", "1", "A", "MWF", "9:00"), sec("MUSC", "2", "A", "MWF", "9:00")], constraints: [{ Constraint: "Both", Course: "MUSC 1" }, { Constraint: "Both", Course: "MUSC 2" }] }).schedule;
  const b = () => importRecords({ sessions: [sec("MUSC", "1", "A", "TR", "9:00"), sec("MUSC", "2", "A", "TR", "11:00")], constraints: [] }).schedule;
  it("a rule about sections together (take together) is checked against the whole merged schedule", () => {
    expect(custom(a()).map((v) => v.rule)).toEqual(["Both"]);
    const merged = mergeSchedules([{ id: "a", name: "A", schedule: a() }, { id: "b", name: "B", schedule: b() }]).schedule;
    // B's sections offer a clash-free choice of MUSC 1 and MUSC 2, so a student can take both: the rule is met
    expect(custom(merged)).toEqual([]);
    const reversed = mergeSchedules([{ id: "b", name: "B", schedule: b() }, { id: "a", name: "A", schedule: a() }]).schedule;
    expect(custom(reversed)).toEqual([]);
  });
  it("a rule about sections one at a time (a window rule for every section) stays with its own schedule", () => {
    const morning = (id: string) => importRecords({ sessions: [sec("MUSC", "1", "A", "MWF", "8:00")], constraints: id === "a" ? [{ Constraint: "Not early", Type: "window", Course: "MUSC 1", From: "7:00", To: "9:00", Should: "should not" }] : [] }).schedule;
    const merged = mergeSchedules([{ id: "a", name: "A", schedule: morning("a") }, { id: "b", name: "B", schedule: morning("b") }]).schedule;
    const found = custom(merged);
    expect(found).toHaveLength(1);
    expect(found[0]!.sectionIds).toEqual(["Y-FA-MUSC1-A"]); // not B's section (Y-FA-MUSC1-A~2)
  });
  it("the same rule saved in two schedules is checked once", () => {
    const merged = mergeSchedules([{ id: "a", name: "A", schedule: a() }, { id: "a2", name: "A2", schedule: a() }]).schedule;
    expect(custom(merged).map((v) => v.rule)).toEqual(["Both"]);
  });
  it("copies a rule to another schedule, renaming it when the name is taken and skipping an identical one", () => {
    const first = copyRule(a(), b(), "Both");
    expect(first).toMatchObject({ name: "Both", result: "added" });
    expect(rulesOf(first.schedule).map((r) => r.name)).toEqual(["Both"]);
    expect(copyRule(a(), first.schedule, "Both")).toMatchObject({ result: "already" });
    const other = importRecords({ sessions: [], constraints: [{ Constraint: "Both", Course: "MUSC 9" }, { Constraint: "Both", Course: "MUSC 8" }] }).schedule;
    const renamed = copyRule(a(), other, "Both");
    expect(renamed).toMatchObject({ name: "Both (2)", result: "renamed" });
    expect(rulesOf(renamed.schedule).map((r) => r.name)).toEqual(["Both", "Both (2)"]);
    expect(copyRule(a(), b(), "Nope").result).toBe("missing");
  });
});

describe("colocated courses (the allow-collisions rule)", () => {
  const seminar = (n: string, o: Rec = {}) => sec("MUSC", n, "A", "TR", "9:15", { Faculty: "Kim", Classroom: "SB 1", ...o });
  const conflicts = (sessions: Rec[], constraints: Rec[] = []) => findConflicts(build(sessions, constraints)).map((c) => [c.type, c.sectionIdA, c.sectionIdB]);
  const allow = (course: string, extra: Rec = {}): Rec => ({ Constraint: "Seminar", Type: "colocate", Course: course, ...extra });

  it("reports two sections that share an instructor, a room and a time, until a rule allows it", () => {
    const sessions = [seminar("200"), seminar("300")];
    expect(conflicts(sessions)).toHaveLength(2);
    expect(conflicts(sessions, [allow("MUSC 200"), allow("MUSC 300")])).toEqual([]);
  });
  it("lets the sections of one course collide with each other when the course is listed once", () => {
    const same = [seminar("200"), seminar("200", { Section: "B" })];
    expect(conflicts(same)).toHaveLength(2);
    expect(conflicts(same, [allow("MUSC 200")])).toEqual([]);
    expect(conflicts(same, [allow("MUSC 200"), allow("MUSC 200")])).toEqual([]);
    expect(conflicts(same, [allow("MUSC 200", { Section: "A" })]).length).toBe(2); // B is not named, so it still collides with A
  });
  it("allows only pairs that the same rule names, with patterns and a section letter", () => {
    const sessions = [seminar("200"), seminar("300"), seminar("301", { Section: "B" }), seminar("400")];
    expect(new Set(conflicts(sessions, [allow("MUSC 2*"), allow("MUSC 3*")]).map(([, a, b]) => `${a}|${b}`)).size).toBe(3); // 400 still collides with each, and 200/300 are only allowed with a rule naming both
    expect(conflicts(sessions, [allow("MUSC [234]*")])).toEqual([]);
    const lettered = [seminar("200"), seminar("300", { Section: "A" }), seminar("300", { Section: "B", TermPart: "Full" })];
    expect(conflicts(lettered, [allow("MUSC 200"), allow("MUSC 300", { Section: "A" })]).every(([, a, b]) => a.includes("300-B") || b.includes("300-B"))).toBe(true);
  });
  it("does not allow collisions with a course the rule leaves out, nor in another term", () => {
    expect(conflicts([seminar("200"), seminar("300"), seminar("400")], [allow("MUSC 200"), allow("MUSC 300")]).length).toBeGreaterThan(0);
    const spring = [seminar("200", { Term: "SP" }), seminar("300", { Term: "SP" })];
    expect(conflicts(spring, [allow("MUSC *", { Term: "FA" })])).toHaveLength(2);
    expect(conflicts(spring, [allow("MUSC *", { Term: "SP" })])).toEqual([]);
  });
  it("is described, validated and flags nothing itself", () => {
    const s = build([seminar("200"), seminar("300")], [allow("MUSC 200"), allow("MUSC 300")]);
    const rule = rulesOf(s)[0]!;
    expect(rule.type).toBe("colocate");
    expect(describeRule(rule)).toBe("MUSC 200, MUSC 300 are colocated (same instructor): they may share a room at the same or overlapping times without a conflict.");
    expect(describeRule({ ...rule, type: "colocateDifferent", items: [rule.items[0]!] })).toBe("MUSC 200 is colocated (different instructors): its sections may share a room at the same or overlapping times without a conflict.");
    expect(validateRule(s, { ...rule, items: [] }, rule.name).map((p) => p.field)).toEqual(["items"]);
    expect(validateRule(s, { ...rule, items: [{ course: "", section: "", instructor: "Kim" }] }, rule.name).length).toBeGreaterThan(0);
    expect(findRuleViolations(s).filter((v) => !v.builtin)).toEqual([]);
  });
  it("applies to sections of other schedules too when schedules are merged", () => {
    const a = importRecords({ sessions: [seminar("200"), seminar("300")], constraints: [allow("MUSC 200"), allow("MUSC 300")] }).schedule;
    const b = importRecords({ sessions: [seminar("200"), seminar("300")], constraints: [] }).schedule;
    const merged = mergeSchedules([{ id: "a", name: "A", schedule: a }, { id: "b", name: "B", schedule: b }]).schedule;
    expect(findConflicts(merged)).toEqual([]); // A's rule names the courses, so it covers B's sections of them as well
  });
});

describe("colocate (different instructors)", () => {
  const talk = (n: string, who: string, o: Rec = {}) => sec("MUSC", n, "A", "TR", "9:15", { Faculty: who, Classroom: "SB 1", ...o });
  const kinds = (sessions: Rec[], constraints: Rec[] = []) => findConflicts(build(sessions, constraints)).map((c) => c.type);
  const rule = (type: string, ...courses: string[]): Rec[] => courses.map((Course) => ({ Constraint: "Together", Type: type, Course }));

  it("lets sections with different instructors share a room; with a shared instructor it does not apply, and both conflicts remain", () => {
    const sessions = [talk("200", "Kim"), talk("300", "Lee")];
    expect(kinds(sessions)).toEqual(["Room"]);
    expect(kinds(sessions, rule("colocateDifferent", "MUSC 200", "MUSC 300"))).toEqual([]);
    const sameWho = [talk("200", "Kim"), talk("300", "Kim")];
    expect(kinds(sameWho, rule("colocateDifferent", "MUSC 200", "MUSC 300"))).toEqual(["Instructor", "Room"]);
  });
  it("(same instructor) is for one instructor teaching the classes together: with different instructors it does not apply", () => {
    const sameWho = [talk("200", "Kim"), talk("300", "Kim")];
    expect(kinds(sameWho)).toEqual(["Instructor", "Room"]);
    expect(kinds(sameWho, rule("colocate", "MUSC 200", "MUSC 300"))).toEqual([]);
    const different = [talk("200", "Kim"), talk("300", "Lee")];
    expect(kinds(different, rule("colocate", "MUSC 200", "MUSC 300"))).toEqual(["Room"]);
  });
  it("a team-taught section that shares one instructor counts as sharing", () => {
    const team = [talk("200", "Kim; Lee"), talk("300", "Kim")];
    expect(kinds(team, rule("colocate", "MUSC 200", "MUSC 300"))).toEqual([]);
    expect(kinds(team, rule("colocateDifferent", "MUSC 200", "MUSC 300"))).toEqual(["Instructor", "Room"]);
  });
  it("is read from a file under either name, and the old name means same instructor", () => {
    const types = (t: string) => importRecords({ sessions: [talk("200", "Kim")], constraints: [{ Constraint: "C", Type: t, Course: "MUSC 200" }] }).schedule.constraints[0]!.type;
    expect(types("Colocate (same instructor)")).toBe("colocate");
    expect(types("Colocate (different instructors)")).toBe("colocateDifferent");
    expect(types("allow collisions")).toBe("colocate");
    expect(types("collide")).toBe("colocate");
  });
});

