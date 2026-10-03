import { describe, expect, it } from "vitest";
import { metaOpen } from "./metaOpen";

describe("metaOpen", () => {
  it("opens only the schedule made current, and remembers toggles after that", () => {
    metaOpen.only("a");
    expect([...metaOpen.get()]).toEqual(["a"]);
    metaOpen.toggle("b");
    expect([...metaOpen.get()].sort()).toEqual(["a", "b"]);
    metaOpen.toggle("a");
    expect([...metaOpen.get()]).toEqual(["b"]);
    metaOpen.only("c");
    expect([...metaOpen.get()]).toEqual(["c"]);
    metaOpen.only("");
    expect(metaOpen.get().size).toBe(0);
  });
});
