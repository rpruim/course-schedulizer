import { describe, expect, it } from "vitest";
import { importRecords, type Schedule } from "@schedulizer/core";
import { groupGrids, hourLabel, hueOf, layoutLanes, weekGrids, type WeekOptions } from "./week";

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
  it("tags a part of term and colors by the chosen field", () => {
    const part = make([sec("MATH", "1", "A", { TermPart: "First", CourseLevel: "100", Faculty: "Ada", ...mt("M", "9:00", "50") })]);
    const b = weekGrids(part, opts()).grids[0]!.blocks[0]!;
    expect(b.title).toBe("MATH 1 A");
    expect(b.detail).toContain("MATH 1 A · First");
    expect(b.quarters).toEqual([true, true, false, false]);
    expect(weekGrids(part, opts({ colorBy: "level" })).grids[0]!.blocks[0]!.hue).toBe(hueOf("100"));
    expect(weekGrids(part, opts({ colorBy: "instructor" })).grids[0]!.blocks[0]!.hue).toBe(hueOf("Ada"));
  });
  it("colors by group, instructional method, and a level taken from the course number", () => {
    const s = make([
      sec("MATH", "231", "A", { Group: "Major core", InstructionalMethod: "Lecture", ...mt("M", "9:00", "50") }),
      sec("MATH", "231", "B", { CourseLevel: "300", ...mt("T", "9:00", "50") }),
    ]);
    const hues = (colorBy: WeekOptions["colorBy"]) => weekGrids(s, opts({ colorBy })).grids[0]!.blocks.map((b) => b.hue);
    expect(hues("group")).toEqual([hueOf("Major core"), undefined]); // a missing value has no color: it is drawn gray
    expect(hues("method")).toEqual([hueOf("Lecture"), undefined]);
    expect(hues("level")).toEqual([hueOf("200"), hueOf("300")]); // 231 implies 200 unless a level is given
  });
  it("colors by department (with the schedule's default) and draws a missing value gray", () => {
    const s = make([
      sec("MATH", "231", "A", { Department: "Math", ...mt("M", "9:00", "50") }),
      sec("MATH", "231", "B", { ...mt("T", "9:00", "50") }),
      sec("STAT", "143", "A", { Group: "G", ...mt("W", "9:00", "50") }),
    ]);
    const blocks = (sched: Schedule, colorBy: WeekOptions["colorBy"]) => weekGrids(sched, opts({ colorBy })).grids[0]!.blocks;
    expect(blocks(s, "department").map((b) => b.colorValue)).toEqual(["Math", "", ""]);
    expect(blocks(s, "department").map((b) => b.hue)).toEqual([hueOf("Math"), undefined, undefined]);
    const withDefault = { ...s, meta: { ...s.meta, defaultDepartment: "Some Dept" } };
    expect(blocks(withDefault, "department").map((b) => b.colorValue)).toEqual(["Math", "Some Dept", "Some Dept"]);
    expect(blocks(s, "group").map((b) => b.hue)).toEqual([undefined, undefined, hueOf("G")]);
    expect(blocks(s, "prefix").every((b) => b.hue !== undefined)).toBe(true);
  });
  it("filters the department grid by what it can be colored by, offering the values (and whether any are missing)", () => {
    const s = make([
      sec("MATH", "231", "A", { Group: "Core", ...mt("M", "9:00", "50") }),
      sec("MATH", "231", "B", { Group: "Core", ...mt("T", "9:00", "50") }),
      sec("STAT", "143", "A", { Group: "Intro", ...mt("W", "9:00", "50") }),
      sec("STAT", "243", "A", { ...mt("R", "9:00", "50") }),
      sec("DATA", "301", "A"),
    ]);
    const ids = (filter?: { by: WeekOptions["colorBy"]; values: string[] }) => weekGrids(s, opts({ ...(filter ? { filter } : {}) })).grids[0]!;
    const all = weekGrids(s, opts({ filter: { by: "group", values: [] } }));
    expect(all.filterValues).toEqual(["Core", "Intro"]);
    expect(all.filterMissing).toBe(true);
    expect(ids({ by: "group", values: ["Core"] }).blocks.map((b) => b.title)).toEqual(["MATH 231 A", "MATH 231 B"]);
    expect(ids({ by: "group", values: ["Core", "Intro"] }).blocks).toHaveLength(3);
    // "" is the missing value: the section with no group, and the one with no time still listed as unscheduled
    const missing = ids({ by: "group", values: [""] });
    expect(missing.blocks.map((b) => b.title)).toEqual(["STAT 243 A"]);
    expect(missing.unscheduled.map((u) => u.label)).toEqual(["DATA 301 A"]);
    expect(ids({ by: "prefix", values: ["STAT", "DATA"] }).blocks).toHaveLength(2);
    expect(ids().blocks).toHaveLength(4);
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

describe("filtering by part of the term", () => {
  // one course per part, all meeting at the same time, so lanes show how crowded the slot is
  const parts = ["Full", "First", "Second", "A", "B", "C", "D"];
  const s = make(parts.map((p, i) => sec("MATH", String(100 + i), "A", { TermPart: p, Faculty: `Prof ${p}`, ...mt("MWF", "09:00", "50", `NH ${i}`) })));
  const shown = (part?: string) =>
    [...new Set(weekGrids(s, opts(part ? { part } : {})).grids[0]!.blocks.map((b) => b.title.replace(/ A.*$/, "").replace("MATH ", "")))]
      .map((n) => parts[Number(n) - 100]!)
      .sort();

  it("shows every section for the full term, or when no part is chosen", () => {
    expect(shown()).toEqual([...parts].sort());
    expect(shown("Full")).toEqual([...parts].sort());
  });
  it("shows the sections whose weeks overlap the chosen part", () => {
    expect(shown("First")).toEqual(["A", "B", "First", "Full"]);
    expect(shown("Second")).toEqual(["C", "D", "Full", "Second"]);
    expect(shown("A")).toEqual(["A", "First", "Full"]);
    expect(shown("B")).toEqual(["B", "First", "Full"]);
    expect(shown("C")).toEqual(["C", "Full", "Second"]);
    expect(shown("D")).toEqual(["D", "Full", "Second"]);
  });
  it("needs fewer side-by-side lanes once the part is chosen", () => {
    const lanes = (part?: string) => Math.max(...weekGrids(s, opts(part ? { part } : {})).grids[0]!.blocks.map((b) => b.lanes));
    expect(lanes()).toBe(7);
    expect(lanes("First")).toBe(4);
    expect(lanes("A")).toBe(3);
  });
  it("offers the parts of the term", () => {
    expect(weekGrids(s, opts()).parts.map((p) => p.code)).toEqual(["Full", "First", "A", "B", "Second", "C", "D"]);
    expect(weekGrids(s, opts({ term: "WI" })).parts.map((p) => p.code)).toEqual(["Full"]);
  });
  it("applies to faculty and room grids and their unscheduled lists, but never changes the choices", () => {
    const fac = weekGrids(s, opts({ kind: "faculty", part: "D" }));
    expect(fac.choices).toHaveLength(7); // everyone stays selectable
    expect(fac.grids.map((g) => g.title)).toEqual(["Prof D", "Prof Full", "Prof Second"]);
    expect(weekGrids(s, opts({ kind: "faculty", part: "D", only: "Prof A" })).grids[0]!.blocks).toEqual([]);
    const room = weekGrids(s, opts({ kind: "room", part: "A" }));
    expect(room.choices).toHaveLength(7);
    expect(room.grids).toHaveLength(3);
    const un = make([sec("MATH", "1", "A", { TermPart: "C" }), sec("MATH", "2", "A", { TermPart: "A" })]);
    expect(weekGrids(un, opts({ part: "A" })).grids[0]!.unscheduled.map((u) => u.label)).toEqual(["MATH 2 A"]);
  });
  it("uses each term's own parts", () => {
    const custom = make([sec("X", "1", "A", { Term: "XT", TermPart: "S1", ...mt("M", "9:00", "50") }), sec("X", "2", "A", { Term: "XT", TermPart: "S2", ...mt("M", "9:00", "50") })], {
      settings: {
        ...importRecords({ sessions: [] }).schedule.settings,
        terms: [{ code: "XT", name: "Made-up" }],
        parts: [{ term: "XT", code: "Full", name: "Full", startWeek: 1, endWeek: 10 }, { term: "XT", code: "S1", name: "Session 1", startWeek: 1, endWeek: 5 }, { term: "XT", code: "S2", name: "Session 2", startWeek: 6, endWeek: 10 }],
      },
    });
    expect(weekGrids(custom, opts({ term: "XT", part: "S1" })).grids[0]!.blocks.map((b) => [b.title, b.quarters])).toEqual([["X 1 A", [true, true, false, false]]]);
  });
});

describe("groupGrids", () => {
  const a = make([sec("MATH", "1", "A", { Faculty: "Ada", ...mt("M", "9:00", "50", "NH 1") }), sec("MATH", "2", "A", { Faculty: "Ben", ...mt("T", "9:00", "50", "NH 2") })]);
  const b = make([sec("MATH", "1", "A", { Faculty: "Ada", ...mt("W", "9:00", "50", "NH 1") }), sec("MATH", "3", "A", { Faculty: "Cy", ...mt("T", "9:00", "50", "NH 3") })]);
  const results = (kind: "dept" | "faculty" | "room") => [
    { id: "a", name: "Draft A", result: weekGrids(a, opts({ kind })) },
    { id: "b", name: "Draft B", result: weekGrids(b, opts({ kind })) },
  ];
  it("makes one group per instructor from every schedule, with a gap where a schedule lacks the person", () => {
    const g = groupGrids(results("faculty"), "faculty");
    expect(g.map((x) => x.title)).toEqual(["Ada", "Ben", "Cy"]);
    expect(g[0]!.items.map((i) => [i.scheduleName, !!i.grid])).toEqual([["Draft A", true], ["Draft B", true]]);
    expect(g[1]!.items.map((i) => !!i.grid)).toEqual([true, false]);
    expect(g[2]!.items.map((i) => !!i.grid)).toEqual([false, true]);
  });
  it("makes one group per room, or just the chosen one", () => {
    expect(groupGrids(results("room"), "room").map((x) => x.title)).toEqual(["NH 1", "NH 2", "NH 3"]);
    expect(groupGrids(results("faculty"), "faculty", "Ben").map((x) => x.title)).toEqual(["Ben"]);
  });
  it("makes the department a single group with a grid per schedule", () => {
    const g = groupGrids(results("dept"), "dept");
    expect(g).toHaveLength(1);
    expect(g[0]!.items.map((i) => i.grid?.blocks.length)).toEqual([2, 2]);
  });
  it("handles one schedule, and none", () => {
    expect(groupGrids([results("faculty")[0]!], "faculty").map((x) => x.title)).toEqual(["Ada", "Ben"]);
    expect(groupGrids([], "faculty")).toEqual([]);
    expect(groupGrids([], "dept")[0]!.items).toEqual([]);
  });
});

describe("quarter dots", () => {
  const quarters = (part: string) => weekGrids(make([sec("MATH", "1", "A", { TermPart: part, ...mt("M", "9:00", "50") })]), opts()).grids[0]!.blocks[0]!.quarters;
  it("fills the quarters a section meets in", () => {
    expect(quarters("Full")).toEqual([true, true, true, true]);
    expect(quarters("First")).toEqual([true, true, false, false]);
    expect(quarters("Second")).toEqual([false, false, true, true]);
    expect(quarters("A")).toEqual([true, false, false, false]);
    expect(quarters("D")).toEqual([false, false, false, true]);
  });
});

describe("order by part of term", () => {
  it("puts blocks that start together left to right: full, first, A, B, second, C, D", () => {
    const shuffled = ["D", "Second", "A", "Full", "C", "B", "First"];
    const g = weekGrids(make(shuffled.map((p, i) => sec("MATH", String(100 + i), "A", { TermPart: p, ...mt("M", "9:00", "50", `NH ${i}`) }))), opts());
    const byLane = [...g.grids[0]!.blocks].sort((a, b) => a.lane - b.lane).map((b) => shuffled[Number(b.title.split(" ")[1]) - 100]);
    expect(byLane).toEqual(["Full", "First", "A", "B", "Second", "C", "D"]);
  });
  it("lists unscheduled sections in the same order", () => {
    const g = weekGrids(make(["B", "Full", "First"].map((p, i) => sec("MATH", String(200 + i), "A", { TermPart: p }))), opts());
    expect(g.grids[0]!.unscheduled.map((u) => u.label.split(" ")[1])).toEqual(["201", "202", "200"]);
  });
});
