import { describe, expect, it } from "vitest";
import { formatFaculty, formatNumber, formatTime, parseDays, parseFaculty, parseTime } from "./format.js";

describe("parseTime", () => {
  it("reads common forms", () => {
    expect(parseTime("14:10:00")).toBe(850);
    expect(parseTime("8:00")).toBe(480);
    expect(parseTime("08:00:00")).toBe(480);
    expect(parseTime("2:10 PM")).toBe(850);
    expect(parseTime("12:15 AM")).toBe(15);
    expect(parseTime("12:15 PM")).toBe(735);
    expect(parseTime("0.5972222222")).toBe(860);
    expect(parseTime("")).toBeUndefined();
  });
  it("rejects non-times", () => {
    expect(parseTime("noon")).toBeNull();
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("13:00 PM")).toBeNull();
  });
  it("formats", () => expect(formatTime(850)).toBe("14:10"));
});

describe("parseDays", () => {
  it("normalizes and orders", () => {
    expect(parseDays("MWF")).toBe("MWF");
    expect(parseDays("FWM")).toBe("MWF");
    expect(parseDays("MTH")).toBe("MR");
    expect(parseDays("m, w")).toBe("MW");
    expect(parseDays("")).toBe("");
  });
  it("rejects junk", () => expect(parseDays("MXF")).toBeNull());
});

describe("faculty", () => {
  it("parses shares", () => {
    expect(parseFaculty("Ada Example (3), Ben Sample")).toEqual([{ name: "Ada Example", load: 3 }, { name: "Ben Sample" }]);
    expect(parseFaculty("Ada\nBen (1.5)")).toEqual([{ name: "Ada" }, { name: "Ben", load: 1.5 }]);
    // semicolons let a name contain a comma; commas still separate when there is no semicolon
    expect(parseFaculty("Pruim, Randall; Smith, Jo (2)")).toEqual([{ name: "Pruim, Randall" }, { name: "Smith, Jo", load: 2 }]);
    expect(parseFaculty("Pruim, Randall", { commas: false })).toEqual([{ name: "Pruim, Randall" }]);
    expect(parseFaculty("Ada, Ben")).toEqual([{ name: "Ada" }, { name: "Ben" }]);
    expect(formatFaculty([{ name: "Ada" }, { name: "Ben", load: 1 }])).toBe("Ada, Ben (1)");
    expect(formatFaculty([{ name: "Ada" }, { name: "Ben", load: 1 }], { semicolons: true })).toBe("Ada; Ben (1)");
    expect(formatFaculty([{ name: "Pruim, Randall" }, { name: "Ben" }])).toBe("Pruim, Randall; Ben");
    expect(parseFaculty("Smith (Chair)")).toEqual([{ name: "Smith (Chair)" }]);
    expect(parseFaculty("")).toEqual([]);
    expect(parseFaculty("*")).toEqual([{ name: "*" }]);
  });
  it("round-trips", () => {
    const s = "Ada Example (3), Ben Sample";
    expect(formatFaculty(parseFaculty(s))).toBe(s);
  });
  it("formats numbers without trailing zeros", () => {
    expect(formatNumber(4)).toBe("4");
    expect(formatNumber(1.8)).toBe("1.8");
    expect(formatNumber(undefined)).toBe("");
  });
});
