import { describe, expect, it } from "vitest";
import { draftToNtForm, ntFormToDraft } from "./ntForm";

describe("non-teaching form", () => {
  const draft = { academicYear: "Y", faculty: "Ada", activity: "Chair", term: "AY", load: 1.5, comment: "c", extra: { X: "1" } };
  it("round-trips a row through its strings", () => {
    const f = draftToNtForm(draft);
    expect(f.load).toBe("1.5");
    expect(ntFormToDraft(f)).toEqual({ draft, errors: [] });
  });
  it("leaves a blank load unset, and reports one that is not a number", () => {
    expect(ntFormToDraft({ ...draftToNtForm(draft), load: " " }).draft.load).toBeUndefined();
    const bad = ntFormToDraft({ ...draftToNtForm(draft), load: "lots" });
    expect(bad.errors).toEqual([{ field: "load", message: "Load is not a number" }]);
    expect(bad.draft.load).toBeUndefined();
  });
});
