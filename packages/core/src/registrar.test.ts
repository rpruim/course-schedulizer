import { describe, expect, it } from "vitest";
import { recordsFromCsv } from "./csv.js";
import { importRecords } from "./import.js";
import { REGISTRAR_COLUMNS, registrarTable } from "./registrar.js";
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
  it("has the old app's 17 columns in order, then CrossListings next to Comment", () => {
    expect(REGISTRAR_COLUMNS).toEqual([
      "Term", "Prefix", "CourseNumber", "Section", "StudentCredits", "FacultyLoad", "MeetingDays", "MeetingTime",
      "BuildingAndRoom", "TermPart", "TermAndPart", "Duration", "ShortTitle", "Faculty", "InstructionalMethod",
      "DeliveryMode", "Comment", "CrossListings",
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
    expect(keys).toEqual(["DATA 301 A", "DATA 385 A", "EDUC 346 J", "MATH 101 A", "MATH 102 A", "MATH 150 A", "MATH 160 A", "STAT 201 A"]);
  });

  it("orders numbers and letters naturally, then by term", () => {
    const sec = (prefix: string, n: string, letter: string, term: string) => ({ AcademicYear: "Y", Term: term, Prefix: prefix, CourseNumber: n, Section: letter });
    const r = importRecords({ sessions: [sec("MATH", "110", "B", "FA"), sec("MATH", "99", "A", "FA"), sec("MATH", "110", "A", "SP"), sec("MATH", "110", "A", "FA"), sec("MATH", "110", "10", "FA"), sec("MATH", "110", "9", "FA"), sec("CS", "108", "A", "FA")] });
    expect(r.issues).toEqual([]);
    const t = registrarTable(r.schedule);
    const col = (n: string) => t.header.indexOf(n);
    expect(t.rows.map((x) => `${x[col("Prefix")]} ${x[col("CourseNumber")]} ${x[col("Section")]} ${x[col("Term")]}`)).toEqual([
      "CS 108 A FA", "MATH 99 A FA", "MATH 110 9 FA", "MATH 110 10 FA", "MATH 110 A FA", "MATH 110 A SP", "MATH 110 B FA",
    ]);
  });

  it("shows only the primary listing in Prefix and CourseNumber, other listings in CrossListings", () => {
    const t = registrarTable(schedule());
    const col = (n: string) => t.header.indexOf(n);
    expect(t.header.indexOf("CrossListings")).toBe(t.header.indexOf("Comment") + 1);
    const mixed = t.rows.find((r) => r[col("CourseNumber")] === "301")!;
    expect([mixed[col("Prefix")], mixed[col("CourseNumber")], mixed[col("CrossListings")]]).toEqual(["DATA", "301", "STAT 305, MATH 307"]);
    expect(t.rows.find((r) => r[col("CourseNumber")] === "101")![col("CrossListings")]).toBe("");
  });

  it("puts every meeting in the compact cells, aligned (the old app kept only the first meeting's time)", () => {
    const t = registrarTable(schedule());
    const col = (n: string) => t.header.indexOf(n);
    const two = t.rows.find((r) => r[col("CourseNumber")] === "102")!;
    for (const c of ["MeetingDays", "MeetingTime", "BuildingAndRoom", "Duration"]) expect(two[col(c)]!.split("\n")).toHaveLength(2);
  });
});
