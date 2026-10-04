import { describe, expect, it } from "vitest";
import { emptySchedule, type Schedule } from "@schedulizer/core";
import { displayEntries, initialState, reducer, type Action, type Entry, type State } from "./state";

/** Schedules are told apart by their meta name. */
const sched = (label: string): Schedule => ({ ...emptySchedule(), meta: { name: label, nickname: "", saveAs: "schedulizer", timestamp: true, notes: "", version: "", defaultDepartment: "" } });
const entry = (id: string, name = id, label = id): Entry => ({ id, name, schedule: sched(label) });
const run = (state: State, ...actions: Action[]) => actions.reduce(reducer, state);
const label = (e: Entry | undefined) => e?.schedule.meta.name;
const rename = (to: string) => (s: Schedule): Schedule => ({ ...s, meta: { ...s.meta, name: to } });
const ids = (s: State) => s.present.map((e) => e.id);

const two = () => run(initialState(), { type: "add", entry: entry("a", "Draft A") }, { type: "add", entry: entry("b", "Draft B") });

describe("displayEntries", () => {
  const nick = (e: Entry, nickname: string): Entry => ({ ...e, schedule: { ...e.schedule, meta: { ...e.schedule.meta, nickname } } });
  it("leaves names that are used once alone", () => {
    expect(displayEntries([entry("a", "Draft"), entry("b", "Other")]).map((e) => e.name)).toEqual(["Draft", "Other"]);
  });
  it("numbers every schedule that shares a name, in workspace order, case-insensitively", () => {
    const es = [entry("a", "My Schedule"), entry("b", "Other"), entry("c", "my schedule"), entry("d", "My Schedule")];
    expect(displayEntries(es).map((e) => e.name)).toEqual(["My Schedule (1)", "Other", "my schedule (2)", "My Schedule (3)"]);
  });
  it("uses the nickname instead of the file name, and numbers nicknames that clash", () => {
    const es = [nick(entry("a", "very-long-file-name-1"), "Plan"), nick(entry("b", "very-long-file-name-2"), "Plan"), entry("c", "Plan")];
    expect(displayEntries(es).map((e) => e.name)).toEqual(["Plan (1)", "Plan (2)", "Plan (3)"]);
    expect(displayEntries([nick(entry("a", "x"), "Plan"), entry("b", "y")]).map((e) => e.name)).toEqual(["Plan", "y"]);
  });
  it("never changes the stored file name", () => {
    const es = [entry("a", "Same"), entry("b", "Same")];
    displayEntries(es);
    expect(es.map((e) => e.name)).toEqual(["Same", "Same"]);
  });
});

describe("adding schedules", () => {
  it("makes the new schedule current and included", () => {
    const s = two();
    expect(ids(s)).toEqual(["a", "b"]);
    expect([s.currentId, s.included]).toEqual(["b", ["a", "b"]]);
  });
  it("keeps the file name as given (the views number duplicates)", () => {
    const s = run(initialState(), { type: "add", entry: entry("a", "Plan") }, { type: "add", entry: entry("b", "Plan") });
    expect(s.present.map((e) => e.name)).toEqual(["Plan", "Plan"]);
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
  it("renames, and a rename is undoable", () => {
    let s = run(two(), { type: "rename", id: "b", name: "Draft A" });
    expect(s.present.map((e) => e.name)).toEqual(["Draft A", "Draft A"]);
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

describe("move", () => {
  const three = () => run(initialState(), { type: "add", entry: entry("a") }, { type: "add", entry: entry("b") }, { type: "add", entry: entry("c") });
  it("puts a schedule before another, or last", () => {
    expect(ids(run(three(), { type: "move", id: "c", before: "a" }))).toEqual(["c", "a", "b"]);
    expect(ids(run(three(), { type: "move", id: "a", before: undefined }))).toEqual(["b", "c", "a"]);
    expect(ids(run(three(), { type: "move", id: "a", before: "c" }))).toEqual(["b", "a", "c"]);
  });
  it("changes nothing for an unknown schedule, itself, or an order it already has", () => {
    const s = three();
    expect(run(s, { type: "move", id: "x", before: "a" })).toBe(s);
    expect(run(s, { type: "move", id: "a", before: "z" })).toBe(s);
    expect(run(s, { type: "move", id: "a", before: "a" })).toBe(s);
    expect(run(s, { type: "move", id: "a", before: "b" })).toBe(s);
    expect(run(s, { type: "move", id: "c", before: undefined })).toBe(s);
  });
  it("keeps the current schedule, and the shown ones follow the new order; undo restores the old order", () => {
    const s = run(three(), { type: "setCurrent", id: "b" }, { type: "setIncluded", ids: ["a", "c"] }, { type: "move", id: "c", before: "a" });
    expect(s.currentId).toBe("b");
    expect(s.included).toEqual(["c", "a"]);
    expect(ids(run(s, { type: "undo" }))).toEqual(["a", "b", "c"]);
  });
});
