import { z } from "zod";

/** Day letters in canonical order. `R` is Thursday, `U` Sunday. */
export const DAY_ORDER = "MTWRFSU";

/** Reserved pseudo-term: the full academic year; overlaps every term. */
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

/** One course in a cohort constraint group (spec §2.6). */
export const constraintSchema = z.object({
  constraint: z.string().min(1),
  /** `Prefix CourseNumber`, e.g. `MATH 231`. */
  course: z.string().min(1),
  comment: str,
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

export interface Settings {
  terms: TermDef[];
  parts: PartDef[];
  /** Terms across which `AY` non-teaching load is shown, split evenly (spec §2.3). */
  spreadTerms: string[];
  /** Room-column values that are not rooms and never conflict (compared case-insensitively). */
  nonRooms: string[];
}

export interface Meta {
  name: string;
  notes: string;
  version: string;
}

export interface Schedule {
  meta: Meta;
  settings: Settings;
  sessions: Session[];
  crossListings: CrossListing[];
  nonTeaching: NonTeaching[];
  constraints: Constraint[];
}

export const DEFAULT_TERMS: TermDef[] = [
  { code: "FA", name: "Fall" },
  { code: "WI", name: "Winter Intensive" },
  { code: "SP", name: "Spring" },
  { code: "SU", name: "Summer" },
];

/** Semester parts, used by every term that does not define its own (spec §2.1). */
export const DEFAULT_PARTS: PartDef[] = [
  { code: "Full", name: "Full term", startWeek: 1, endWeek: 16 },
  { code: "First", name: "First half", startWeek: 1, endWeek: 8 },
  { code: "Second", name: "Second half", startWeek: 9, endWeek: 16 },
  { code: "A", name: "Intensive A", startWeek: 1, endWeek: 4 },
  { code: "B", name: "Intensive B", startWeek: 5, endWeek: 8 },
  { code: "C", name: "Intensive C", startWeek: 9, endWeek: 12 },
  { code: "D", name: "Intensive D", startWeek: 13, endWeek: 16 },
];

/** Parts of terms that do not follow the semester grid: the 2-week winter intensive. */
export const DEFAULT_TERM_PARTS: PartDef[] = [{ term: "WI", code: "Full", name: "Winter intensive", startWeek: 1, endWeek: 2 }];

export const defaultSettings = (): Settings => ({
  terms: DEFAULT_TERMS.map((t) => ({ ...t })),
  parts: [...DEFAULT_PARTS, ...DEFAULT_TERM_PARTS].map((p) => ({ ...p })),
  spreadTerms: ["FA", "SP"],
  nonRooms: ["Off Campus", "Online", "TBD"],
});
export const emptyMeta = (): Meta => ({ name: "", notes: "", version: "" });
export const emptySchedule = (): Schedule => ({
  meta: emptyMeta(),
  settings: defaultSettings(),
  sessions: [],
  crossListings: [],
  nonTeaching: [],
  constraints: [],
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
