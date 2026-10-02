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
  it("has exactly the old app's 17 columns, in order", () => {
    expect(REGISTRAR_COLUMNS).toEqual([
      "Term", "Prefix", "CourseNumber", "Section", "StudentCredits", "FacultyLoad", "MeetingDays", "MeetingTime",
      "BuildingAndRoom", "TermPart", "TermAndPart", "Duration", "ShortTitle", "Faculty", "InstructionalMethod",
      "DeliveryMode", "Comment",
    ]);
    expect(registrarTable(schedule()).header).toEqual([...REGISTRAR_COLUMNS]);
  });

  it("matches expected/registrar-schedule.csv", () => {
    const t = registrarTable(schedule());
    const expected = recordsFromCsv(fixtureText("expected/registrar-schedule.csv"));
    expect(t.rows.map((r) => Object.fromEntries(t.header.map((h, i) => [h, r[i]])))).toEqual(expected);
  });

  it("puts every meeting in the compact cells, aligned (the old app kept only the first meeting's time)", () => {
    const t = registrarTable(schedule());
    const col = (n: string) => t.header.indexOf(n);
    const two = t.rows.find((r) => r[col("CourseNumber")] === "102")!;
    for (const c of ["MeetingDays", "MeetingTime", "BuildingAndRoom", "Duration"]) expect(two[col(c)]!.split("\n")).toHaveLength(2);
  });
});
