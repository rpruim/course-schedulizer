import { describe, expect, it } from "vitest";
import { recordsFromCsv } from "./csv.js";
import { importRecords } from "./import.js";
import { colocatedPairs, findConflicts } from "./conflicts.js";
import { gradLevelOf, REGISTRAR_COLUMNS, registrarTable } from "./registrar.js";
import { fixtureText } from "./testutil.js";

const schedule = () => {
  const r = importRecords({
    sessions: recordsFromCsv(fixtureText("cases/registrar-sessions.csv")),
    crossListings: recordsFromCsv(fixtureText("cases/registrar-crosslistings.csv")),
    nonTeaching: recordsFromCsv(fixtureText("cases/registrar-nonteaching.csv")),
  });
  expect(r.issues).toEqual([]);
  return r.schedule;
};

describe("registrar tab", () => {
  it("has the old app's 17 columns in order, then CrossListings next to Comment and the CoreTag", () => {
    expect(REGISTRAR_COLUMNS).toEqual([
      "Term", "Prefix", "CourseNumber", "Section", "StudentCredits", "FacultyLoad", "MeetingDays", "MeetingTime",
      "BuildingAndRoom", "TermPart", "TermAndPart", "Duration", "ShortTitle", "Faculty", "InstructionalMethod",
      "DeliveryMode", "Comment", "CrossListings", "CoreTag", "SpecialTopic", "Level", "Colocations",
    ]);
    expect(registrarTable(schedule()).header).toEqual([...REGISTRAR_COLUMNS]);
  });

  it("matches expected/registrar-schedule.csv", () => {
    const t = registrarTable(schedule());
    const expected = recordsFromCsv(fixtureText("expected/registrar-schedule.csv"));
    expect(t.rows.map((r) => Object.fromEntries(t.header.map((h, i) => [h, r[i]])))).toEqual(expected);
  });

  it("can leave non-teaching rows out for a teaching-only export", () => {
    const all = registrarTable(schedule());
    const teaching = registrarTable(schedule(), { includeNonTeaching: false });
    expect(all.rows.length - teaching.rows.length).toBe(3);
    expect(teaching.rows.every((r) => r[teaching.header.indexOf("Prefix")] !== "")).toBe(true);
    expect(teaching.rows).toEqual(all.rows.slice(3));
  });

  it("lists rows by prefix, then number, then section letter", () => {
    const t = registrarTable(schedule());
    const col = (n: string) => t.header.indexOf(n);
    const keys = t.rows.filter((r) => r[col("Prefix")] !== "").map((r) => `${r[col("Prefix")]} ${r[col("CourseNumber")]} ${r[col("Section")]}`);
    expect(keys).toEqual(["DIGI 304 A", "DIGI 388 A", "HELP 349 J", "MUSC 104 A", "MUSC 105 A", "MUSC 153 A", "MUSC 163 A", "URBS 204 A"]);
  });

  it("orders numbers and letters naturally, then by term", () => {
    const sec = (prefix: string, n: string, letter: string, term: string) => ({ AcademicYear: "Y", Term: term, Prefix: prefix, CourseNumber: n, Section: letter });
    const r = importRecords({ sessions: [sec("MUSC", "113", "B", "FA"), sec("MUSC", "99", "A", "FA"), sec("MUSC", "113", "A", "SP"), sec("MUSC", "113", "A", "FA"), sec("MUSC", "113", "10", "FA"), sec("MUSC", "113", "9", "FA"), sec("CRUD", "111", "A", "FA")] });
    expect(r.issues).toEqual([]);
    const t = registrarTable(r.schedule);
    const col = (n: string) => t.header.indexOf(n);
    expect(t.rows.map((x) => `${x[col("Prefix")]} ${x[col("CourseNumber")]} ${x[col("Section")]} ${x[col("Term")]}`)).toEqual([
      "CRUD 111 A FA", "MUSC 99 A FA", "MUSC 113 9 FA", "MUSC 113 10 FA", "MUSC 113 A FA", "MUSC 113 A SP", "MUSC 113 B FA",
    ]);
  });

  it("shows only the primary listing in Prefix and CourseNumber, other listings in CrossListings", () => {
    const t = registrarTable(schedule());
    const col = (n: string) => t.header.indexOf(n);
    expect(t.header.indexOf("CrossListings")).toBe(t.header.indexOf("Comment") + 1);
    const mixed = t.rows.find((r) => r[col("CourseNumber")] === "304")!;
    expect([mixed[col("Prefix")], mixed[col("CourseNumber")], mixed[col("CrossListings")]]).toEqual(["DIGI", "304", "URBS 308, MUSC 310"]);
    expect(t.rows.find((r) => r[col("CourseNumber")] === "104")![col("CrossListings")]).toBe("");
  });

  it("puts every meeting in the compact cells, aligned (the old app kept only the first meeting's time)", () => {
    const t = registrarTable(schedule());
    const col = (n: string) => t.header.indexOf(n);
    const two = t.rows.find((r) => r[col("CourseNumber")] === "105")!;
    for (const c of ["MeetingDays", "MeetingTime", "BuildingAndRoom", "Duration"]) expect(two[col(c)]!.split("\n")).toHaveLength(2);
  });
});

