import { describe, expect, it } from "vitest";
import { emptySchedule, type Schedule } from "@schedulizer/core";
import { LocalStore, VersionConflictError } from "./store";

class FakeStorage {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

const named = (name: string): Schedule => ({ ...emptySchedule(), meta: { name, notes: "", version: "" } });
const store = () => {
  const storage = new FakeStorage();
  let t = 0;
  return { storage, store: new LocalStore(storage, "t:", () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++))) };
};

describe("LocalStore", () => {
  it("saves, loads and versions", async () => {
    const { store: s } = store();
    expect(await s.load("a")).toBeUndefined();
    const v1 = await s.save("a", named("Fall plan"));
    expect(v1).toMatchObject({ id: "a", name: "Fall plan", version: 1 });
    const v2 = await s.save("a", named("Fall plan 2"));
    expect(v2.version).toBe(2);
    expect((await s.load("a"))!.schedule.meta.name).toBe("Fall plan 2");
  });
  it("falls back to the id when the schedule has no name", async () => {
    expect((await store().store.save("current", named(""))).name).toBe("current");
  });
  it("rejects a save based on a stale version, and accepts a current one", async () => {
    const { store: s } = store();
    await s.save("a", named("x"));
    await s.save("a", named("y"));
    await expect(s.save("a", named("z"), 1)).rejects.toBeInstanceOf(VersionConflictError);
    expect((await s.save("a", named("z"), 2)).version).toBe(3);
  });
  it("lists only its own records, newest first, and removes", async () => {
    const { storage, store: s } = store();
    storage.setItem("other:key", "{}");
    await s.save("a", named("A"));
    await s.save("b", named("B"));
    expect((await s.list()).map((r) => r.id)).toEqual(["b", "a"]);
    await s.remove("b");
    expect((await s.list()).map((r) => r.id)).toEqual(["a"]);
  });
  it("treats a corrupt record as absent", async () => {
    const { storage, store: s } = store();
    storage.setItem("t:bad", "{not json");
    expect(await s.load("bad")).toBeUndefined();
    expect(await s.list()).toEqual([]);
  });
});
