import { describe, expect, it } from "vitest";
import { emptySchedule } from "./types.js";
import { upgradeSchedule } from "./upgrade.js";

describe("upgradeSchedule", () => {
  it("fills in what older saved schedules lack, and leaves current ones alone", () => {
    const old = { ...emptySchedule(), meta: { name: "x", notes: "", version: "" }, constraints: [{ constraint: "C", course: "MUSC 1", section: "", comment: "" }] } as never;
    const up = upgradeSchedule(old);
    expect(up.meta).toMatchObject({ name: "x", nickname: "", saveAs: "schedulizer", timestamp: true });
    expect(up.constraints[0]).toMatchObject({ type: "takeable", dayRule: "any", should: "should not", instructor: "", term: "" });
    expect(upgradeSchedule(up)).toEqual(up);
  });
  it("gives sections saved before core tags an empty one, so nothing downstream meets undefined", () => {
    const sess = { sectionId: "a", department: "", academicYear: "AY1", term: "FA", termPart: "Full", prefix: "MUSC", courseNumber: "1", section: "A", faculty: [], shortTitle: "", instructionalMethod: "", courseLevel: "", group: "", deliveryMode: "", comment: "", days: "", room: "", extra: {} };
    const old = { ...emptySchedule(), sessions: [sess] } as never;
    const up = upgradeSchedule(old);
    expect(up.sessions[0]!.coreTag).toBe("");
    expect(up.sessions[0]!.specialTopic).toBe(false);
    expect(upgradeSchedule(up).sessions).toBe(up.sessions); // a current schedule keeps its own list
  });
});