describe("Level column", () => {
  it("is GRAD from 500 up and UGRAD below, ignoring a letter after the number, and blank without a number", () => {
    expect(["100", "101", "499", "499A", " 182C"].map(gradLevelOf)).toEqual(["UGRAD", "UGRAD", "UGRAD", "UGRAD", "UGRAD"]);
    expect(["500", "501", "699", "5000", "590L"].map(gradLevelOf)).toEqual(["GRAD", "GRAD", "GRAD", "GRAD", "GRAD"]);
    expect(["", "?", "ABC"].map(gradLevelOf)).toEqual(["", "", ""]);
  });
  it("is the last column of the registrar tab, worked out from each section's course number", () => {
    const sessions = [{ AcademicYear: "AY1", Term: "FA", Prefix: "MUSC", CourseNumber: "499", Section: "A" }, { AcademicYear: "AY1", Term: "FA", Prefix: "MUSC", CourseNumber: "500", Section: "A" }];
    const t = registrarTable(importRecords({ sessions }).schedule);
    expect(t.header[t.header.length - 2]).toBe("Level");
    const at = t.header.indexOf("Level");
    expect(t.rows.map((r) => r[at])).toEqual(["UGRAD", "GRAD"]);
  });
});

describe("Colocations column", () => {
  const sec = (n: string, o: Record<string, string> = {}) => ({ AcademicYear: "AY1", Term: "FA", Prefix: "MUSC", CourseNumber: n, Section: "A", Faculty: "Kim", MeetingDays: "MWF", StartTime: "09:15", MeetingDuration: "65", Classroom: "NH 1", ...o });
  const rule = (type: string, ...courses: string[]) => courses.map((Course) => ({ Constraint: "Together", Type: type, Course }));
  const colocations = (sessions: Record<string, string>[], constraints: Record<string, string>[] = []) => {
    const t = registrarTable(importRecords({ sessions, constraints }).schedule);
    const at = t.header.indexOf("Colocations");
    return Object.fromEntries(t.rows.map((r) => [r[t.header.indexOf("CourseNumber")]!, r[at]]));
  };

  it("lists, on each section, the others that really meet with it under a colocate rule", () => {
    const sessions = [sec("143"), sec("243"), sec("343")];
    expect(colocations(sessions, rule("colocate", "MUSC 143", "MUSC 243", "MUSC 343"))).toEqual({ "143": "MUSC 243 A, MUSC 343 A", "243": "MUSC 143 A, MUSC 343 A", "343": "MUSC 143 A, MUSC 243 A" });
  });
  it("does not list a colocation that is allowed but does not happen, nor sections the rule does not name", () => {
    const sessions = [sec("143"), sec("243"), sec("343", { StartTime: "13:30" }), sec("443", { Faculty: "Lee" })];
    // 343 is allowed but meets at another time; 443 shares the room and time but is not named, so it is a conflict, not a colocation
    expect(colocations(sessions, rule("colocate", "MUSC 143", "MUSC 243", "MUSC 343"))).toEqual({ "143": "MUSC 243 A", "243": "MUSC 143 A", "343": "", "443": "" });
    expect(colocations(sessions)).toEqual({ "143": "", "243": "", "343": "", "443": "" });
  });
  it("(different instructors) lists only pairs whose instructors differ; a pair with a shared instructor is not colocated and stays a conflict", () => {
    const sessions = [sec("143", { Faculty: "Kim" }), sec("243", { Faculty: "Lee" }), sec("343", { Faculty: "Kim" })];
    const s = importRecords({ sessions, constraints: rule("colocateDifferent", "MUSC 143", "MUSC 243", "MUSC 343") }).schedule;
    expect(colocatedPairs(s)).toEqual([["AY1-FA-MUSC143-A", "AY1-FA-MUSC243-A"], ["AY1-FA-MUSC243-A", "AY1-FA-MUSC343-A"]]);
    expect(findConflicts(s).map((c) => [c.type, c.sectionIdA, c.sectionIdB])).toEqual([["Instructor", "AY1-FA-MUSC143-A", "AY1-FA-MUSC343-A"], ["Room", "AY1-FA-MUSC143-A", "AY1-FA-MUSC343-A"]]);
    expect(colocations(sessions, rule("colocateDifferent", "MUSC 143", "MUSC 243", "MUSC 343"))).toEqual({ "143": "MUSC 243 A", "243": "MUSC 143 A, MUSC 343 A", "343": "MUSC 243 A" });
  });
});
