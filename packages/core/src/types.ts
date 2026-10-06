import { z } from "zod";
import { DEFAULT_NON_ROOMS, DEFAULT_PARTS, DEFAULT_SPREAD_TERMS, DEFAULT_TERM_PARTS, DEFAULT_TERMS } from "./settings.defaults.generated.js";

/** Day letters in canonical order. `R` is Thursday, `U` Sunday. */
export const DAY_ORDER = "MTWRFSU";

/** Reserved pseudo-term: the full academic year. Valid only for non-teaching load (spec §2.3). */
export const AY = "AY";

export const instructorSchema = z.object({
  name: z.string().min(1),
  /** Explicit load share, written `Name (n)` in files. */
  load: z.number().nonnegative().optional(),
});
export type Instructor = z.infer<typeof instructorSchema>;

const optNum = z.number().nonnegative().optional();
const optInt = z.number().int().nonnegative().optional();
const str = z.string().default("");

/**
 * One meeting of one section. Section-level fields repeat on every row of a
 * section; rows are tied together by `sectionId`.
 */
export const sessionSchema = z
  .object({
    sectionId: z.string().min(1),
    department: str,
    academicYear: z.string().min(1),
    term: z.string().min(1),
    /** A part code valid for the section's term (see `partsFor`); default `Full`. */
    termPart: z.string().min(1).default("Full"),
    prefix: z.string().min(1),
    courseNumber: z.string().min(1),
    section: z.string().min(1),
    faculty: z.array(instructorSchema).default([]),
    facultyLoad: optNum,
    minimumCredits: optNum,
    maximumCredits: optNum,
    shortTitle: str,
    instructionalMethod: str,
    courseLevel: str,
    group: str,
    deliveryMode: str,
    /** One of the core tags (`CORE_TAGS`), or blank. */
    coreTag: str,
    /** The course title is a special topic, a seminar or the like that stands for different content each time it is offered. */
    specialTopic: z.boolean().default(false),
    comment: str,
    enrollment: optInt,
    enrollmentDay10: optInt,
    /** Day letters in canonical order; empty = unscheduled. */
    days: z.string().regex(/^[MTWRFSU]*$/),
    /** Minutes since midnight. */
    start: z.number().int().min(0).max(1439).optional(),
    /** Minutes. */
    duration: z.number().int().positive().optional(),
    room: str,
    /** Unrecognized columns, preserved on round trip. */
    extra: z.record(z.string(), z.string()).default({}),
    /** Only on the copies in a merged schedule: the schedule the section came from. Rules apply within one scope. Never saved. */
    scope: z.string().optional(),
  })
  .refine(
    (s) => (s.days === "") === (s.start === undefined) && (s.days === "") === (s.duration === undefined),
    { message: "a meeting needs days, a start time and a duration together (or none of them)" },
  );
export type Session = z.infer<typeof sessionSchema>;

export const crossListingSchema = z.object({
  sectionId: z.string().min(1),
  prefix: z.string().min(1),
  courseNumber: z.string().min(1),
});
export type CrossListing = z.infer<typeof crossListingSchema>;

export const nonTeachingSchema = z.object({
  academicYear: z.string().min(1),
  faculty: z.string().min(1),
  activity: z.string().min(1),
  term: z.string().min(1),
  load: z.number(),
  comment: str,
  extra: z.record(z.string(), z.string()).default({}),
});
export type NonTeaching = z.infer<typeof nonTeachingSchema>;

