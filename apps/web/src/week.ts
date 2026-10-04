import {
  conflictedSessions,
  nonStandardSessions,
  courseDisplayName,
  departmentOf,
  findConflicts,
  findRuleViolations,
  levelOf,
  listingsOf,
  partsFor,
  weeksOf,
  weeksOverlap,
  type PartDef,
  type Schedule,
  type Session,
} from "@schedulizer/core";
import { timeRange } from "./model";

export type GridKind = "dept" | "faculty" | "room";
export type ColorBy = "prefix" | "level" | "instructor" | "group" | "method" | "department";

/** What each way of coloring is called, in the order the menu lists them. */
export const COLOR_BY: { value: ColorBy; label: string }[] = [
  { value: "prefix", label: "Prefix" },
  { value: "level", label: "Course level" },
  { value: "instructor", label: "Instructor" },
  { value: "department", label: "Department" },
  { value: "group", label: "Group" },
  { value: "method", label: "Instructional method" },
];

export interface Block {
  /** Unique within a grid. */
  key: string;
  sectionId: string;
  /** Day letter of this column (a meeting on MWF makes three blocks). */
  day: string;
  start: number;
  end: number;
  /** `MUSC 105 A`, with the part of term when it is not the full term. */
  title: string;
  /**
   * Which quarters of the term the section meets, for the four dots: the term's full weeks are
   * split into four equal parts (a half term fills two dots, a full term all four).
   */
  quarters: boolean[];
  /** Rank of the section's part of term (full first), to order blocks that start together. */
  order: number;
  /** `MUSC 102A` — the primary listing only, for crowded blocks. */
  short: string;
  /** A second line: who or where, depending on the grid. */
  sub: string;
  /** Everything, for the hover text. */
  detail: string;
  conflict: boolean;
  /** At a time that is not a standard time (shown in orange, unless it is also in a conflict). */
  nonStandard: boolean;
  /** The block's color; undefined when the field being colored by is missing (drawn gray). */
  hue: number | undefined;
  /** What the color stands for (a prefix, an instructor …); empty when missing. */
  colorValue: string;
  /** Position among side-by-side blocks that overlap in time, and how many share the space. */
  lane: number;
  lanes: number;
}

export interface Unscheduled {
  sectionId: string;
  label: string;
}

export interface Grid {
  id: string;
  title: string;
  /** Day letters shown, Monday first (Saturday and Sunday only if something meets then). */
  days: string[];
  /** Time axis, minutes since midnight, on whole hours. */
  startMin: number;
  endMin: number;
  blocks: Block[];
  /** Sections in this grid with no scheduled time. */
  unscheduled: Unscheduled[];
}

export interface WeekOptions {
  year: string;
  term: string;
  kind: GridKind;
  colorBy: ColorBy;
  /**
   * Show only sections that meet during this part of the term (a part code such as `First` or
   * `C`): those whose weeks overlap the part's weeks, so `First` shows Full, First, A and B.
   * Absent, or the full term, shows everything.
   */
  part?: string;
  /** Show only this grid: an instructor's or a room's name (faculty and room grids). */
  only?: string;
  /** Department grid: only this prefix. */
  prefix?: string;
  /**
   * Department grid: only sections whose value for `by` (what the grid can be colored by) is one of `values`;
   * an empty string stands for "missing". No values means every section.
   */
  filter?: { by: ColorBy; values: string[] };
}

export interface WeekResult {
  grids: Grid[];
  /** The parts this term offers, for the part selector (hide it when there is only one). */
  parts: PartDef[];
  /** Choices for the instructor / room selector, for the grid kind asked for. */
  choices: string[];
  /** Room grids: meetings left out because they name no room (or a non-room such as "Online"). */
  withoutRoom: number;
  /** The values the filter can pick from (for `filter.by` or, without a filter, the color-by field), and whether some sections have none. */
  filterValues: string[];
  filterMissing: boolean;
}

/** What a section has for each thing the grids can be colored (or filtered) by; empty when it has nothing. */
export function colorValueOf(schedule: Schedule, by: ColorBy, s: Session): string {
  switch (by) {
    case "level": return levelOf(s);
    case "instructor": return s.faculty[0]?.name ?? "";
    case "group": return s.group.trim();
    case "method": return s.instructionalMethod.trim();
    case "department": return departmentOf(schedule.meta, s);
    default: return s.prefix;
  }
}

