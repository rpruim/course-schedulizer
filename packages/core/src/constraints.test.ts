import { describe, expect, it } from "vitest";
import { constraintsNaming, constraintWarnings, courseMatches } from "./constraints.js";
import { changeLetter } from "./sections.js";
import { importConstraints, importRecords } from "./import.js";

const sec = (n: string, letter: string, o: Record<string, string> = {}) => ({
  AcademicYear: "Y", Term: "FA", Prefix: "MATH", CourseNumber: n, Section: letter, ...o,
});
const build = (constraints: Record<string, string>[]) => {
  const r = importRecords({
    sessions: [sec("231", "A"), sec("231", "B"), sec("250", "A"), { ...sec("385", "A", { Prefix: "DATA" }) }],
    crossListings: [{ SectionId: "Y-FA-DATA385-A", Prefix: "STAT", CourseNumber: "385" }],
    constraints,
  });
  expect(r.issues).toEqual([]);
  return r.schedule;
};

describe("importConstraints", () => {
  it("reads a course, a course with a Section column, and 'COURSE LETTER' in one cell", () => {
    const { constraints, issues } = importConstraints([
      { Constraint: "C", Course: "MATH  231" },
      { Constraint: "C", Course: "MATH 231", Section: "A" },
      { Constraint: "C", Course: "MATH 231 b" },
      { Constraint: "C", Course: "MATH 231 A", Section: "a" },
    ]);
    expect(issues).toEqual([]);
    expect(constraints.map((c) => [c.course, c.section])).toEqual([["MATH 231", ""], ["MATH 231", "A"], ["MATH 231", "b"], ["MATH 231", "a"]]);
  });
  it("rejects a Course cell and Section column that disagree", () => {
    expect(importConstraints([{ Constraint: "C", Course: "MATH 231 A", Section: "B" }]).issues[0]!.message).toMatch(/says section "A" but Section says "B"/);
  });
});

describe("constraintsNaming", () => {
  it("finds rows that name a section, by course (any listing) and letter", () => {
    const s = build([
      { Constraint: "All", Course: "MATH 231" },
      { Constraint: "One", Course: "MATH 231", Section: "A" },
      { Constraint: "Listing", Course: "STAT 385" },
    ]);
    expect(constraintsNaming(s, "Y-FA-MATH231-A").map((c) => c.constraint)).toEqual(["All", "One"]);
    expect(constraintsNaming(s, "Y-FA-MATH231-B").map((c) => c.constraint)).toEqual(["All"]);
    expect(constraintsNaming(s, "Y-FA-DATA385-A").map((c) => c.constraint)).toEqual(["Listing"]);
    expect(constraintsNaming(s, "nope")).toEqual([]);
  });
});

describe("constraintWarnings", () => {
  it("is quiet for a sound constraint", () => {
    expect(constraintWarnings(build([{ Constraint: "C", Course: "MATH 231", Section: "A" }, { Constraint: "C", Course: "MATH 250" }]))).toEqual([]);
  });
  it("flags rows that match nothing and rules that name fewer than two courses", () => {
    const w = constraintWarnings(build([
      { Constraint: "C", Course: "MATH 999" },
      { Constraint: "C", Course: "MATH 231", Section: "Z" },
      { Constraint: "Solo", Course: "MATH 250" },
    ]));
    expect(w.map((x) => [x.row, x.message])).toEqual([
      [2, '"C": no section matches MATH 999'],
      [3, '"C": no section matches MATH 231 section Z'],
      [undefined, '"C" names fewer than two courses that exist in the schedule, so it cannot conflict with anything'],
      [undefined, '"Solo" names fewer than two courses that exist in the schedule, so it cannot conflict with anything'],
    ]);
  });
  it("shows a stale constraint after a letter change", () => {
    const s = build([{ Constraint: "C", Course: "MATH 231", Section: "A" }, { Constraint: "C", Course: "MATH 250" }]);
    const r = changeLetter(s, "Y-FA-MATH231-A", "C");
    if (r.kind !== "changed") throw new Error(r.kind);
    expect(constraintWarnings(r.schedule)[0]!.message).toMatch(/no section matches MATH 231 section A/);
  });
});

describe("courseMatches", () => {
  const stat = (n: string) => courseMatches("STAT [23]4?", "STAT", n);
  it("matches a number with ? (one character) and [..] (one of those)", () => {
    for (const n of ["241", "243", "245", "341", "343", "344"]) expect(stat(n), n).toBe(true);
    for (const n of ["201", "285", "441", "24", "2415", "385"]) expect(stat(n), n).toBe(false);
    expect(courseMatches("MATH 3??", "MATH", "301")).toBe(true);
    expect(courseMatches("MATH 3??", "MATH", "3010")).toBe(false);
  });
  it("supports ranges and negation inside brackets", () => {
    expect(courseMatches("MATH [2-4]*", "MATH", "350")).toBe(true);
    expect(courseMatches("MATH [2-4]*", "MATH", "150")).toBe(false);
    expect(courseMatches("MATH [^1]*", "MATH", "150")).toBe(false);
    expect(courseMatches("MATH [!1]*", "MATH", "250")).toBe(true);
  });
  it("treats * as before, ignores case and spacing, and takes an unclosed [ literally", () => {
    expect(courseMatches("math  3*", "MATH", "301L")).toBe(true);
    expect(courseMatches("MATH", "MATH", "999")).toBe(true);
    expect(courseMatches("[A-C]ATH 1", "MATH", "1")).toBe(false);
    expect(courseMatches("M?TH 1", "MATH", "1")).toBe(true);
    expect(courseMatches("MATH 1[", "MATH", "1[")).toBe(true);
  });
});
