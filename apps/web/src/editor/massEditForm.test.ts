import { describe, expect, it } from "vitest";
import { readEdits } from "./MassEditDialog";

const blank = { prefix: "", department: "", shortTitle: "", faculty: "", facultyLoad: "", minimumCredits: "", maximumCredits: "", instructionalMethod: "", courseLevel: "", group: "", deliveryMode: "", enrollment: "", enrollmentDay10: "", comment: "" };

describe("readEdits", () => {
  it("leaves out blank boxes and trims the rest", () => {
    expect(readEdits(blank)).toEqual({ edits: {}, errors: {} });
    expect(readEdits({ ...blank, prefix: " AMUS ", group: " Core " }).edits).toEqual({ prefix: "AMUS", group: "Core" });
  });
  it("reads numbers (zero counts) and flags bad ones", () => {
    expect(readEdits({ ...blank, enrollment: "0", facultyLoad: "3.5" }).edits).toEqual({ enrollment: 0, facultyLoad: 3.5 });
    expect(Object.keys(readEdits({ ...blank, enrollment: "many", facultyLoad: "-1" }).errors).sort()).toEqual(["enrollment", "facultyLoad"]);
  });
  it("reads instructors separated by semicolons, with shares", () => {
    expect(readEdits({ ...blank, faculty: "Pruim, Randall (3); Ada Example" }).edits.faculty).toEqual([{ name: "Pruim, Randall", load: 3 }, { name: "Ada Example" }]);
  });
});
