import { describe, expect, it } from "vitest";
import { keyFor } from "./colorKey";

describe("keyFor", () => {
  it("lists each value once in natural order, with gray none-given last", () => {
    const key = keyFor("group", [
      { colorValue: "G10", hue: 10 }, { colorValue: "", hue: undefined }, { colorValue: "G2", hue: 2 }, { colorValue: "G10", hue: 10 },
    ]);
    expect(key.title).toBe("Color by Group");
    expect(key.entries).toEqual([{ label: "G2", hue: 2 }, { label: "G10", hue: 10 }, { label: "(none given)", hue: undefined }]);
  });
  it("is empty when nothing is shown, and has no gray entry when nothing is missing", () => {
    expect(keyFor("prefix", []).entries).toEqual([]);
    expect(keyFor("method", [{ colorValue: "Lecture", hue: 5 }]).entries.map((e) => e.label)).toEqual(["Lecture"]);
  });
});
