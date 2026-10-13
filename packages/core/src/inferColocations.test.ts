import { describe, expect, it } from "vitest";
import { importRecords, importSessions } from "./import.js";
import { findConflicts } from "./conflicts.js";

// Rows as the registrar's report gives them (with its Cross Listed Sections and Colocated columns).
const row = (course: string, section: string, o: Record<string, string> = {}) => {
  const [prefix, number] = course.split(" ");
  return { AcademicYear: "2025", Term: "FA", Prefix: prefix!, CourseNumber: number!, Section: section, Faculty: "Ada Lovelace", MeetingDays: "MWF", StartTime: "9:00 AM", MeetingDuration: "50", Classroom: "SB 101", "Cross Listed Sections": "", Colocated: "", ...o };
};

describe("Cross Listed Sections column", () => {
  it("adds the listings and does not keep the column", () => {
    const r = importSessions([row("BHAV 355", "A", { "Cross Listed Sections": "AMUS 355-A, DIGI 210-B" })]);
    expect(r.crossListings.map((l) => `${l.prefix} ${l.courseNumber}`)).toEqual(["AMUS 355", "DIGI 210"]);
    expect(r.sessions[0]!.extra).not.toHaveProperty("Cross Listed Sections");
    expect(r.sessions[0]!.extra).not.toHaveProperty("Colocated");
    expect(r.issues).toEqual([]);
  });
  it("warns about entries it cannot read and about a listed section with its own row", () => {
    const r = importSessions([
      row("BHAV 355", "A", { "Cross Listed Sections": "AMUS 355-A; see the dean" }),
      row("AMUS 355", "A", { Classroom: "SB 102", StartTime: "1:00 PM" }),
    ]);
    expect(r.crossListings.map((l) => `${l.prefix} ${l.courseNumber}`)).toEqual(["AMUS 355"]);
    expect(r.issues.map((i) => i.message).join("\n")).toMatch(/see the dean/);
    expect(r.issues.map((i) => i.message).join("\n")).toMatch(/AMUS 355 A is listed as a cross-listing of BHAV 355 A and also has a row of its own/);
  });
});

describe("infer colocations", () => {
  const sessions = [
    row("AMUS 182", "A", { Colocated: "Yes" }),
    row("AMUS 182", "B", { Colocated: "Yes" }),
    row("AMUS 117", "A", { Colocated: "Yes", Faculty: "Ben Franklin", Classroom: "SB 200" }),
    row("AMUS 217", "A", { Colocated: "Yes", Faculty: "Cy Young", Classroom: "SB 200" }),
    row("AMUS 300", "A", { Colocated: "Yes", Classroom: "SB 300", StartTime: "2:00 PM" }), // colocated with another department's course
    row("DIGI 100", "A", { Faculty: "Di Prince", Classroom: "SB 400" }),
    row("DIGI 101", "A", { Faculty: "Ed Sheeran", Classroom: "SB 400" }), // a real room conflict: not marked Colocated
  ];

  it("is off unless asked for", () => {
    expect(importRecords({ sessions }).schedule.constraints).toEqual([]);
  });

  it("makes rules for the marked sections that meet together, and warns about marked sections that meet with none", () => {
    const r = importRecords({ sessions, inferColocations: true });
    const rules = [...new Set(r.schedule.constraints.map((c) => `${c.type}: ${c.constraint}`))];
    expect(rules).toEqual(["colocate: Colocated: AMUS 182 (FA)", "colocateDifferent: Colocated: AMUS 117; AMUS 217 (FA)"]);
    expect(r.issues.filter((i) => i.severity === "warning").map((i) => i.message)).toEqual([expect.stringMatching(/^AMUS 300 A \(FA\) is marked Colocated, but no other section/)]);
    expect(r.issues.some((i) => i.severity === "info" && /made 2 colocate rules/.test(i.message))).toBe(true);
    // Only the DIGI room conflict is left.
    expect(findConflicts(r.schedule).map((c) => `${c.type} ${c.sectionIdA} ${c.sectionIdB}`)).toEqual([expect.stringMatching(/^Room .*DIGI100-A .*DIGI101-A$/)]);
  });

  it("without a Colocated column, joins the sections that share a room", () => {
    const plain = sessions.map(({ Colocated: _c, "Cross Listed Sections": _x, ...rest }) => rest);
    const r = importRecords({ sessions: plain, inferColocations: true });
    expect([...new Set(r.schedule.constraints.map((c) => c.constraint))]).toEqual([
      "Colocated: AMUS 182 (FA)", "Colocated: AMUS 117; AMUS 217 (FA)", "Colocated: DIGI 100; DIGI 101 (FA)",
    ]);
    expect(r.issues.filter((i) => i.severity === "warning")).toEqual([]);
  });

  it("names a course without letters when each of its sections is colocated with another of its sections", () => {
    const r = importRecords({
      sessions: [
        row("AMUS 131", "A", { Colocated: "Yes" }),
        row("AMUS 131", "B", { Colocated: "Yes" }),
        row("AMUS 131", "C", { Colocated: "Yes", Classroom: "SB 300", StartTime: "1:00 PM" }),
        row("AMUS 131", "D", { Colocated: "Yes", Classroom: "SB 300", StartTime: "1:00 PM" }),
        row("AMUS 231", "A", { Colocated: "Yes", Classroom: "SB 300", StartTime: "1:00 PM" }),
        row("AMUS 131", "A", { Term: "SP", Colocated: "Yes" }), // another term: its own course count
        row("AMUS 131", "B", { Term: "SP", Colocated: "Yes" }),
      ],
      inferColocations: true,
    });
    const rules = [...new Set(r.schedule.constraints.map((c) => c.constraint))];
    // Every section of AMUS 131 meets with another of its sections, so they make one rule; AMUS 231 meets with only some of them.
    expect(rules).toEqual(["Colocated: AMUS 131 (FA)", "Colocated: AMUS 131 (SP)", "Colocated: AMUS 131 C, D; AMUS 231 (FA)"]);
    expect(r.schedule.constraints.filter((c) => c.constraint === "Colocated: AMUS 131 (SP)").map((c) => [c.course, c.section])).toEqual([["AMUS 131", ""]]);
    expect(findConflicts(r.schedule)).toEqual([]);
  });

  it("puts two courses in one rule without letters when every section of each meets with a section of the other", () => {
    const r = importRecords({
      sessions: [
        row("AMUS 258", "A", { Colocated: "Yes" }),
        row("AMUS 308", "B", { Colocated: "Yes" }),
        row("AMUS 258", "B", { Colocated: "Yes", Classroom: "SB 300", StartTime: "1:00 PM" }),
        row("AMUS 308", "A", { Colocated: "Yes", Classroom: "SB 300", StartTime: "1:00 PM" }),
        row("AMUS 358", "A", { Colocated: "Yes", Classroom: "SB 300", StartTime: "1:00 PM" }), // with only one of the pairs
        row("AMUS 358", "B", { Classroom: "SB 500", StartTime: "3:00 PM" }),
      ],
      inferColocations: true,
    });
    expect([...new Set(r.schedule.constraints.map((c) => c.constraint))]).toEqual(["Colocated: AMUS 258; AMUS 308 (FA)", "Colocated: AMUS 258 B; AMUS 308 A; AMUS 358 A (FA)"]);
    expect(r.schedule.constraints.filter((c) => c.constraint === "Colocated: AMUS 258; AMUS 308 (FA)").map((c) => [c.course, c.section])).toEqual([["AMUS 258", ""], ["AMUS 308", ""]]);
    expect(findConflicts(r.schedule)).toEqual([]);
  });
});
