import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { CORE_TAGS, normalizeCoreTag } from "./coreTag.js";
import { importRecords, importSessions } from "./import.js";
import { REGISTRAR_COLUMNS } from "./registrar.js";
import { readWorkbook, writeWorkbook } from "./xlsx.js";

describe("normalizeCoreTag", () => {
  it("lists the three tags", () => {
    expect([...CORE_TAGS]).toEqual(["Diversity and Difference", "Environmental Sustainability", "Global Regions and Cultures"]);
  });
  it("knows a tag in any capitalization, spacing or punctuation, or by its distinctive words", () => {
    for (const t of ["Diversity and Difference", "diversity & difference", "DIVERSITY AND DIFFERENCE", "Diversity", "Difference"]) expect(normalizeCoreTag(t), t).toBe("Diversity and Difference");
    for (const t of ["Environmental Sustainability", "environmental  sustainability", "Sustainability", "Environment"]) expect(normalizeCoreTag(t), t).toBe("Environmental Sustainability");
    for (const t of ["Global Regions and Cultures", "global regions/cultures", "Global", "Regions & Cultures"]) expect(normalizeCoreTag(t), t).toBe("Global Regions and Cultures");
  });
  it("says blank for blank and for none, and undefined for anything else or for more than one", () => {
    for (const t of ["", "  ", "none", "None", "N/A"]) expect(normalizeCoreTag(t), t).toBe("");
    expect(normalizeCoreTag("Writing")).toBeUndefined();
    expect(normalizeCoreTag("Diversity and Global")).toBeUndefined();
  });
});

describe("CoreTag in files", () => {
  const rec = (CoreTag: string) => ({ AcademicYear: "AY1", Term: "FA", Prefix: "MUSC", CourseNumber: "104", Section: "A", CoreTag });
  it("may be missing altogether: a file without the column reads with no issues and no tags", () => {
    const { CoreTag: _gone, ...without } = rec("");
    const r = importSessions([without]);
    expect(r.issues).toEqual([]);
    expect(r.sessions[0]!.coreTag).toBe("");
  });
  it("is read the registrar's way, and an unknown one is kept with a warning", () => {
    expect(importSessions([rec("global regions")]).sessions[0]!.coreTag).toBe("Global Regions and Cultures");
    expect(importSessions([rec("")]).sessions[0]!.coreTag).toBe("");
    const odd = importSessions([rec("Writing")]);
    expect(odd.sessions[0]!.coreTag).toBe("Writing");
    expect(odd.issues.map((i) => [i.severity, i.message])).toEqual([["warning", expect.stringContaining('CoreTag: "Writing" is not Diversity and Difference')]]);
  });
  it("is written on the Sessions sheet and, after CrossListings, on the registrar sheet, and read back", async () => {
    const s = importRecords({ sessions: [rec("sustainability"), { ...rec(""), CourseNumber: "105" }] }).schedule;
    expect(REGISTRAR_COLUMNS.slice(-4)).toEqual(["CrossListings", "CoreTag", "SpecialTopic", "Level"]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await writeWorkbook(s)) as unknown as ArrayBuffer);
    const column = (sheet: string) => {
      const ws = wb.getWorksheet(sheet)!;
      const at = (ws.getRow(1).values as unknown[]).indexOf("CoreTag");
      return [at > 0, ...Array.from({ length: ws.rowCount - 1 }, (_, i) => String(ws.getRow(i + 2).getCell(at).value ?? ""))];
    };
    expect(column("Sessions")).toEqual([true, "Environmental Sustainability", ""]);
    expect(column("Registrar Schedule")).toEqual([true, "Environmental Sustainability", ""]);
    const back = await readWorkbook(await writeWorkbook(s));
    expect(back.issues).toEqual([]);
    expect(back.schedule.sessions.map((x) => x.coreTag)).toEqual(["Environmental Sustainability", ""]);
  });
});

describe("SpecialTopic", () => {
  const rec = (SpecialTopic?: string, over: Record<string, string> = {}) => ({ AcademicYear: "AY1", Term: "FA", Prefix: "MUSC", CourseNumber: "104", Section: "A", ...(SpecialTopic === undefined ? {} : { SpecialTopic }), ...over });
  it("is off when the column is missing, blank or a no, and on for any other mark", () => {
    for (const t of [undefined, "", " ", "no", "FALSE", "0"]) expect(importSessions([rec(t)]).sessions[0]!.specialTopic, String(t)).toBe(false);
    for (const t of ["Special Topic", "special topic", "yes", "x", "TRUE", "1"]) expect(importSessions([rec(t)]).sessions[0]!.specialTopic, t).toBe(true);
    expect(importSessions([rec("Special Topic")]).issues).toEqual([]);
  });
  it("is written as Special Topic, or nothing, on the registrar sheet and the Sessions sheet, and read back", async () => {
    const s = importRecords({ sessions: [rec("Special Topic"), rec(undefined, { CourseNumber: "105" })] }).schedule;
    expect(REGISTRAR_COLUMNS[REGISTRAR_COLUMNS.length - 2]).toBe("SpecialTopic");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await writeWorkbook(s)) as unknown as ArrayBuffer);
    const column = (sheet: string) => {
      const ws = wb.getWorksheet(sheet)!;
      const at = (ws.getRow(1).values as unknown[]).indexOf("SpecialTopic");
      return [at > 0, ...Array.from({ length: ws.rowCount - 1 }, (_, i) => String(ws.getRow(i + 2).getCell(at).value ?? ""))];
    };
    expect(column("Sessions")).toEqual([true, "Special Topic", ""]);
    expect(column("Registrar Schedule")).toEqual([true, "Special Topic", ""]);
    const back = await readWorkbook(await writeWorkbook(s));
    expect(back.issues).toEqual([]);
    expect(back.schedule.sessions.map((x) => x.specialTopic)).toEqual([true, false]);
  });
});
