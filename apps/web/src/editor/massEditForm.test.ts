import { describe, expect, it } from "vitest";
import { readEdits, readMeeting } from "./MassEditDialog";

const blank = { prefix: "", academicYear: "", term: "", termPart: "", department: "", shortTitle: "", faculty: "", facultyLoad: "", minimumCredits: "", maximumCredits: "", instructionalMethod: "", courseLevel: "", group: "", deliveryMode: "", coreTag: "", enrollment: "", enrollmentDay10: "", comment: "" };

describe("readEdits", () => {
  it("reads a core tag like the other text boxes", () => {
    expect(readEdits({ ...blank, coreTag: "Global Regions and Cultures" }).edits).toEqual({ coreTag: "Global Regions and Cultures" });
  });
  it("leaves out blank boxes and trims the rest", () => {
    expect(readEdits(blank)).toEqual({ edits: {}, errors: {} });
    expect(readEdits({ ...blank, prefix: " AMUS ", group: " Core " }).edits).toEqual({ prefix: "AMUS", group: "Core" });
  });
  it("reads numbers (zero counts) and flags bad ones", () => {
    expect(readEdits({ ...blank, enrollment: "0", facultyLoad: "3.5" }).edits).toEqual({ enrollment: 0, facultyLoad: 3.5 });
    expect(Object.keys(readEdits({ ...blank, enrollment: "many", facultyLoad: "-1" }).errors).sort()).toEqual(["enrollment", "facultyLoad"]);
  });
  it("reads instructors separated by semicolons or commas, with shares; a semicolon lets a name contain a comma", () => {
    expect(readEdits({ ...blank, faculty: "Pruim, Randall (3); Ada Example" }).edits.faculty).toEqual([{ name: "Pruim, Randall", load: 3 }, { name: "Ada Example" }]);
    expect(readEdits({ ...blank, faculty: "Ada Example (3), Ben Sample" }).edits.faculty).toEqual([{ name: "Ada Example", load: 3 }, { name: "Ben Sample" }]);
  });
});

describe("readMeeting", () => {
  const none = { days: "", start: "", duration: "", room: "" };
  it("leaves out what is blank, and puts days in week order", () => {
    expect(readMeeting(none)).toEqual({ meeting: {}, errors: {} });
    expect(readMeeting({ days: "FMW", start: "9:15", duration: "65", room: " NH 1 " }).meeting).toEqual({ days: "MWF", start: 555, duration: 65, room: "NH 1" });
  });
  it("flags a start time or a length that is not one", () => {
    expect(Object.keys(readMeeting({ ...none, start: "soon", duration: "-5" }).errors).sort()).toEqual(["duration", "start"]);
    expect(readMeeting({ ...none, duration: "6.5" }).errors.duration).toBeDefined();
  });
});
