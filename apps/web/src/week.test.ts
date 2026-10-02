import { describe, expect, it } from "vitest";
import { importRecords, type Schedule } from "@schedulizer/core";
import { hourLabel, hueOf, layoutLanes, weekGrids, type WeekOptions } from "./week";

const sec = (prefix: string, n: string, letter: string, o: Record<string, string> = {}) => ({
  AcademicYear: "Y", Term: "FA", Prefix: prefix, CourseNumber: n, Section: letter, ...o,
});
const mt = (days: string, start: string, dur: string, room = "") => ({ MeetingDays: days, StartTime: start, MeetingDuration: dur, Classroom: room });
const make = (rows: Record<string, string>[], extra: Partial<Parameters<typeof importRecords>[0]> = {}): Schedule => {
  const r = importRecords({ sessions: rows, ...extra });
  expect(r.issues).toEqual([]);
  return r.schedule;
};
const opts = (o: Partial<WeekOptions> = {}): WeekOptions => ({ year: "Y", term: "FA", kind: "dept", colorBy: "prefix", ...o });

describe("layoutLanes", () => {
  const b = (start: number, end: number) => ({ start, end, lane: 0, lanes: 1 });
  it("puts overlapping blocks side by side and lets touching ones share a lane", () => {
    const [a, c, d] = layoutLanes([b(540, 600), b(570, 630), b(630, 690)]);
    expect([a!.lane, a!.lanes]).toEqual([0, 2]);
    expect([c!.lane, c!.lanes]).toEqual([1, 2]);
    expect([d!.lane, d!.lanes]).toEqual([0, 1]); // starts as the second ends: its own cluster
  });
  it("reuses a freed lane and sizes the whole cluster alike", () => {
    const blocks = layoutLanes([b(540, 660), b(550, 580), b(590, 620), b(600, 700)]);
    expect(blocks.map((x) => x.lane)).toEqual([0, 1, 1, 2]);
    expect(blocks.map((x) => x.lanes)).toEqual([3, 3, 3, 3]);
  });
  it("leaves a lone block full width", () => {
    expect(layoutLanes([b(540, 600)])[0]).toMatchObject({ lane: 0, lanes: 1 });
  });
});

describe("hueOf", () => {
  it("is stable and in range", () => {
    expect(hueOf("MATH")).toBe(hueOf("MATH"));
    expect(hueOf("MATH")).not.toBe(hueOf("STAT"));
    expect(hueOf("anything")).toBeGreaterThanOrEqual(0);
    expect(hueOf("anything")).toBeLessThan(360);
  });
});

describe("department grid", () => {
  const s = make([
    sec("MATH", "101", "A", { Faculty: "Smith", ...mt("MWF", "09:15", "65", "NH 1"), ShortTitle: "Calc" }),
    sec("MATH", "102", "A", { Faculty: "Smith", ...mt("TR", "14:10", "100", "NH 2") }),
    sec("STAT", "201", "A", { Faculty: "Lee", ...mt("MW", "09:30", "50", "NH 3") }),
    sec("MATH", "150", "A", { Faculty: "Kim" }),
    sec("MATH", "999", "A", { Term: "SP", Faculty: "Kim", ...mt("M", "9:00", "50") }),
  ]);

  it("makes a block for each day of each meeting, in the chosen term only", () => {
    const { grids } = weekGrids(s, opts());
    expect(grids).toHaveLength(1);
    const g = grids[0]!;
    expect(g.blocks.map((x) => `${x.title} ${x.day}`).sort()).toEqual([
      "MATH 101 A F", "MATH 101 A M", "MATH 101 A W", "MATH 102 A R", "MATH 102 A T", "STAT 201 A M", "STAT 201 A W",
    ]);
  });
  it("places each block by its start and end time", () => {
    const m = weekGrids(s, opts()).grids[0]!.blocks.find((b) => b.title === "MATH 101 A" && b.day === "M")!;
    expect([m.start, m.end]).toEqual([555, 620]);
    expect(m).toMatchObject({ sub: "Smith", detail: "MATH 101 A\nCalc\nSmith\nMWF 09:15–10:20\nNH 1" });
  });
  it("sizes the axis to the data, never smaller than 8:00–17:00, and shows Mon–Fri", () => {
    const g = weekGrids(s, opts()).grids[0]!;
    expect([g.startMin, g.endMin]).toEqual([480, 1020]);
    expect(g.days).toEqual([..."MTWRF"]);
    const evening = make([sec("A", "1", "A", mt("S", "18:30", "210"))]);
    const e = weekGrids(evening, opts()).grids[0]!;
    expect(e.days).toEqual([..."MTWRFS"]);
    expect([e.startMin, e.endMin]).toEqual([480, 1320]);
  });
  it("lays overlapping blocks side by side", () => {
    const m = weekGrids(s, opts()).grids[0]!.blocks.filter((b) => b.day === "M");
    expect(m.map((b) => [b.title, b.lane, b.lanes])).toEqual([["MATH 101 A", 0, 2], ["STAT 201 A", 1, 2]]);
  });
  it("lists sections with no time", () => {
    expect(weekGrids(s, opts()).grids[0]!.unscheduled).toEqual([{ sectionId: "Y-FA-MATH150-A", label: "MATH 150 A" }]);
  });
  it("can be limited to a prefix, and offers the prefixes", () => {
    const r = weekGrids(s, opts({ prefix: "STAT" }));
    expect(r.grids[0]!.blocks.every((b) => b.title.startsWith("STAT"))).toBe(true);
    expect(r.choices).toEqual(["MATH", "STAT"]);
  });
  it("is empty for a term with nothing", () => {
    expect(weekGrids(s, opts({ term: "SU" })).grids[0]!.blocks).toEqual([]);
  });
  it("marks sections that are in a conflict", () => {
    const clash = make([
      sec("A", "1", "A", { Faculty: "Smith", ...mt("M", "9:00", "50") }),
      sec("B", "2", "A", { Faculty: "Smith", ...mt("M", "9:30", "50") }),
      sec("C", "3", "A", { Faculty: "Lee", ...mt("M", "13:00", "50") }),
    ]);
    expect(weekGrids(clash, opts()).grids[0]!.blocks.map((b) => b.conflict)).toEqual([true, true, false]);
  });
  it("tags a part of term and colours by the chosen field", () => {
    const part = make([sec("MATH", "1", "A", { TermPart: "First", CourseLevel: "100", Faculty: "Ada", ...mt("M", "9:00", "50") })]);
    expect(weekGrids(part, opts()).grids[0]!.blocks[0]!.title).toBe("MATH 1 A · First");
    expect(weekGrids(part, opts({ colorBy: "level" })).grids[0]!.blocks[0]!.hue).toBe(hueOf("100"));
    expect(weekGrids(part, opts({ colorBy: "instructor" })).grids[0]!.blocks[0]!.hue).toBe(hueOf("Ada"));
  });
  it("uses the cross-listing display name", () => {
    const x = make([sec("DATA", "385", "A", mt("M", "9:00", "50"))], { crossListings: [{ SectionId: "Y-FA-DATA385-A", Prefix: "STAT", CourseNumber: "385" }] });
    expect(weekGrids(x, opts()).grids[0]!.blocks[0]!.title).toBe("DATA/STAT 385 A");
  });
});

