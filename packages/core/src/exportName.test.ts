import { describe, expect, it } from "vitest";
import { exportFileName } from "./exportName.js";

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
