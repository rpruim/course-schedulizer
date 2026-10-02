import ExcelJS from "exceljs";
import { constraintsTable, crossListingsTable, nonTeachingTable, sessionsTable, type ExportOptions, type Table } from "./export.js";
import { importRecords, importSettings, type ImportResult } from "./import.js";
import { emptyMeta, type Issue, type Rec } from "./types.js";

const pad = (n: number) => String(n).padStart(2, "0");

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) {
    // Time-only cells come back as 1899/1900-dated values.
    if (v.getUTCFullYear() < 1901) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
  }
  return String(v);
}

function sheetRecords(ws: ExcelJS.Worksheet | undefined): Rec[] {
  if (!ws) return [];
  const header: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (c, col) => {
    header[col] = cellText(c.value).trim();
  });
  const out: Rec[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const rec: Rec = {};
    let any = false;
    header.forEach((h, col) => {
      if (!h) return;
      const t = cellText(row.getCell(col).value);
      if (t.trim() !== "") any = true;
      rec[h] = t;
    });
    if (any) out.push(rec);
  });
  return out;
}

const sheetByName = (wb: ExcelJS.Workbook, name: string) =>
  wb.worksheets.find((w) => w.name.trim().toLowerCase() === name.toLowerCase());

/**
 * Read a workbook: the new multi-sheet form, or the legacy single-sheet packed
 * form (first sheet when there is no `Sessions` sheet).
 */
export async function readWorkbook(data: ArrayBuffer | Uint8Array): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((data instanceof Uint8Array ? data : new Uint8Array(data)) as unknown as ArrayBuffer);
  const issues: Issue[] = [];
  const { settings, issues: settingsIssues } = importSettings(sheetRecords(sheetByName(wb, "Settings")));
  issues.push(...settingsIssues);
  const meta = emptyMeta();
  for (const r of sheetRecords(sheetByName(wb, "Meta"))) {
    const k = (r.Key ?? "").toLowerCase();
    if (k === "name" || k === "notes" || k === "version") meta[k] = r.Value ?? "";
  }
  const result = importRecords({
    sessions: sheetRecords(sheetByName(wb, "Sessions") ?? wb.worksheets[0]),
    crossListings: sheetRecords(sheetByName(wb, "CrossListings")),
    nonTeaching: sheetRecords(sheetByName(wb, "NonTeaching")),
    constraints: sheetRecords(sheetByName(wb, "Constraints")),
    settings,
    meta,
  });
  result.issues.unshift(...issues);
  return result;
}

const NUMERIC = new Set(["FacultyLoad", "MinimumCredits", "MaximumCredits", "MeetingDuration", "Enrollment", "EnrollmentDay10", "Load", "StartWeek", "EndWeek"]);

function addTable(wb: ExcelJS.Workbook, name: string, t: Table) {
  const ws = wb.addWorksheet(name);
  ws.addRow(t.header).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of t.rows) {
    const r = ws.addRow(row.map((v, i) => (NUMERIC.has(t.header[i]!) && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : v)));
    r.eachCell((c) => {
      if (typeof c.value === "string" && c.value.includes("\n")) c.alignment = { wrapText: true, vertical: "top" };
    });
  }
  t.header.forEach((h, i) => {
    ws.getColumn(i + 1).width = Math.min(40, Math.max(h.length + 2, ...t.rows.map((r) => Math.max(...(r[i] ?? "").split("\n").map((l) => l.length)) + 2)));
  });
}

/** Write a schedule as an .xlsx workbook. */
export async function writeWorkbook(schedule: import("./types.js").Schedule, opts: ExportOptions = {}): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  addTable(wb, "Sessions", sessionsTable(schedule, opts));
  addTable(wb, "CrossListings", crossListingsTable(schedule, opts));
  addTable(wb, "NonTeaching", nonTeachingTable(schedule));
  addTable(wb, "Constraints", constraintsTable(schedule));
  addTable(wb, "Settings", {
    header: ["Kind", "Code", "Name", "Term", "StartWeek", "EndWeek"],
    rows: [
      ...schedule.settings.spreadTerms.map((c) => ["SpreadTerm", c, "", "", "", ""]),
      ...schedule.settings.nonRooms.map((c) => ["NonRoom", c, "", "", "", ""]),
      ...schedule.settings.terms.map((t) => ["Term", t.code, t.name, "", "", ""]),
      ...schedule.settings.parts.map((p) => ["Part", p.code, p.name, p.term ?? "", String(p.startWeek), String(p.endWeek)]),
    ],
  });
  addTable(wb, "Meta", {
    header: ["Key", "Value"],
    rows: [["name", schedule.meta.name], ["notes", schedule.meta.notes], ["version", schedule.meta.version]],
  });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
