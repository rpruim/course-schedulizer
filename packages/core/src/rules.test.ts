import { describe, expect, it } from "vitest";
import { conflictedSessions } from "./conflicts.js";
import { recordsFromCsv } from "./csv.js";
import { importConstraints, importRecords } from "./import.js";
import { deleteRule, describeRule, emptyRule, findRuleViolations, rulesOf, ruleSubject, saveRule, validateRule, type Rule } from "./rules.js";
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
const msgs = (s: ReturnType<typeof build>) => findRuleViolations(s).map((v) => v.message);

describe("legacy cohort constraints (fixtures T17, T18)", () => {
  const s = importRecords({
    sessions: recordsFromCsv(fixtureText("cases/conflicts.csv")),
    constraints: recordsFromCsv(fixtureText("cases/constraints.csv")),
  }).schedule;
  it("breaks the rule when the courses cannot all be taken", () => {
    const v = findRuleViolations(s);
    expect(v.map((x) => [x.rule, x.academicYear])).toEqual([["Math major year 2", "T17"], ["Cohort 2", "T18"]]);
    expect(v[0]!.message).toBe("Only 2 of the 3 courses can be taken together (needs all 3): MATH 231 A × STAT 243 A");
    expect(v[1]!.message).toContain("MATH 270 A × STAT 280 A"); // names one section, so MATH 270 B is not involved
    expect(v[1]!.sectionIds).toHaveLength(2);
  });
  it("highlights the meetings involved", () => {
    expect(conflictedSessions([], findRuleViolations(s)).size).toBe(4);
  });
});

describe("take together: some n / any n", () => {
  const three = [sec("MATH", "1", "A", "MWF", "9:00"), sec("MATH", "2", "A", "MWF", "9:00"), sec("MATH", "3", "A", "TR", "9:00")];
  const rule = (extra: Rec = {}) => ["MATH 1", "MATH 2", "MATH 3"].map((c) => ({ Constraint: "R", Course: c, ...extra }));
  it("needs every course by default", () => {
    expect(msgs(build(three, rule()))).toEqual(["Only 2 of the 3 courses can be taken together (needs all 3): MATH 1 A × MATH 2 A"]);
  });
  it("'some 2' needs one workable pair; 'any 2' needs every pair to work", () => {
    expect(msgs(build(three, rule({ Count: "2", Choose: "some" })))).toEqual([]);
    expect(msgs(build(three, rule({ Count: "2", Choose: "any" })))).toEqual(["Not every 2 of the 3 courses can be taken together: MATH 1 + MATH 2"]);
  });
  it("'any' with all courses (or no number) is the same as 'some'", () => {
    expect(msgs(build(three, rule({ Choose: "any" })))).toEqual(msgs(build(three, rule())));
    expect(msgs(build(three, rule({ Count: "3", Choose: "any" })))).toEqual(msgs(build(three, rule())));
  });
  it("'any 2' of a pattern checks each pair, and lets a second section save a pair", () => {
    const s = build(
      [sec("MATH", "301", "A", "MWF", "9:00"), sec("MATH", "302", "A", "MWF", "9:00"), sec("MATH", "302", "B", "MWF", "11:00"), sec("MATH", "303", "A", "TR", "9:00"), sec("MATH", "304", "A", "MWF", "9:20")],
      [{ Constraint: "300s", Course: "MATH 3*", Count: "2", Choose: "any" }],
    );
    // 301 vs 304 overlap (the only sections), so that pair fails; 301 + 302 works through 302 B
    expect(msgs(s)).toEqual(["Not every 2 of the 4 courses can be taken together: MATH 301 + MATH 304"]);
    expect(findRuleViolations(s)[0]!.sectionIds.sort()).toEqual(["Y-FA-MATH301-A", "Y-FA-MATH304-A"]);
  });
  it("is satisfied when enough can be taken", () => {
    expect(msgs(build(three, rule({ Count: "2" })))).toEqual([]);
  });
  it("two clashing courses are a violation for n = 2", () => {
    expect(msgs(build(three.slice(0, 2), rule({ Count: "2" }).slice(0, 2)))).toEqual(["Only 1 of the 2 courses can be taken together (needs all 2): MATH 1 A × MATH 2 A"]);
  });
  it("lets a student pick another section when a course has several", () => {
    const s = build([sec("MATH", "1", "A", "MWF", "9:00"), sec("MATH", "1", "B", "MWF", "11:00"), sec("MATH", "2", "A", "MWF", "9:00")], [{ Constraint: "R", Course: "MATH 1" }, { Constraint: "R", Course: "MATH 2" }]);
    expect(msgs(s)).toEqual([]);
  });
  it("is broken when every section of one course overlaps every section of another", () => {
    const s = build([sec("MATH", "1", "A", "MWF", "9:00"), sec("MATH", "1", "B", "MWF", "9:20"), sec("MATH", "2", "A", "MWF", "9:00")], [{ Constraint: "R", Course: "MATH 1" }, { Constraint: "R", Course: "MATH 2" }]);
    expect(msgs(s)).toHaveLength(1);
  });
  it("expands a pattern into each matching course", () => {
    const s = build([sec("MATH", "301", "A", "MWF", "9:00"), sec("MATH", "302", "A", "MWF", "9:00"), sec("MATH", "303", "A", "TR", "9:00"), sec("MATH", "201", "A", "MWF", "9:00")], [{ Constraint: "300s", Course: "MATH 3*" }]);
    expect(msgs(s)).toEqual(["Only 2 of the 3 courses can be taken together (needs all 3): MATH 301 A × MATH 302 A"]);
  });
  it("back-to-back is fine, and so are meetings in different weeks of the term", () => {
    const s = build(
      [sec("MATH", "1", "A", "MWF", "9:00"), sec("MATH", "2", "A", "MWF", "9:50"), sec("MATH", "4", "A", "MWF", "9:00", { TermPart: "First" }), sec("MATH", "5", "A", "MWF", "9:00", { TermPart: "Second" })],
      [{ Constraint: "R1", Course: "MATH 1" }, { Constraint: "R1", Course: "MATH 2" }, { Constraint: "R2", Course: "MATH 4" }, { Constraint: "R2", Course: "MATH 5" }],
    );
    expect(msgs(s)).toEqual([]);
  });
  it("skips a term where fewer than two of the courses are offered", () => {
    const s = build([sec("MATH", "1", "A", "MWF", "9:00"), sec("MATH", "2", "A", "MWF", "9:00", { Term: "SP" })], [{ Constraint: "R", Course: "MATH 1" }, { Constraint: "R", Course: "MATH 2" }]);
    expect(msgs(s)).toEqual([]);
  });
  it("can be limited to one term", () => {
    const sessions = [sec("MATH", "1", "A", "MWF", "9:00"), sec("MATH", "2", "A", "MWF", "9:00"), sec("MATH", "1", "A", "MWF", "9:00", { Term: "SP" }), sec("MATH", "2", "A", "MWF", "9:00", { Term: "SP" })];
    const s = build(sessions, ["MATH 1", "MATH 2"].map((c) => ({ Constraint: "R", Course: c, Term: "SP" })));
    expect(findRuleViolations(s).map((v) => v.term)).toEqual(["SP"]);
  });
  it("sees a course by any of its listings", () => {
    const r = importRecords({
      sessions: [sec("DATA", "385", "A", "MW", "9:00"), sec("MATH", "250", "A", "MW", "9:00")],
      crossListings: [{ SectionId: "Y-FA-DATA385-A", Prefix: "STAT", CourseNumber: "385" }],
      constraints: [{ Constraint: "R", Course: "stat  385" }, { Constraint: "R", Course: "MATH 250" }],
    });
    expect(findRuleViolations(r.schedule)).toHaveLength(1);
  });
});

