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
});