const DAY_ORDER = "MTWRFSU";
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** A stable hue (0–359) for a string, so the same course keeps the same color. */
export function hueOf(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

/**
 * Put blocks that overlap in time (within one day) side by side: each gets a lane
 * and the number of lanes its cluster needs. Blocks that merely touch (one ends as
 * the next starts) do not overlap. Mutates and returns the blocks.
 */
export function layoutLanes<T extends { start: number; end: number; lane: number; lanes: number; order?: number }>(blocks: T[]): T[] {
  // Blocks starting together go left to right by `order` (term part: full, first, A, B, second, C, D).
  const sorted = [...blocks].sort((a, b) => a.start - b.start || (a.order ?? 0) - (b.order ?? 0) || a.end - b.end);
  let cluster: T[] = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];
  const flush = () => {
    for (const b of cluster) b.lanes = Math.max(1, laneEnds.length);
    cluster = [];
    laneEnds.length = 0;
  };
  for (const b of sorted) {
    if (cluster.length && b.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= b.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = b.end;
    b.lane = lane;
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  flush();
  return blocks;
}

/**
 * The week grids for one academic year and term: a single department grid, or one
 * grid per instructor, or one per room (or just the one named in `only`).
 */
export function weekGrids(schedule: Schedule, o: WeekOptions): WeekResult {
  const violations = findRuleViolations(schedule);
  const flagged = conflictedSessions(findConflicts(schedule), violations);
  const odd = nonStandardSessions(violations);
  const nonRooms = new Set(schedule.settings.nonRooms.map(norm));
  const termAll = schedule.sessions.filter((s) => s.academicYear === o.year && s.term === o.term);
  const parts = partsFor(schedule.settings, o.term);

  // Sections that meet during the chosen part of the term (unknown parts are kept: an import error elsewhere).
  const wanted = o.part ? weeksOf(schedule.settings, o.term, o.part) : undefined;
  const inTerm = wanted
    ? termAll.filter((s) => {
        const w = weeksOf(schedule.settings, s.term, s.termPart);
        return !w || weeksOverlap(w, wanted);
      })
    : termAll;

  const firstOf = new Map<string, Session>();
  for (const s of inTerm) if (!firstOf.has(s.sectionId)) firstOf.set(s.sectionId, s);
  const courseName = (s: Session) => courseDisplayName(listingsOf(s, schedule.crossListings));

  const colorKey = (s: Session): string => colorValueOf(schedule, o.colorBy, s);
  // A section with nothing in the field being colored by is gray, so "missing" is easy to spot.
  const hueFor = (s: Session) => (colorKey(s) === "" ? undefined : hueOf(colorKey(s)));
  const label = (s: Session) => `${courseName(s)} ${s.section}`;
  const quartersOf = (s: Session): boolean[] => {
    const full = weeksOf(schedule.settings, s.term, "Full") ?? [1, 16];
    const mine = weeksOf(schedule.settings, s.term, s.termPart);
    if (!mine) return [true, true, true, true];
    const len = full[1] - full[0] + 1;
    return [0, 1, 2, 3].map((i) => {
      const from = full[0] + Math.floor((i * len) / 4);
      const to = full[0] + Math.floor(((i + 1) * len) / 4) - 1;
      return mine[0] <= Math.max(to, from) && from <= mine[1];
    });
  };
  const partRank = (s: Session) => {
    const i = partsFor(schedule.settings, s.term).findIndex((p) => p.code.toLowerCase() === s.termPart.toLowerCase());
    return i === -1 ? 99 : i;
  };
  const partTag = (s: Session) => (s.termPart !== "Full" ? ` · ${s.termPart}` : "");

  const blockFor = (s: Session, day: string, sub: string): Block => ({
    key: `${s.sectionId}:${day}:${s.start}:${s.duration}:${s.room}`,
    sectionId: s.sectionId,
    day,
    start: s.start!,
    end: Math.min(1440, s.start! + s.duration!),
    title: label(s),
    quarters: quartersOf(s),
    order: partRank(s),
    short: `${s.prefix} ${s.courseNumber}${s.section}`,
    sub,
    detail: [`${label(s)}${partTag(s)}`, s.shortTitle, s.faculty.map((f) => f.name).join(", "), `${[...s.days].join("")} ${timeRange(s)}`, s.room].filter(Boolean).join("\n"),
    conflict: flagged.has(s),
    nonStandard: odd.has(s),
    hue: hueFor(s),
    colorValue: colorKey(s),
    lane: 0,
    lanes: 1,
  });

  const scheduled = (s: Session) => s.days !== "" && s.start !== undefined && s.duration !== undefined;

  /** Turn a set of sessions into a grid. */
  const gridOf = (id: string, title: string, sessions: Session[], subOf: (s: Session) => string, sectionIds: string[]): Grid => {
    const blocks: Block[] = [];
    // A section listing the same meeting twice (say, two Thursday rows with one time and room) is drawn once; it also keeps
    // every block's key unique, which the page needs to draw and remove blocks correctly.
    const drawn = new Set<string>();
    for (const s of sessions) if (scheduled(s)) for (const d of s.days) {
      const b = blockFor(s, d, subOf(s));
      if (drawn.has(b.key)) continue;
      drawn.add(b.key);
      blocks.push(b);
    }
    const used = new Set(blocks.map((b) => b.day));
    const days = [...DAY_ORDER].filter((d) => "MTWRF".includes(d) || used.has(d));
    for (const d of days) layoutLanes(blocks.filter((b) => b.day === d));
    const starts = blocks.map((b) => b.start);
    const ends = blocks.map((b) => b.end);
    const startMin = Math.min(480, starts.length ? Math.floor(Math.min(...starts) / 60) * 60 : 480);
    const endMin = Math.max(1020, ends.length ? Math.ceil(Math.max(...ends) / 60) * 60 : 1020);
    const withTime = new Set(sessions.filter(scheduled).map((s) => s.sectionId));
    const unscheduled = sectionIds.filter((sid) => !withTime.has(sid)).sort((a, b) => partRank(firstOf.get(a)!) - partRank(firstOf.get(b)!)).map((sid) => ({ sectionId: sid, label: label(firstOf.get(sid)!) }));
    return { id, title, days, startMin, endMin, blocks, unscheduled };
  };

  const instructors = (s: Session) => s.faculty.map((f) => f.name).join(", ");

  if (o.kind === "dept") {
    const by = o.filter?.by ?? o.colorBy;
    const wantedValues = o.filter && o.filter.values.length > 0 ? new Set(o.filter.values) : undefined;
    const sessions = inTerm.filter((s) => (!o.prefix || s.prefix === o.prefix) && (!wantedValues || wantedValues.has(colorValueOf(schedule, by, s))));
    const ids = [...new Set(sessions.map((s) => s.sectionId))];
    const everyValue = termAll.map((s) => colorValueOf(schedule, by, s));
    return {
      grids: [gridOf("dept", "Department", sessions, instructors, ids)],
      parts,
      choices: [...new Set(termAll.map((s) => s.prefix))].sort(natural),
      withoutRoom: 0,
      filterValues: [...new Set(everyValue.filter((v) => v !== ""))].sort(natural),
      filterMissing: everyValue.includes(""),
    };
  }

  if (o.kind === "faculty") {
    // The choices come from the whole term, so a part filter never removes the selected person.
    const people = new Map<string, string>(); // key → display name
    for (const s of termAll) for (const f of s.faculty) if (f.name !== "*" && !people.has(norm(f.name))) people.set(norm(f.name), f.name.trim());
    const choices = [...people.values()].sort(natural);
    const grids = (o.only ? [o.only] : choices)
      .map((name) => {
        const mine = inTerm.filter((s) => s.faculty.some((f) => norm(f.name) === norm(name)));
        return gridOf(`f:${norm(name)}`, name, mine, (s) => s.room, [...new Set(mine.map((s) => s.sectionId))]);
      })
      .filter((g) => o.only || g.blocks.length > 0 || g.unscheduled.length > 0);
    return { grids, parts, choices, withoutRoom: 0, filterValues: [], filterMissing: false };
  }

  // rooms
  const rooms = new Map<string, string>();
  for (const s of termAll) {
    if (!scheduled(s)) continue;
    const k = norm(s.room);
    if (k !== "" && !nonRooms.has(k) && !rooms.has(k)) rooms.set(k, s.room.trim());
  }
  const withoutRoom = inTerm.filter((s) => scheduled(s) && (norm(s.room) === "" || nonRooms.has(norm(s.room)))).length;
  const choices = [...rooms.values()].sort(natural);
  const grids = (o.only ? [o.only] : choices)
    .map((name) => gridOf(`r:${norm(name)}`, name, inTerm.filter((s) => norm(s.room) === norm(name)), instructors, []))
    .filter((g) => o.only || g.blocks.length > 0);
  return { grids, parts, choices, withoutRoom, filterValues: [], filterMissing: false };
}

/** `8 AM`, `1 PM`: a label for a whole-hour mark on the time axis. */
export const hourLabel = (minutes: number) => `${Math.floor(minutes / 60) % 12 || 12} ${minutes < 720 || minutes >= 1440 ? "AM" : "PM"}`;

/** Years and terms that have sections, for the selectors (terms in configured order). */
export function termsFor(schedule: Schedule, year: string): { code: string; name: string }[] {
  const used = new Set(schedule.sessions.filter((s) => s.academicYear === year).map((s) => s.term));
  return schedule.settings.terms.filter((t) => used.has(t.code));
}

/** One schedule's contribution to a group of grids (a department, an instructor, a room). */
export interface GridItem {
  scheduleId: string;
  scheduleName: string;
  /** Absent when this schedule has nothing for the group (the person or room does not appear in it). */
  grid: Grid | undefined;
}

export interface GridGroup {
  /** The instructor's or room's name; empty for the department grid. */
  title: string;
  items: GridItem[];
}

/**
 * Arrange the grids of several schedules for display: one group per instructor or room
 * (names in natural order, taken from every schedule), each holding that group's grid
 * from every schedule — or nothing, which is itself worth seeing when comparing. The
 * department view is one group. With a single schedule this is just its grids.
 */
export function groupGrids(results: { id: string; name: string; result: WeekResult }[], kind: GridKind, only?: string): GridGroup[] {
  const itemFor = (r: (typeof results)[number], title: string): GridItem => ({
    scheduleId: r.id,
    scheduleName: r.name,
    grid: r.result.grids.find((g) => g.title === title || (kind === "dept" && title === "")),
  });
  if (kind === "dept") return [{ title: "", items: results.map((r) => itemFor(r, "")) }];
  const titles = only ? [only] : [...new Set(results.flatMap((r) => r.result.grids.map((g) => g.title)))].sort(natural);
  return titles.map((title) => ({ title, items: results.map((r) => itemFor(r, title)) }));
}
