import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { combinationsFromRows, enrollmentSeats } from "./combinations.js";
import { importRecords } from "./import.js";
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

describe("seats suggested from enrollments", () => {
  const sec = (course: string, letter: string, o: Record<string, string> = {}) => {
    const [Prefix, CourseNumber] = course.split(" ");
    return { AcademicYear: "AY25", Term: "FA", Prefix: Prefix!, CourseNumber: CourseNumber!, Section: letter, ...o };
  };
  it("takes the largest enrollment of any section, the larger of Enrollment and Day 10, and leaves out courses without any", () => {
    const { schedule } = importRecords({
      sessions: [
        sec("CHEM 101", "A", { Enrollment: "24", EnrollmentDay10: "22" }),
        sec("CHEM 101", "B", { Enrollment: "18", EnrollmentDay10: "27" }),
        sec("MATH 161", "A", { Enrollment: "31" }),
        sec("ENGR 101", "A"),
        sec("DIGI 306", "A", { EnrollmentDay10: "12" }),
      ],
      crossListings: [{ SectionId: "AY25-FA-DIGI306-A", Prefix: "BHAV", CourseNumber: "306" }],
    });
    const seats = enrollmentSeats([schedule], ["CHEM 101", "MATH 161", "ENGR 101", "BHAV 306", "MATH 271"]);
    expect([...seats]).toEqual([["CHEM 101", 27], ["MATH 161", 31], ["BHAV 306", 12]]);
  });
});
