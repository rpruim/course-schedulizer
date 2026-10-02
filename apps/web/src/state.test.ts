import { describe, expect, it } from "vitest";
import { emptySchedule, type Schedule } from "@schedulizer/core";
import { initialState, reducer } from "./state";

const withName = (name: string) => (s: Schedule): Schedule => ({ ...s, meta: { ...s.meta, name } });
const name = (s: ReturnType<typeof initialState>) => s.present.meta.name;

describe("history reducer", () => {
  it("undoes and redoes edits", () => {
    let s = initialState();
    s = reducer(s, { type: "apply", fn: withName("one") });
    s = reducer(s, { type: "apply", fn: withName("two") });
    expect(name(s)).toBe("two");
    s = reducer(s, { type: "undo" });
    expect(name(s)).toBe("one");
    s = reducer(s, { type: "undo" });
    expect(name(s)).toBe("");
    s = reducer(s, { type: "undo" }); // nothing left: no change
    expect(name(s)).toBe("");
    s = reducer(s, { type: "redo" });
    s = reducer(s, { type: "redo" });
    expect(name(s)).toBe("two");
    expect(reducer(s, { type: "redo" })).toBe(s);
  });
  it("a new edit discards the redo stack", () => {
    let s = reducer(initialState(), { type: "apply", fn: withName("one") });
    s = reducer(s, { type: "undo" });
    s = reducer(s, { type: "apply", fn: withName("other") });
    expect(s.future).toEqual([]);
  });
  it("ignores an edit that changes nothing, so it adds no undo step", () => {
    const s = initialState();
    expect(reducer(s, { type: "apply", fn: (x) => x })).toBe(s);
  });
  it("opening a schedule replaces everything and clears history", () => {
    let s = reducer(initialState(), { type: "apply", fn: withName("one") });
    s = reducer(s, { type: "replace", schedule: emptySchedule(), fileName: "f.xlsx" });
    expect(s).toMatchObject({ past: [], future: [], fileName: "f.xlsx" });
  });
  it("keeps at most 100 steps", () => {
    let s = initialState();
    for (let i = 0; i < 120; i++) s = reducer(s, { type: "apply", fn: withName(String(i)) });
    expect(s.past).toHaveLength(100);
  });
});
