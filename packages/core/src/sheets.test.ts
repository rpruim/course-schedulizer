import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { writeSheets } from "./xlsx.js";

const read = async (bytes: Uint8Array) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  return wb;
};

describe("writeSheets", () => {
  it("writes each table as a sheet with a bold header, numbers as numbers and blanks as empty cells", async () => {
    const wb = await read(await writeSheets([
      { name: "Comparison", header: ["Course", "Load\nPlan A", "Load\nPlan B"], rows: [["MATH 101", 4, 6], ["STAT 200", 4, null], ["DATA 100", undefined, "n/a"]] },
      { name: "About", header: ["Setting", "Value"], rows: [["Compared", "Plan A\nPlan B"]] },
    ]));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Comparison", "About"]);
    const ws = wb.getWorksheet("Comparison")!;
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.getRow(1).getCell(2).value).toBe("Load\nPlan A");
    expect(ws.getRow(2).values).toEqual([undefined, "MATH 101", 4, 6]);
    expect(ws.getRow(3).getCell(3).value).toBeNull();
    expect(typeof ws.getRow(2).getCell(2).value).toBe("number");
    expect(ws.getRow(4).getCell(2).value).toBeNull();
    expect(ws.getRow(4).getCell(3).value).toBe("n/a");
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  });
  it("fills the rows that ask for it", async () => {
    const wb = await read(await writeSheets([{ name: "S", header: ["a", "b"], rows: [["x", 1], ["y", 2]], rowFills: [undefined, "FFE0B0".slice(0, 6)] }]));
    const ws = wb.getWorksheet("S")!;
    expect(ws.getRow(2).getCell(1).fill).toBeUndefined();
    expect(ws.getRow(3).getCell(1).fill).toMatchObject({ type: "pattern", fgColor: { argb: "FFFFE0B0" } });
    expect(ws.getRow(3).getCell(2).fill).toMatchObject({ fgColor: { argb: "FFFFE0B0" } });
  });
  it("can turn on filters, and trims names and cells to Excel's limits", async () => {
    const wb = await read(await writeSheets([{ name: "x".repeat(40), header: ["a"], rows: [["y".repeat(40000)]], filter: true }]));
    expect(wb.worksheets[0]!.name).toHaveLength(31);
    expect(String(wb.worksheets[0]!.getRow(2).getCell(1).value)).toHaveLength(32767);
    expect(wb.worksheets[0]!.autoFilter).toBeTruthy();
  });
  it("makes an empty workbook sheet for a table with no rows", async () => {
    const wb = await read(await writeSheets([{ name: "Empty", header: ["a", "b"], rows: [] }]));
    expect(wb.getWorksheet("Empty")!.rowCount).toBe(1);
  });
});