describe("window rules", () => {
  const rule = (o: Rec, course = "MATH *") => [{ Constraint: "W", Course: course, Type: "window", ...o }];
  it("flags a section that meets in a window it should not (overlap, back-to-back allowed)", () => {
    const s = build(
      [sec("MATH", "1", "A", "MWF", "10:20"), sec("MATH", "2", "A", "TR", "10:20"), sec("MATH", "3", "A", "MWF", "9:00"), sec("MATH", "4", "A", "MWF", "10:50")],
      rule({ From: "10:00", To: "10:50", Days: "MWF" }),
    );
    expect(msgs(s)).toEqual(["MATH 1 A meets during 10:00–10:50 on M W F"]);
  });
  it("any of the days vs all of the days", () => {
    const sessions = [sec("MATH", "1", "A", "M", "10:00", { SectionId: "a" }), sec("MATH", "2", "A", "MWF", "10:00")];
    expect(msgs(build(sessions, rule({ From: "10:00", To: "10:50", Days: "MWF", DayRule: "any" })))).toHaveLength(2);
    expect(msgs(build(sessions, rule({ From: "10:00", To: "10:50", Days: "MWF", DayRule: "all" })))).toEqual(["MATH 2 A meets during 10:00–10:50 on M W F"]);
  });
  it("without days, looks at Monday to Friday", () => {
    expect(msgs(build([sec("MATH", "1", "A", "R", "10:00")], rule({ From: "10:00", To: "10:50" })))).toHaveLength(1);
  });
  it("a should rule uses 'entirely within' by default", () => {
    const s = build([sec("MATH", "1", "A", "MWF", "16:30"), sec("MATH", "2", "A", "MWF", "13:00")], rule({ From: "08:00", To: "17:00", Should: "should", Days: "MWF" }));
    expect(msgs(s)).toEqual(["MATH 1 A does not meet within 08:00–17:00 on any of M W F"]);
  });
  it("can ask for overlap instead", () => {
    const s = build([sec("MATH", "1", "A", "MWF", "16:30")], rule({ From: "08:00", To: "17:00", Should: "should", Days: "MWF", Meets: "overlaps" }));
    expect(msgs(s)).toEqual([]);
  });
  it("with 'at least', that many sections must satisfy it (an evening section)", () => {
    const evening = rule({ From: "17:00", To: "22:00", Should: "should", Count: "1" }, "CORE 100");
    const day = [sec("CORE", "100", "A", "MWF", "9:00"), sec("CORE", "100", "B", "TR", "13:00")];
    expect(msgs(build(day, evening))).toEqual(["Only 0 of 2 sections meet within 17:00–22:00 on any of M T W R F (needs 1)"]);
    expect(msgs(build([...day, sec("CORE", "100", "C", "T", "18:00")], evening))).toEqual([]);
  });
  it("is about instructors too", () => {
    const s = build([sec("MATH", "1", "A", "MWF", "8:00", { Faculty: "Kim" }), sec("MATH", "2", "A", "MWF", "8:00", { Faculty: "Lee" })], [{ Constraint: "Kim not early", Type: "window", Instructor: "kim", From: "00:00", To: "09:00" }]);
    expect(msgs(s)).toEqual(["MATH 1 A meets during 00:00–09:00 on M W F"]);
  });
  it("ignores sections with no scheduled time", () => {
    expect(msgs(build([{ AcademicYear: "Y", Term: "FA", Prefix: "MATH", CourseNumber: "1", Section: "A" }], rule({ From: "10:00", To: "11:00", Should: "should" })))).toEqual([]);
  });
  it("highlights the section's meetings", () => {
    const s = build([sec("MATH", "1", "A", "MWF", "10:00")], rule({ From: "10:00", To: "10:50" }));
    expect(conflictedSessions([], findRuleViolations(s)).size).toBe(1);
  });
});

