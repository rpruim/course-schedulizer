import { describe, expect, it } from "vitest";
import { exportBaseName, exportFileName, exportFileNames, stampChoiceOf } from "./exportName.js";

const now = new Date(2026, 9, 2, 14, 7);

describe("exportFileName", () => {
  it("adds the date and time by default", () => {
    expect(exportFileName({ saveAs: "schedulizer", timestamp: true }, now)).toBe("schedulizer_2026-10-02_1407.xlsx");
  });
  it("can leave the time stamp off", () => {
    expect(exportFileName({ saveAs: "plan A", timestamp: false }, now)).toBe("plan_A.xlsx");
  });
  it("falls back to the default when blank, and drops a typed .xlsx", () => {
    expect(exportFileName({ saveAs: "  ", timestamp: false }, now)).toBe("schedulizer.xlsx");
    expect(exportFileName({ saveAs: "ay26.xlsx", timestamp: false }, now)).toBe("ay26.xlsx");
  });
});

describe("a typed name and both time stamp choices", () => {
  it("uses the typed name instead of Save As, cleaned the same way", () => {
    expect(exportFileName({ saveAs: "schedulizer", timestamp: false }, now, "my plan.xlsx")).toBe("my_plan.xlsx");
    expect(exportFileName({ saveAs: "schedulizer", timestamp: true }, now, "  ")).toBe("schedulizer_2026-10-02_1407.xlsx");
    expect(exportBaseName({ saveAs: "plan A" })).toBe("plan_A");
  });
  it("gives one name or both, the stamped one first, with the same time", () => {
    const meta = { saveAs: "ay26" };
    expect(exportFileNames(meta, "with", now)).toEqual(["ay26_2026-10-02_1407.xlsx"]);
    expect(exportFileNames(meta, "without", now)).toEqual(["ay26.xlsx"]);
    expect(exportFileNames(meta, "both", now, "draft")).toEqual(["draft_2026-10-02_1407.xlsx", "draft.xlsx"]);
    expect([stampChoiceOf({ timestamp: true }), stampChoiceOf({ timestamp: false })]).toEqual(["with", "without"]);
  });
});

describe("the Both setting of the Meta tab", () => {
  it("is saved in the file's Metadata sheet and read back, as Yes and No are", async () => {
    const { importRecords } = await import("./import.js");
    const { readWorkbook, writeWorkbook } = await import("./xlsx.js");
    const base = importRecords({ sessions: [{ AcademicYear: "AY25", Term: "FA", Prefix: "MUSC", CourseNumber: "104", Section: "A" }] }).schedule;
    for (const value of [true, false, "both"] as const) {
      const back = await readWorkbook(await writeWorkbook({ ...base, meta: { ...base.meta, timestamp: value } }));
      expect(back.schedule.meta.timestamp).toBe(value);
    }
    expect(stampChoiceOf({ timestamp: "both" })).toBe("both");
    expect(exportFileName({ saveAs: "ay26", timestamp: "both" }, now)).toBe("ay26_2026-10-02_1407.xlsx");
  });
});