/**
 * One row of a constraint (spec §2.6). Rows with the same `constraint` name make one rule;
 * the rule-level fields (everything but course, section, instructor and comment) repeat on
 * every row, and a blank cell on a later row inherits the first row's value on import.
 *
 * - `takeable`: a student must be able to take `count` (default: all) of the listed courses,
 *   choosing one section of each, with no two overlapping. With `choose` "some", some set of
 *   `count` courses must be takeable together; with "any", every set of `count` courses must be. `course` is a pattern
 *   (`MUSC 234`, `MUSC 3*`); `section` names one section.
 * - `standard`: changes to the department's standard days, start times and lengths
 * - `subset`: lets the courses it names meet on only some of the days of a standard time (T alone where TR is standard)
 *   (`DEFAULT_STANDARD_TIMES`, which every section is always checked against) for the sections named by
 *   `course` patterns (`*` = every course). Rows with an `action` are the changes; the rest name the courses.
 * - `collide`: the sections the `course` patterns name (with an optional `section`) may overlap one another in
 *   instructor, room or time without being reported as a conflict (a seminar run as a 200- and a 300-level course)
 * - `consecutive`: each instructor named should teach at most (or at least) `count` consecutive
 *   classes; one class follows another when it starts 0 to `gap` minutes after the other ends.
 * - `window`: the sections named (by `course` pattern or `instructor`) should / should not meet
 *   in the interval `from`–`to` on any / all of `days`; with `count`, that many of them must
 *   satisfy the rule instead of every one.
 */
export const constraintSchema = z.object({
  constraint: z.string().min(1),
  type: z.enum(["takeable", "window", "standard", "subset", "collide", "consecutive"]).default("takeable"),
  /** `Prefix CourseNumber` pattern, where `*` matches anything: `MUSC 234`, `MUSC 3*`, `MUSC *`. */
  course: str,
  /** A section letter to name one section of the course; blank = every section. */
  section: str,
  /** Window rules: sections taught by this person. */
  instructor: str,
  /** `takeable`: how many courses (blank = all of them); `window`: at least this many sections must satisfy it (blank = every one). */
  count: z.number().int().positive().optional(),
  /** `standard`: this row allows or disallows a meeting pattern (days, `duration`, `starts`) for the courses the rule names. */
  action: z.enum(["", "allow", "disallow"]).default(""),
  /** `standard` change rows: the length in minutes; blank on a "disallow" row = any length. */
  duration: z.number().int().positive().optional(),
  /** `standard` change rows: start times, minutes since midnight; empty on a "disallow" row = any start. */
  starts: z.array(z.number().int().min(0).max(1439)).default([]),
  /** `consecutive`: the rule is about at most / at least `count` consecutive classes. */
  bound: z.enum(["atMost", "atLeast"]).default("atMost"),
  /** `consecutive`: classes are consecutive when one starts no more than this many minutes after the other ends. */
  gap: z.number().int().min(0).max(240).default(20),
  /** `takeable` with a `count`: some set of that many courses must work together, or every set must. */
  choose: z.enum(["some", "any"]).default("some"),
  /** Only these terms (codes separated by commas or spaces); blank = every term. */
  term: str,
  /** Window rules: day letters; blank = Monday to Friday. */
  days: z.string().regex(/^[MTWRFSU]*$/).default(""),
  /** Window rules: the rule is about any / all of `days`. */
  dayRule: z.enum(["any", "all"]).default("any"),
  /** Window rules: the interval, in minutes since midnight. */
  from: z.number().int().min(0).max(1440).optional(),
  to: z.number().int().min(0).max(1440).optional(),
  /** Window rules: should meet in the interval, or should not. */
  should: z.enum(["should", "should not"]).default("should not"),
  /** Window rules: "meets in the interval" means overlapping it, or lying entirely within it. Blank: overlapping for "should not", within for "should". */
  meets: z.enum(["", "overlaps", "within"]).default(""),
  comment: str,
  /** Only on the copies in a merged schedule: the schedule the rule came from. It applies to sections of the same scope. Never saved. */
  scope: z.string().optional(),
});
export type Constraint = z.infer<typeof constraintSchema>;

export interface TermDef {
  code: string;
  name: string;
}

/** A slice of a term, in weeks of that term (inclusive). `term` blank = default for any term without its own parts. */
export interface PartDef {
  term?: string;
  code: string;
  name: string;
  startWeek: number;
  endWeek: number;
}