describe("faculty grids", () => {
  const s = make([
    sec("MATH", "101", "A", { Faculty: "Smith, Lee", ...mt("MWF", "09:15", "65", "NH 1") }),
    sec("MATH", "102", "A", { Faculty: "lee ", ...mt("TR", "10:00", "50", "NH 2") }),
    sec("MATH", "103", "A", { Faculty: "Smith (2)" }),
    sec("MATH", "104", "A", { Faculty: "*", ...mt("F", "9:00", "50") }),
  ]);
  it("makes one grid per instructor, in name order, listing their unscheduled sections", () => {
    const { grids, choices } = weekGrids(s, opts({ kind: "faculty" }));
    expect(choices).toEqual(["Lee", "Smith"]);
    expect(grids.map((g) => g.title)).toEqual(["Lee", "Smith"]);
    expect(grids[0]!.blocks.map((b) => b.title).filter((t, i, a) => a.indexOf(t) === i)).toEqual(["MATH 101 A", "MATH 102 A"]);
    expect(grids[1]!.unscheduled).toEqual([{ sectionId: "Y-FA-MATH103-A", label: "MATH 103 A" }]);
  });
  it("shows the room as the second line, and a team-taught section on each person's grid", () => {
    const smith = weekGrids(s, opts({ kind: "faculty", only: "Smith" })).grids;
    expect(smith).toHaveLength(1);
    expect(smith[0]!.blocks[0]).toMatchObject({ title: "MATH 101 A", sub: "NH 1" });
  });
  it("does not make a grid for the wildcard instructor", () => {
    expect(weekGrids(s, opts({ kind: "faculty" })).choices).not.toContain("*");
  });
});

describe("room grids", () => {
  const s = make([
    sec("MATH", "101", "A", { Faculty: "Smith", ...mt("MWF", "09:15", "65", "NH 101") }),
    sec("MATH", "102", "A", { Faculty: "Lee", ...mt("TR", "10:00", "50", "nh  101") }),
    sec("MATH", "103", "A", { Faculty: "Kim", ...mt("M", "13:00", "50", "NH 9") }),
    sec("MATH", "104", "A", { Faculty: "Kim", ...mt("M", "14:00", "50", "Online") }),
    sec("MATH", "105", "A", { Faculty: "Kim", ...mt("M", "15:00", "50") }),
  ]);
  it("makes one grid per room (same room however it is spelled), in natural order", () => {
    const { grids, choices } = weekGrids(s, opts({ kind: "room" }));
    expect(choices).toEqual(["NH 9", "NH 101"]);
    expect(grids.map((g) => g.title)).toEqual(["NH 9", "NH 101"]);
    expect(grids[1]!.blocks.map((b) => b.title).filter((t, i, a) => a.indexOf(t) === i)).toEqual(["MATH 101 A", "MATH 102 A"]);
    expect(grids[1]!.blocks[0]!.sub).toBe("Smith");
  });
  it("counts meetings with no room or a non-room, and leaves them out", () => {
    expect(weekGrids(s, opts({ kind: "room" })).withoutRoom).toBe(2);
  });
  it("can show a single room", () => {
    expect(weekGrids(s, opts({ kind: "room", only: "NH 9" })).grids).toHaveLength(1);
  });
});

describe("hourLabel", () => {
  it("labels whole hours in 12-hour time", () => {
    expect([480, 720, 780, 1020, 1320].map(hourLabel)).toEqual(["8 AM", "12 PM", "1 PM", "5 PM", "10 PM"]);
  });
});
