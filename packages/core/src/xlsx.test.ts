import { describe, expect, it } from "vitest";
import { recordsFromCsv } from "./csv.js";
import { importRecords } from "./import.js";
import { sessionsTable } from "./export.js";
import { readWorkbook, writeWorkbook } from "./xlsx.js";
import { defaultSettings } from "./types.js";
import { fixtureBytes, fixtureText } from "./testutil.js";

const fromCsv = () => importRecords({ sessions: recordsFromCsv(fixtureText("sessions.csv")) });

describe("acceptance: old app's one-tab workbook → fixtures/sessions.csv", () => {
  it("imports to exactly the canonical sessions", async () => {
    const legacy = await readWorkbook(fixtureBytes("legacy/old-app-sections.xlsx"));
    expect(legacy.issues).toEqual([]);
    const canon = fromCsv();
    expect(canon.issues).toEqual([]);
    expect(legacy.schedule.sessions).toHaveLength(34);
    expect(new Set(legacy.schedule.sessions.map((s) => s.sectionId)).size).toBe(31);
    expect(legacy.schedule.sessions).toEqual(canon.schedule.sessions);
    expect(legacy.schedule.crossListings).toEqual([]);
  });

  it("re-exports (multi-row) to the same cells as sessions.csv", async () => {
    const t = sessionsTable(fromCsv().schedule);
    const expected = recordsFromCsv(fixtureText("sessions.csv"));
    expect(t.header).toEqual(Object.keys(expected[0]!));
    expect(t.rows.map((r) => Object.fromEntries(t.header.map((h, i) => [h, r[i]])))).toEqual(expected);
  });
});

describe("workbook round trips", () => {
  const full = () =>
    importRecords({
      sessions: [
        ...recordsFromCsv(fixtureText("cases/crosslist-sessions.csv")),
        ...recordsFromCsv(fixtureText("cases/load-sessions.csv")).map((r) => ({ ...r, AcademicYear: "L1" })),
      ],
      crossListings: recordsFromCsv(fixtureText("cases/crosslistings.csv")),
      nonTeaching: recordsFromCsv(fixtureText("cases/load-nonteaching.csv")),
      constraints: recordsFromCsv(fixtureText("cases/constraints.csv")),
      settings: {
        ...defaultSettings(),
        terms: [{ code: "FA", name: "Fall" }, { code: "WI", name: "Winter Intensive" }, { code: "SP", name: "Spring" }, { code: "SU", name: "Summer" }, { code: "J", name: "January" }],
        parts: [...defaultSettings().parts, { term: "J", code: "Full", name: "January", startWeek: 1, endWeek: 4 }, { term: "J", code: "W1", name: "Week 1-2", startWeek: 1, endWeek: 2 }],
      },
      meta: { name: "Test", notes: "line1\nline2", version: "3" },
    });

  it("multi-row", async () => {
    const a = full();
    expect(a.issues).toEqual([]);
    const b = await readWorkbook(await writeWorkbook(a.schedule));
    expect(b.issues).toEqual([]);
    expect(b.schedule).toEqual(a.schedule);
  });

  it("packed", async () => {
    const a = full();
    const b = await readWorkbook(await writeWorkbook(a.schedule, { packed: true }));
    expect(b.issues).toEqual([]);
    expect(b.schedule.sessions).toEqual(a.schedule.sessions);
    expect(new Set(b.schedule.crossListings.map((l) => JSON.stringify(l)))).toEqual(new Set(a.schedule.crossListings.map((l) => JSON.stringify(l))));
    expect(b.schedule.nonTeaching).toEqual(a.schedule.nonTeaching);
  });

  it("the old-app sample data survives packed and multi-row round trips", async () => {
    const a = fromCsv();
    for (const packed of [false, true]) {
      const b = await readWorkbook(await writeWorkbook(a.schedule, { packed }));
      expect(b.issues).toEqual([]);
      expect(b.schedule.sessions).toEqual(a.schedule.sessions);
    }
  });
});