/** One standard meeting pattern: these days, this long, starting at any of these times (minutes since midnight). */
export interface StandardTime {
  days: string;
  duration: number;
  starts: number[];
}

export interface Settings {
  terms: TermDef[];
  parts: PartDef[];
  /** Terms across which `AY` non-teaching load is shown, split evenly (spec §2.3). */
  spreadTerms: string[];
  /** Room-column values that are not rooms and never conflict (compared case-insensitively). */
  nonRooms: string[];
}

export const DEFAULT_SAVE_AS = "schedulizer";

export interface Meta {
  name: string;
  /** A short name to show in place of the (often long) file name; blank = use the file name. */
  nickname: string;
  /** Base of the file name when exporting; blank = `DEFAULT_SAVE_AS`. */
  saveAs: string;
  /** Add the date and time to the exported file name. */
  timestamp: boolean;
  notes: string;
  version: string;
  /** The department of every section that has none of its own (the Department box under More details); blank = none. */
  defaultDepartment: string;
}

/** A section's department: its own if it has one, else the schedule's default. */
export const departmentOf = (meta: Pick<Meta, "defaultDepartment">, s: { department: string }): string => (s.department ?? "").trim() || (meta.defaultDepartment ?? "").trim();

/**
 * The level a course number implies: 100, 200, 300 … from its first digit (`MUSC 234` → `200`); blank when it has no digit.
 * Used for a section that does not give a level of its own.
 */
export function inferredLevel(courseNumber: string): string {
  const d = /\d/.exec(courseNumber)?.[0];
  return d ? `${d}00` : "";
}

/** A section's course level: its own if it has one, else the one its course number implies. */
export const levelOf = (s: { courseLevel: string; courseNumber: string }): string => (s.courseLevel ?? "").trim() || inferredLevel(s.courseNumber);

/**
 * A named way of comparing schedules (see `compare.ts`), saved in the schedule's file: which columns are grouped by and which
 * aggregated (every other column is ignored), and whether a row is a section or a section-and-instructor.
 */
export interface SavedComparison {
  name: string;
  rows: "section" | "instructor";
  /** Column keys to group by, in the order listed. */
  group: string[];
  /** Column keys to aggregate (the row count is `Rows`). */
  aggregate: string[];
}

export interface Schedule {
  meta: Meta;
  settings: Settings;
  sessions: Session[];
  crossListings: CrossListing[];
  nonTeaching: NonTeaching[];
  constraints: Constraint[];
  /** Comparisons saved by name (the Compare tab's own list); absent in files saved by earlier versions. */
  comparisons: SavedComparison[];
}

// The default terms and parts live in config/settings.yaml; tools/gen-settings.mjs generates this module from it.
export { DEFAULT_PARTS, DEFAULT_STANDARD_TIMES, DEFAULT_TERM_PARTS, DEFAULT_TERMS } from "./settings.defaults.generated.js";

export const defaultSettings = (): Settings => ({
  terms: DEFAULT_TERMS.map((t) => ({ ...t })),
  parts: [...DEFAULT_PARTS, ...DEFAULT_TERM_PARTS].map((p) => ({ ...p })),
  spreadTerms: [...DEFAULT_SPREAD_TERMS],
  nonRooms: [...DEFAULT_NON_ROOMS],
});
export const emptyMeta = (): Meta => ({ name: "", nickname: "", saveAs: DEFAULT_SAVE_AS, timestamp: true, notes: "", version: "", defaultDepartment: "" });
export const emptySchedule = (): Schedule => ({
  meta: emptyMeta(),
  settings: defaultSettings(),
  sessions: [],
  crossListings: [],
  nonTeaching: [],
  constraints: [],
  comparisons: [],
});

export interface Issue {
  severity: "error" | "warning";
  sheet: string;
  /** 1-based spreadsheet row (header is row 1). */
  row?: number;
  message: string;
}

/** A parsed sheet row: header → cell text. */
export type Rec = Record<string, string>;
