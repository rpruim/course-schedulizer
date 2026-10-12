import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { combinationsFromRows } from "./combinations.js";
import { readCombinations } from "./xlsx.js";

/** A workbook laid out like the Course Registration Combinations report: a merged title, the header, then the combinations. */
async function report(rows: [string, number | string][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Course Registration Combination");
  ws.addRow(["Course Registration Combinations"]);
  ws.mergeCells("A1:C1");
  ws.addRow(["Combinations", "Students"]);
  for (const r of rows) ws.addRow(r);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("Course Registration Combinations report", () => {
  it("reads each combination as a group of students, a single course being the students who take it alone", async () => {
    const r = await readCombinations(await report([["CHEM 101, ENGR 101, MATH 161", 66], ["CHEM 101, ENGR 101", 37], ["MATH 271", 80]]));
    expect(r.problems).toEqual([]);
    expect(r.groups).toEqual([
      { students: 66, courses: ["CHEM 101", "ENGR 101", "MATH 161"] },
      { students: 37, courses: ["CHEM 101", "ENGR 101"] },
      { students: 80, courses: ["MATH 271"] },
    ]);
  });
  it("tidies course names, adds up rows naming the same courses, and reports rows it cannot read", () => {
    const r = combinationsFromRows([["Title"], ["Combinations", "Students"], ["chem  101,ENGR 101", "5"], ["ENGR 101, CHEM 101", "3"], ["", ""], ["MATH 161", "lots"], ["", "4"]]);
    expect(r.groups).toEqual([{ students: 8, courses: ["CHEM 101", "ENGR 101"] }]);
    expect(r.problems).toEqual(["row 6: “lots” is not a number of students", "row 7: no courses are named"]);
  });
  it("says so when the file is not such a report", () => {
    expect(combinationsFromRows([["Prefix", "CourseNumber"], ["MATH", "161"]]).problems[0]).toContain("no Combinations and Students columns");
  });
});