describe("importing constraint rows", () => {
  it("reads rule settings from any row of a rule, and the first-version columns still work", () => {
    const { constraints, issues } = importConstraints([
      { Constraint: "W", Course: "MATH 3*", Type: "window", From: "10:00", To: "10:50", Days: "mwf", DayRule: "all", Should: "should not", Meets: "within" },
      { Constraint: "W", Course: "STAT 3*" },
      { Constraint: "Old", Course: "MATH 1" },
    ]);
    expect(issues).toEqual([]);
    expect(constraints.map((c) => [c.type, c.from, c.to, c.days, c.dayRule, c.should, c.meets])).toEqual([
      ["window", 600, 650, "MWF", "all", "should not", "within"],
      ["window", 600, 650, "MWF", "all", "should not", "within"],
      ["takeable", undefined, undefined, "", "any", "should not", ""],
    ]);
  });
  it("still reads the first version's AtLeast column as Count", () => {
    const { constraints, issues } = importConstraints([{ Constraint: "R", Course: "MATH 1", AtLeast: "2" }, { Constraint: "R", Course: "MATH 2" }]);
    expect(issues).toEqual([]);
    expect(constraints.map((c) => [c.count, c.choose])).toEqual([[2, "some"], [2, "some"]]);
    expect(importConstraints([{ Constraint: "R", Course: "A", Count: "2", Choose: "every" }]).issues[0]!.message).toMatch(/Choose/);
  });
  it("infers a window rule from its times, and reports missing or contradictory settings", () => {
    expect(importConstraints([{ Constraint: "W", Course: "MATH 1", From: "9:00", To: "10:00" }]).constraints[0]!.type).toBe("window");
    expect(importConstraints([{ Constraint: "W", Course: "MATH 1", Type: "window", From: "9:00" }]).issues[0]!.message).toMatch(/needs both From and To/);
    expect(importConstraints([{ Constraint: "W", Course: "MATH 1", Type: "window", From: "10:00", To: "9:00" }]).issues[0]!.message).toMatch(/From must be earlier than To/);
    expect(importConstraints([{ Constraint: "R", Course: "A", Count: "2" }, { Constraint: "R", Course: "B", Count: "3" }]).issues[0]!.message).toMatch(/Count "3" differs/);
    expect(importConstraints([{ Constraint: "R", Course: "A", DayRule: "sometimes" }]).issues[0]!.message).toMatch(/DayRule/);
    expect(importConstraints([{ Constraint: "W", Course: "A", From: "noon", To: "13:00" }]).issues[0]!.message).toMatch(/not a time/);
  });
  it("survives an Excel round trip", async () => {
    const s = build([sec("MATH", "1", "A", "MWF", "9:00")], [
      { Constraint: "W", Course: "MATH 3*", Type: "window", From: "10:00", To: "10:50", Days: "MWF", DayRule: "all", Should: "should", Meets: "overlaps", Count: "1", Term: "FA", Comment: "why" },
      { Constraint: "A", Course: "MATH 1", Count: "2", Choose: "any" },
      { Constraint: "A", Course: "MATH 2" },
      { Constraint: "W", Instructor: "Kim" },
      { Constraint: "T", Course: "MATH 1" },
      { Constraint: "T", Course: "MATH 2", Section: "B" },
    ]);
    const back = await readWorkbook(await writeWorkbook(s));
    expect(back.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(back.schedule.constraints).toEqual(s.constraints);
  });
});

describe("editing rules", () => {
  const s = build([sec("MATH", "1", "A", "MWF", "9:00")], [{ Constraint: "A", Course: "MATH 1" }, { Constraint: "A", Course: "MATH 2" }, { Constraint: "B", Course: "MATH 3" }]);
  it("gathers rows into rules", () => {
    expect(rulesOf(s).map((r) => [r.name, r.type, r.items.map((i) => i.course)])).toEqual([["A", "takeable", ["MATH 1", "MATH 2"]], ["B", "takeable", ["MATH 3"]]]);
  });
  it("saves a rule over the one it replaces, keeping its place, or adds a new one", () => {
    const r = { ...rulesOf(s)[0]!, name: "A2", count: 1 };
    const t = saveRule(s, "A", r);
    expect(rulesOf(t).map((x) => x.name)).toEqual(["A2", "B"]);
    expect(rulesOf(t)[0]!.count).toBe(1);
    const u = saveRule(t, undefined, { ...emptyRule("window"), name: "N", items: [{ course: "MATH 5", section: "", instructor: "" }] });
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
    const mixed = { ...base, items: [{ course: "MATH 1", section: "", instructor: "" }, { course: "", section: "", instructor: "Kim" }] };
    expect(ruleSubject(mixed)).toBe("courses");
    expect(validateRule(build([]), mixed).map((p) => p.field)).toEqual(["items.1"]);
    expect(validateRule(build([]), people)).toEqual([]);
  });
  it("validates", () => {
    const base: Rule = { ...emptyRule("takeable"), name: "X", items: [{ course: "MATH 1", section: "", instructor: "" }, { course: "MATH 2", section: "", instructor: "" }] };
    expect(validateRule(s, base)).toEqual([]);
    expect(validateRule(s, { ...base, name: "" }).map((p) => p.field)).toEqual(["name"]);
    expect(validateRule(s, { ...base, name: "b" }).map((p) => p.field)).toEqual(["name"]);
    expect(validateRule(s, { ...base, name: "b" }, "B")).toEqual([]); // renaming to itself is fine
    expect(validateRule(s, { ...base, items: [base.items[0]!] }).map((p) => p.field)).toEqual(["items"]);
    expect(validateRule(s, { ...base, count: 5 }).map((p) => p.field)).toEqual(["count"]);
    const w = { ...emptyRule("window"), name: "W", items: [{ course: "MATH 1", section: "", instructor: "" }] };
    expect(validateRule(s, w)).toEqual([]);
    expect(validateRule(s, { ...w, from: 700, to: 600 }).map((p) => p.field)).toEqual(["to"]);
    expect(validateRule(s, { ...w, items: [{ course: "", section: "", instructor: "" }] }).map((p) => p.field)).toEqual(["items.0"]);
  });
  it("describes a rule in a sentence", () => {
    const item = (course: string, section = "") => ({ course, section, instructor: "" });
    expect(describeRule({ ...emptyRule("takeable"), name: "x", items: [item("MATH 231"), item("STAT 243", "B")], count: 2 })).toBe("A student must be able to take some 2 of MATH 231, STAT 243 B.");
    expect(describeRule({ ...emptyRule("takeable"), name: "x", items: [item("MATH 3*")], count: 2, choose: "any" })).toBe("A student must be able to take any 2 of MATH 3*.");
    expect(describeRule({ ...emptyRule("takeable"), name: "x", items: [item("MATH 3*")] })).toBe("A student must be able to take all of MATH 3*.");
    expect(describeRule({ ...emptyRule("window"), name: "x", items: [item("MATH 231")], from: 600, to: 650, days: "MWF" })).toBe("Every section of MATH 231 should not meet during 10:00–10:50 on any of M W F.");
    expect(describeRule({ ...emptyRule("window"), name: "x", items: [item("CORE 100")], from: 1020, to: 1320, should: "should", count: 1, term: "FA" })).toBe("At least 1 of the sections of CORE 100 should meet within 17:00–22:00 on any of M T W R F in FA.");
  });
});
