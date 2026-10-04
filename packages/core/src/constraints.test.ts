import { describe, expect, it } from "vitest";
import { constraintsNaming, constraintWarnings, courseMatches } from "./constraints.js";
import { changeLetter } from "./sections.js";
import { importConstraints, importRecords } from "./import.js";

const sec = (n: string, letter: string, o: Record<string, string> = {}) => ({
  AcademicYear: "Y", Term: "FA", Prefix: "MUSC", CourseNumber: n, Section: letter, ...o,
});
const build = (constraints: Record<string, string>[]) => {
  const r = importRecords({
    sessions: [sec("231", "A"), sec("231", "B"), sec("250", "A"), { ...sec("385", "A", { Prefix: "DIGI" }) }],
    crossListings: [{ SectionId: "Y-FA-DIGI385-A", Prefix: "URBS", CourseNumber: "385" }],
    constraints,
  });
  expect(r.issues).toEqual([]);
  return r.schedule;
};

describe("importConstraints", () => {
  it("reads a course, a course with a Section column, and 'COURSE LETTER' in one cell", () => {
    const { constraints, issues } = importConstraints([
      { Constraint: "C", Course: "MUSC  231" },
      { Constraint: "C", Course: "MUSC 231", Section: "A" },
      { Constraint: "C", Course: "MUSC 231 b" },
      { Constraint: "C", Course: "MUSC 231 A", Section: "a" },
    ]);
    expect(issues).toEqual([]);
    expect(constraints.map((c) => [c.course, c.section])).toEqual([["MUSC 231", ""], ["MUSC 231", "A"], ["MUSC 231", "b"], ["MUSC 231", "a"]]);
  });
  it("rejects a Course cell and Section column that disagree", () => {
    expect(importConstraints([{ Constraint: "C", Course: "MUSC 231 A", Section: "B" }]).issues[0]!.message).toMatch(/says section "A" but Section says "B"/);
  });
});

describe("constraintsNaming", () => {
  it("finds rows that name a section, by course (any listing) and letter", () => {
    const s = build([
      { Constraint: "All", Course: "MUSC 231" },
      { Constraint: "One", Course: "MUSC 231", Section: "A" },
      { Constraint: "Listing", Course: "URBS 385" },
    ]);
    expect(constraintsNaming(s, "Y-FA-MUSC231-A").map((c) => c.constraint)).toEqual(["All", "One"]);
    expect(constraintsNaming(s, "Y-FA-MUSC231-B").map((c) => c.constraint)).toEqual(["All"]);
    expect(constraintsNaming(s, "Y-FA-DIGI385-A").map((c) => c.constraint)).toEqual(["Listing"]);
    expect(constraintsNaming(s, "nope")).toEqual([]);
  });
});

describe("constraintWarnings", () => {
  it("is quiet for a sound constraint", () => {
    expect(constraintWarnings(build([{ Constraint: "C", Course: "MUSC 231", Section: "A" }, { Constraint: "C", Course: "MUSC 250" }]))).toEqual([]);
  });
  it("flags rows that match nothing and rules that name fewer than two courses", () => {
    const w = constraintWarnings(build([
      { Constraint: "C", Course: "MUSC 999" },
      { Constraint: "C", Course: "MUSC 231", Section: "Z" },
      { Constraint: "Solo", Course: "MUSC 250" },
    ]));
    expect(w.map((x) => [x.row, x.message])).toEqual([
      [2, '"C": no section matches MUSC 999'],
      [3, '"C": no section matches MUSC 231 section Z'],
      [undefined, '"C" names fewer than two courses that exist in the schedule, so it cannot conflict with anything'],
      [undefined, '"Solo" names fewer than two courses that exist in the schedule, so it cannot conflict with anything'],
    ]);
  });
  it("shows a stale constraint after a letter change", () => {
    const s = build([{ Constraint: "C", Course: "MUSC 231", Section: "A" }, { Constraint: "C", Course: "MUSC 250" }]);
    const r = changeLetter(s, "Y-FA-MUSC231-A", "C");
    if (r.kind !== "changed") throw new Error(r.kind);
    expect(constraintWarnings(r.schedule)[0]!.message).toMatch(/no section matches MUSC 231 section A/);
  });
});

describe("courseMatches", () => {
  const stat = (n: string) => courseMatches("URBS [23]4?", "URBS", n);
  it("matches a number with ? (one character) and [..] (one of those)", () => {
    for (const n of ["241", "243", "245", "341", "343", "344"]) expect(stat(n), n).toBe(true);
    for (const n of ["201", "285", "441", "24", "2415", "385"]) expect(stat(n), n).toBe(false);
    expect(courseMatches("MUSC 3??", "MUSC", "301")).toBe(true);
    expect(courseMatches("MUSC 3??", "MUSC", "3010")).toBe(false);
  });
  it("supports ranges and negation inside brackets", () => {
    expect(courseMatches("MUSC [2-4]*", "MUSC", "350")).toBe(true);
    expect(courseMatches("MUSC [2-4]*", "MUSC", "150")).toBe(false);
    expect(courseMatches("MUSC [^1]*", "MUSC", "150")).toBe(false);
    expect(courseMatches("MUSC [!1]*", "MUSC", "250")).toBe(true);
  });
  it("treats * as before, ignores case and spacing, and takes an unclosed [ literally", () => {
    expect(courseMatches("musc  3*", "MUSC", "301L")).toBe(true);
    expect(courseMatches("MUSC", "MUSC", "999")).toBe(true);
    expect(courseMatches("[A-C]USC 1", "MUSC", "1")).toBe(false);
    expect(courseMatches("M?SC 1", "MUSC", "1")).toBe(true);
    expect(courseMatches("MUSC 1[", "MUSC", "1[")).toBe(true);
  });
});
