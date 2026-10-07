import { describe, expect, it } from "vitest";
import { importRecords } from "./import.js";
import { registrarTable } from "./registrar.js";
import { sessionsTable } from "./export.js";
import { upgradeSchedule } from "./upgrade.js";
import { readWorkbook, writeWorkbook } from "./xlsx.js";
import { yearFromData, yearToData } from "./academicYear.js";

describe("academic year codes", () => {
  it("reads AY25 and other spellings as 25-26", () => {
    for (const t of ["AY25", "ay25", "AY2025", "25-26", "2025-26", "2025-2026", " 25–26 "]) expect(yearFromData(t), t).toBe("25-26");
    expect(yearFromData("AY99")).toBe("99-00");
    expect(yearFromData("")).toBe("");
  });
  it("leaves text that is not a year alone, and a range that is not one year long", () => {
    for (const t of ["Y", "R2", "AY1", "25-27", "next year"]) expect(yearFromData(t)).toBe(t);
  });
  it("writes 25-26 as AY25 and leaves the rest", () => {
    expect(yearToData("25-26")).toBe("AY25");
    expect(yearToData("99-00")).toBe("AY99");
    for (const t of ["AY25", "Y", "25-27", ""]) expect(yearToData(t)).toBe(t);
  });
});

const rec = (o: Record<string, string> = {}) => ({ AcademicYear: "AY25", Term: "FA", TermPart: "Full", Prefix: "MUSC", CourseNumber: "104", Section: "A", Faculty: "Ada Example", MeetingDays: "MWF", StartTime: "9:15", MeetingDuration: "65", Classroom: "R1", ...o });

describe("the data's codes in the app", () => {
  it("shows AY25 as 25-26, keeps the section id the data would give, and writes AY25 back", async () => {
    const { schedule, issues } = importRecords({ sessions: [rec()], nonTeaching: [{ AcademicYear: "AY25", Faculty: "Ada Example", Activity: "Chair", Term: "AY", Load: "3" }] });
    expect(issues).toEqual([]);
    expect(schedule.sessions[0]).toMatchObject({ academicYear: "25-26", sectionId: "AY25-FA-MUSC104-A" });
    expect(schedule.nonTeaching[0]!.academicYear).toBe("25-26");
    const t = sessionsTable(schedule);
    expect(t.rows[0]![t.header.indexOf("AcademicYear")]).toBe("AY25");
    const back = await readWorkbook(await writeWorkbook(schedule));
    expect(back.schedule.sessions[0]!.academicYear).toBe("25-26");
    expect(back.schedule.nonTeaching[0]!.academicYear).toBe("25-26");
    expect(back.schedule.sessions[0]!.sectionId).toBe("AY25-FA-MUSC104-A");
  });
  it("reads the default year a person types the way the app shows it", () => {
    const r = importRecords({ sessions: [rec({ AcademicYear: "" })], academicYear: "25-26" });
    expect(r.schedule.sessions[0]!.academicYear).toBe("25-26");
    expect(r.schedule.sessions[0]!.sectionId).toBe("AY25-FA-MUSC104-A");
  });
  it("upgrades a saved workspace that still has AY25", () => {
    const { schedule } = importRecords({ sessions: [rec()] });
    const old = { ...schedule, sessions: schedule.sessions.map((s) => ({ ...s, academicYear: "AY25" })) };
    expect(upgradeSchedule(old).sessions[0]!.academicYear).toBe("25-26");
  });
});

describe("the winter interim: Spring part 0 in the data, WI in the app", () => {
  it("reads SP with part 0 as WI, and writes WI as SP part 0, in the file and the registrar tab", async () => {
    const { schedule, issues } = importRecords({ sessions: [rec({ Term: "SP", TermPart: "0", MeetingDays: "MTWRF", StartTime: "9:00", MeetingDuration: "150" }), rec({ Section: "B", Term: "SP", TermPart: "Full" })] });
    expect(issues).toEqual([]);
    expect(schedule.sessions.map((s) => [s.term, s.termPart])).toEqual([["WI", "Full"], ["SP", "Full"]]);
    const t = sessionsTable(schedule);
    const cell = (row: number, name: string) => t.rows[row]![t.header.indexOf(name)];
    expect([cell(0, "Term"), cell(0, "TermPart"), cell(1, "Term"), cell(1, "TermPart")]).toEqual(["SP", "0", "SP", "Full"]);
    const reg = registrarTable(schedule);
    const r = (row: number, name: string) => reg.rows[row]![reg.header.indexOf(name)];
    const wi = reg.rows.findIndex((x) => x[reg.header.indexOf("Section")] === "A");
    expect([r(wi, "Term"), r(wi, "TermPart"), r(wi, "TermAndPart")]).toEqual(["SP", "0", "SP-0"]);
    const back = await readWorkbook(await writeWorkbook(schedule));
    expect(back.issues).toEqual([]);
    expect(back.schedule.sessions.map((s) => [s.term, s.termPart])).toEqual([["WI", "Full"], ["SP", "Full"]]);
  });
  it("still reads WI itself", () => {
    expect(importRecords({ sessions: [rec({ Term: "WI" })] }).schedule.sessions[0]!.term).toBe("WI");
  });
});
