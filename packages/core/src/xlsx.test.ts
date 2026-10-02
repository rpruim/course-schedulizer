import { describe, expect, it } from "vitest";
import { recordsFromCsv } from "./csv.js";
import { importRecords } from "./import.js";
import { sessionsTable } from "./export.js";
import { readWorkbook, writeWorkbook } from "./xlsx.js";
import { defaultSettings } from "./types.js";
import ExcelJS from "exceljs";
import { REGISTRAR_COLUMNS } from "./registrar.js";
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

describe("the old app's own export (fixtures/legacy/old-app-export.xlsx)", () => {
  it("imports its first tab, given the missing academic year", async () => {
    const r = await readWorkbook(fixtureBytes("legacy/old-app-export.xlsx"), { academicYear: "AY25" });
    // 21 rows: 15 sections (16 meetings: MATH 391 meets twice) and 6 non-teaching rows. One of those has
    // no Term (Dee Placeholder, "Data Science Director", row 5 of the sheet), so 5 are read and it is reported.
    expect(r.schedule.sessions).toHaveLength(16);
    expect(new Set(r.schedule.sessions.map((s) => s.sectionId)).size).toBe(15);
    expect(r.schedule.nonTeaching).toHaveLength(5);
    expect(r.issues).toEqual([{ severity: "error", sheet: "Sessions", row: 5, message: "a non-teaching row needs a Term (Dee Placeholder: Data Science Director)" }]);
    const colloquium = r.schedule.sessions.filter((s) => s.sectionId === "AY25-SP-MATH391-A");
    expect(colloquium.map((s) => [s.days, s.start, s.duration, s.room, s.deliveryMode])).toEqual([
      ["R", 905, 50, "NH 276", "In-Person"],
      ["R", 905, 50, "NH 276", "In-Person"],
    ]);
  });
  it("reports a blank academic year on every row when none is supplied", async () => {
    const r = await readWorkbook(fixtureBytes("legacy/old-app-export.xlsx"));
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThan(15); // one per row
  });
});

describe("workbook layout", () => {
  const sample = () =>
    importRecords({
      sessions: recordsFromCsv(fixtureText("cases/registrar-sessions.csv")),
      crossListings: recordsFromCsv(fixtureText("cases/registrar-crosslistings.csv")),
      nonTeaching: recordsFromCsv(fixtureText("cases/registrar-nonteaching.csv")),
      meta: { name: "Test", notes: "n", version: "2" },
    }).schedule;

  it("opens with the registrar tab, then our sheets, then Metadata", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await writeWorkbook(sample(), { now: new Date(2026, 9, 1, 17, 14, 20) })) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Registrar Schedule", "Sessions", "CrossListings", "NonTeaching", "Constraints", "Settings", "Metadata"]);
    const reg = wb.getWorksheet("Registrar Schedule")!;
    expect((reg.getRow(1).values as string[]).slice(1)).toEqual([...REGISTRAR_COLUMNS]);
    // text for load and credits (as the old app wrote them), a number only for a single Duration
    expect(typeof reg.getRow(5).getCell(6).value).toBe("string");
    expect(reg.getRow(8).getCell(12).value).toBe(65); // MATH 101: one meeting, so a number
    expect(reg.getRow(9).getCell(12).value).toBe("65\n50"); // MATH 102: two meetings
    // a compact cell with a trailing empty value must stay text ("65\n"), not collapse to the number 65
    expect(reg.getRow(10).getCell(12).value).toBe("65\n"); // MATH 150
    const meta = wb.getWorksheet("Metadata")!;
    expect(meta.getSheetValues().slice(1).map((r) => (r as string[]).slice(1))).toEqual([
      ["Label", "Value"], ["Export Date", "2026-10-01"], ["Export Time", "17:14:20"], ["Academic Year", "R1"], ["Name", "Test"], ["Version", "2"], ["Notes", "n"],
    ]);
  });

  it("a teaching-only export carries no non-teaching load anywhere, and still imports", async () => {
    const s = sample();
    const bytes = await writeWorkbook(s, { includeNonTeaching: false });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).not.toContain("NonTeaching");
    const text = JSON.stringify(wb.worksheets.map((w) => w.getSheetValues()));
    expect(text).not.toMatch(/Chair release|Sabbatical/);
    const back = await readWorkbook(bytes);
    expect(back.issues).toEqual([]);
    expect(back.schedule.nonTeaching).toEqual([]);
    expect(back.schedule.sessions).toEqual(s.sessions);
  });

  it("round-trips mixed scheduled and unscheduled meetings in the compact form", async () => {
    const s = sample();
    const back = await readWorkbook(await writeWorkbook(s, { packed: true }));
    expect(back.issues).toEqual([]);
    const mixed = back.schedule.sessions.filter((x) => x.courseNumber === "150");
    expect(mixed.map((m) => [m.days, m.start, m.room])).toEqual([["MWF", 480, "NH 105"], ["", undefined, "Online"]]);
    expect(back.schedule.sessions).toEqual(s.sessions);
  });

  it("round-trips through the file with the registrar tab present", async () => {
    const s = sample();
    const back = await readWorkbook(await writeWorkbook(s));
    expect(back.issues).toEqual([]);
    expect(back.schedule).toEqual(s);
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
