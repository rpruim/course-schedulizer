import { describe, expect, it } from "vitest";
import { emptySchedule, type Schedule } from "@schedulizer/core";
import { LocalWorkspaceStore, VersionConflictError, type WorkspaceSnapshot } from "./store";

class FakeStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

const named = (name: string): Schedule => ({ ...emptySchedule(), meta: { name, notes: "", version: "" } });
const snap = (...names: string[]): WorkspaceSnapshot => ({
  entries: names.map((n) => ({ id: n, name: n, schedule: named(n) })),
  currentId: names[0] ?? "",
  included: names,
});
const make = () => {
  const storage = new FakeStorage();
  let t = 0;
  return { storage, store: new LocalWorkspaceStore(storage, () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)), () => "new-id") };
};

describe("LocalWorkspaceStore", () => {
  it("has nothing at first, then saves and loads the whole workspace", async () => {
    const { store } = make();
    expect(await store.load()).toBeUndefined();
    const v1 = await store.save(snap("a", "b"));
    expect(v1.version).toBe(1);
    const back = (await store.load())!;
    expect(back.entries.map((e) => e.name)).toEqual(["a", "b"]);
    expect([back.currentId, back.included]).toEqual(["a", ["a", "b"]]);
    expect(back.entries[1]!.schedule.meta.name).toBe("b");
  });
  it("versions saves and rejects a save based on a stale version", async () => {
    const { store } = make();
    await store.save(snap("a"));
    await store.save(snap("a", "b"));
    await expect(store.save(snap("a"), 1)).rejects.toBeInstanceOf(VersionConflictError);
    expect((await store.save(snap("a"), 2)).version).toBe(3);
  });
  it("clears", async () => {
    const { store } = make();
    await store.save(snap("a"));
    await store.clear();
    expect(await store.load()).toBeUndefined();
  });
  it("treats a corrupt record as absent", async () => {
    const { storage, store } = make();
    storage.setItem("schedulizer:workspace", "{not json");
    expect(await store.load()).toBeUndefined();
  });
});

describe("migrating a working copy saved by an earlier version", () => {
  const legacy = (name: string) => JSON.stringify({ id: "current", name, version: 4, savedAt: "2026-01-01T00:00:00.000Z", schedule: named(name) });
  it("opens it as the one schedule of a workspace, named after its file", async () => {
    const { storage, store } = make();
    storage.setItem("schedulizer:current", legacy("old-export.xlsx"));
    const ws = (await store.load())!;
    expect(ws.entries.map((e) => [e.id, e.name])).toEqual([["new-id", "old-export.xlsx"]]);
    expect([ws.currentId, ws.included]).toEqual(["new-id", ["new-id"]]);
  });
  it("uses a plain name when the old record had none", async () => {
    const { storage, store } = make();
    storage.setItem("schedulizer:current", legacy("current"));
    expect((await store.load())!.entries[0]!.name).toBe("Schedule");
  });
  it("prefers the workspace record once one exists, and drops the old one on save", async () => {
    const { storage, store } = make();
    storage.setItem("schedulizer:current", legacy("old"));
    await store.save(snap("fresh"));
    expect(storage.getItem("schedulizer:current")).toBeNull();
    expect((await store.load())!.entries.map((e) => e.name)).toEqual(["fresh"]);
  });
});
