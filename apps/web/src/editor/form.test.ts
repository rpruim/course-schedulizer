import { describe, expect, it } from "vitest";
import { importRecords, sectionToDraft } from "@schedulizer/core";
import { byField, draftToForm, emptyMeetingForm, formToDraft, meetingSummary } from "./form";

const schedule = importRecords({
  sessions: [
    { AcademicYear: "Y", Term: "FA", Prefix: "MUSC", CourseNumber: "101", Section: "A", ShortTitle: "Calc", Faculty: "Ada (3), Ben", FacultyLoad: "4", MinimumCredits: "4", Enrollment: "20", Comment: "hi", MeetingDays: "MW\nF", StartTime: "09:15\n10:20", MeetingDuration: "65\n50", Classroom: "NH 1\nNH 2" },
  ],
}).schedule;
const draft = sectionToDraft(schedule, "Y-FA-MUSC101-A")!;

describe("draftToForm / formToDraft", () => {
  it("round-trips a section through the dialog's strings", () => {
    const f = draftToForm(draft);
    expect(f).toMatchObject({ faculty: "Ada (3), Ben", facultyLoad: "4", enrollment: "20", maximumCredits: "" });
    expect(f.meetings).toEqual([
      { days: ["M", "W"], start: "09:15", duration: "65", room: "NH 1" },
      { days: ["F"], start: "10:20", duration: "50", room: "NH 2" },
    ]);
    const back = formToDraft(f);
    expect(back.errors).toEqual([]);
    expect(back.draft).toEqual(draft);
  });
  it("reads numbers and times, and reports what it cannot read, by field", () => {
    const f = { ...draftToForm(draft), facultyLoad: "lots", enrollment: "", meetings: [{ days: ["M"], start: "noon", duration: "5x", room: "" }] };
    const { errors, draft: d } = formToDraft(f);
    expect(byField(errors)).toEqual({
      facultyLoad: ["Faculty load is not a number"],
      "meetings.0.start": ['"noon" is not a time'],
      "meetings.0.duration": ["Duration is not a number"],
    });
    expect(d.facultyLoad).toBeUndefined();
    expect(d.enrollment).toBeUndefined();
  });
  it("puts day letters in week order whatever order they were picked in", () => {
    const f = { ...draftToForm(draft), meetings: [{ ...emptyMeetingForm(), days: ["F", "M", "R"], start: "08:00", duration: "50" }] };
    expect(formToDraft(f).draft.meetings[0]!.days).toBe("MRF");
  });
  it("treats a blank new form as a draft with no id", () => {
    const f = { ...draftToForm(draft), sectionId: undefined };
    expect(formToDraft(f).draft.sectionId).toBeUndefined();
  });
});

describe("meetingSummary", () => {
  const m = (patch: Partial<ReturnType<typeof emptyMeetingForm>>) => ({ ...emptyMeetingForm(), ...patch });
  it("writes days, times and room in a line", () => {
    expect(meetingSummary(m({ days: ["F", "M", "W"], start: "12:15", duration: "65", room: "NH 256" }))).toBe("MWF 12:15–13:20 in NH 256");
  });
  it("leaves out what is missing", () => {
    expect(meetingSummary(m({ days: ["T", "R"], start: "10:20" }))).toBe("TR 10:20");
    expect(meetingSummary(m({ room: " SB 110 " }))).toBe("in SB 110");
    expect(meetingSummary(m({}))).toBe("");
  });
});
