import { describe, expect, it } from "vitest";
import { emptySchedule, type Schedule } from "@schedulizer/core";
import { initialState, reducer, uniqueName, type Action, type Entry, type State } from "./state";

/** Schedules are told apart by their meta name. */
const sched = (label: string): Schedule => ({ ...emptySchedule(), meta: { name: label, notes: "", version: "" } });
const entry = (id: string, name = id, label = id): Entry => ({ id, name, schedule: sched(label) });
const run = (state: State, ...actions: Action[]) => actions.reduce(reducer, state);
const label = (e: Entry | undefined) => e?.schedule.meta.name;
const rename = (to: string) => (s: Schedule): Schedule => ({ ...s, meta: { ...s.meta, name: to } });
const ids = (s: State) => s.present.map((e) => e.id);

const two = () => run(initialState(), { type: "add", entry: entry("a", "Draft A") }, { type: "add", entry: entry("b", "Draft B") });

describe("uniqueName", () => {
  it("keeps a free name and numbers a taken one, case-insensitively", () => {
    const es = [entry("a", "Draft"), entry("b", "Draft (2)")];
    expect(uniqueName(es, "Other")).toBe("Other");
    expect(uniqueName(es, "draft")).toBe("draft (3)");
    expect(uniqueName(es, "Draft", "a")).toBe("Draft"); // not clashing with itself
    expect(uniqueName([], "  ")).toBe("Schedule");
  });
});

describe("adding schedules", () => {
  it("makes the new schedule current and included", () => {
    const s = two();
    expect(ids(s)).toEqual(["a", "b"]);
    expect([s.currentId, s.included]).toEqual(["b", ["a", "b"]]);
  });
  it("makes names unique", () => {
    const s = run(initialState(), { type: "add", entry: entry("a", "Plan") }, { type: "add", entry: entry("b", "Plan") });
    expect(s.present.map((e) => e.name)).toEqual(["Plan", "Plan (2)"]);
  });
  it("is undoable, and redo brings the schedule back included", () => {
    let s = run(two(), { type: "setIncluded", ids: ["a"] }, { type: "undo" });
    expect(ids(s)).toEqual(["a"]);
    expect(s.currentId).toBe("a");
    s = reducer(s, { type: "redo" });
    expect(ids(s)).toEqual(["a", "b"]);
    expect(s.included).toEqual(["a", "b"]);
  });
});

describe("replacing a schedule", () => {
  it("swaps its contents but keeps its id and its place, and is undoable", () => {
    let s = run(two(), { type: "replace", id: "a", name: "Draft A", schedule: sched("new") });
    expect(ids(s)).toEqual(["a", "b"]);
    expect(label(s.present[0])).toBe("new");
    s = reducer(s, { type: "undo" });
    expect(label(s.present[0])).toBe("a");
  });
  it("includes the schedule it replaced", () => {
    const s = run(two(), { type: "setIncluded", ids: ["b"] }, { type: "replace", id: "a", name: "Draft A", schedule: sched("x") });
    expect(s.included).toEqual(["a", "b"]);
  });
  it("ignores an id that is not open", () => {
    const s = two();
    expect(reducer(s, { type: "replace", id: "zzz", name: "n", schedule: sched("x") })).toBe(s);
  });
});

describe("removing and renaming", () => {
  it("removes a schedule; if it was current another becomes current", () => {
    const s = run(two(), { type: "remove", id: "b" });
    expect([ids(s), s.currentId, s.included]).toEqual([["a"], "a", ["a"]]);
    expect(run(s, { type: "remove", id: "a" }).currentId).toBe("");
  });
  it("undoing a removal brings the schedule back, included", () => {
    const s = run(two(), { type: "remove", id: "a" }, { type: "undo" });
    expect(ids(s)).toEqual(["a", "b"]);
    expect(s.included).toEqual(["a", "b"]);
  });
  it("renames, keeping names unique, and a rename is undoable", () => {
    let s = run(two(), { type: "rename", id: "b", name: "Draft A" });
    expect(s.present.map((e) => e.name)).toEqual(["Draft A", "Draft A (2)"]);
    s = reducer(s, { type: "undo" });
    expect(s.present.map((e) => e.name)).toEqual(["Draft A", "Draft B"]);
  });
});

describe("editing one schedule", () => {
  it("changes only that schedule", () => {
    const s = run(two(), { type: "edit", id: "a", fn: rename("edited") });
    expect(s.present.map(label)).toEqual(["edited", "b"]);
  });
  it("one undo history covers every schedule, in the order things happened", () => {
    let s = run(two(), { type: "edit", id: "a", fn: rename("a1") }, { type: "edit", id: "b", fn: rename("b1") }, { type: "edit", id: "a", fn: rename("a2") });
    s = reducer(s, { type: "undo" });
    expect(s.present.map(label)).toEqual(["a1", "b1"]);
    s = reducer(s, { type: "undo" });
    expect(s.present.map(label)).toEqual(["a1", "b"]);
    s = run(s, { type: "redo" }, { type: "redo" });
    expect(s.present.map(label)).toEqual(["a2", "b1"]);
    expect(reducer(s, { type: "redo" })).toBe(s);
  });
  it("a new edit discards the redo stack, and an edit that changes nothing adds no step", () => {
    const s = run(two(), { type: "edit", id: "a", fn: rename("x") }, { type: "undo" }, { type: "edit", id: "a", fn: rename("y") });
    expect(s.future).toEqual([]);
    expect(reducer(s, { type: "edit", id: "a", fn: (x) => x })).toBe(s);
    expect(reducer(s, { type: "edit", id: "nope", fn: rename("z") })).toBe(s);
  });
  it("keeps at most 100 steps", () => {
    let s = two();
    for (let i = 0; i < 120; i++) s = reducer(s, { type: "edit", id: "a", fn: rename(String(i)) });
    expect(s.past).toHaveLength(100);
  });
});

describe("current and included", () => {
  it("are not part of history, and invalid choices are ignored", () => {
    let s = run(two(), { type: "setCurrent", id: "a" }, { type: "setIncluded", ids: ["b"] });
    expect([s.currentId, s.included, s.past.length]).toEqual(["a", ["b"], 2]);
    s = reducer(s, { type: "setCurrent", id: "zzz" });
    expect(s.currentId).toBe("a");
    expect(reducer(s, { type: "setIncluded", ids: ["zzz", "a"] }).included).toEqual(["a"]);
  });
  it("keeps included in workspace order", () => {
    expect(reducer(two(), { type: "setIncluded", ids: ["b", "a"] }).included).toEqual(["a", "b"]);
  });
  it("may include none", () => {
    expect(reducer(two(), { type: "setIncluded", ids: [] }).included).toEqual([]);
  });
});

describe("loading a saved workspace", () => {
  it("restores it with no history, repairing ids that no longer exist", () => {
    const s = reducer(initialState(), { type: "load", snapshot: { entries: [entry("a"), entry("b")], currentId: "gone", included: ["b", "gone"] } });
    expect([ids(s), s.currentId, s.included, s.past.length]).toEqual([["a", "b"], "a", ["b"], 0]);
  });
});
