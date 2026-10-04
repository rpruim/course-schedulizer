import { describe, expect, it } from "vitest";
import { comparisonRows } from "./compare.js";
import { emptySchedule, inferredLevel, levelOf, type Session } from "./types.js";

describe("course level", () => {
  it("is implied by the first digit of the course number", () => {
    expect(inferredLevel("143")).toBe("100");
    expect(inferredLevel("231")).toBe("200");
    expect(inferredLevel("385")).toBe("300");
    expect(inferredLevel("A12")).toBe("100");
    expect(inferredLevel("")).toBe("");
    expect(inferredLevel("XYZ")).toBe("");
  });
  it("gives way to a level the section states", () => {
    expect(levelOf({ courseLevel: "", courseNumber: "231" })).toBe("200");
    expect(levelOf({ courseLevel: " ", courseNumber: "231" })).toBe("200");
    expect(levelOf({ courseLevel: "300", courseNumber: "231" })).toBe("300");
  });
  it("shows in the comparison rows", () => {
    const s = (over: Partial<Session>) => ({ sectionId: "x", department: "", academicYear: "AY25", term: "FA", termPart: "Full", prefix: "MUSC", courseNumber: "231", section: "A", shortTitle: "", faculty: [], days: "", comment: "", extra: {}, courseLevel: "", ...over }) as Session;
    const sched = { ...emptySchedule(), sessions: [s({ sectionId: "a" }), s({ sectionId: "b", courseLevel: "300" })] };
    expect(comparisonRows(sched).map((r) => r.CourseLevel)).toEqual(["200", "300"]);
  });
});
