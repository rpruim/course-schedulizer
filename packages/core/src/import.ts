import { z } from "zod";
import { parseDays, parseFaculty, parseTime } from "./format.js";
import { sectionShares } from "./load.js";
import { partsFor, splitTermCode } from "./terms.js";
import {
  AY,
  DEFAULT_PARTS,
  DEFAULT_TERM_PARTS,
  constraintSchema,
  crossListingSchema,
  defaultSettings,
  emptyMeta,
  nonTeachingSchema,
  sessionSchema,
  type Constraint,
  type CrossListing,
  type Issue,
  type Meta,
  type NonTeaching,
  type PartDef,
  type Rec,
  type Schedule,
  type Session,
  type Settings,
} from "./types.js";

/** Canonical Sessions columns, in file order. */
export const SESSION_COLUMNS = [
  "SectionId", "Department", "AcademicYear", "Term", "TermPart", "Prefix", "CourseNumber", "Section",
  "Faculty", "FacultyLoad", "MinimumCredits", "MaximumCredits", "MeetingDays", "StartTime",
  "MeetingDuration", "Classroom", "ShortTitle", "InstructionalMethod", "CourseLevel", "Group", "DeliveryMode",
  "Comment", "Enrollment", "EnrollmentDay10",
] as const;
export const CROSSLISTING_COLUMNS = ["SectionId", "Prefix", "CourseNumber"] as const;
export const NONTEACHING_COLUMNS = ["AcademicYear", "Faculty", "Activity", "Term", "Load", "Comment"] as const;
export const CONSTRAINT_COLUMNS = ["Constraint", "Course", "Section", "Comment"] as const;

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Columns whose newlines mean something (one value per meeting): keep a trailing empty line, trim line by line later. */
const LINE_COLUMNS = new Set(["MeetingDays", "StartTime", "MeetingDuration", "Classroom"]);

/** Split a record into known columns (canonical names) and the rest. */
function split(rec: Rec, known: readonly string[]): { known: Rec; extra: Rec } {
  const byKey = new Map(known.map((k) => [key(k), k]));
  const out = { known: {} as Rec, extra: {} as Rec };
  for (const [h, v] of Object.entries(rec)) {
    const canon = byKey.get(key(h));
    if (canon) out.known[canon] = LINE_COLUMNS.has(canon) ? v.replace(/\r/g, "") : v.trim();
    else if (h.trim() !== "" && v.trim() !== "") out.extra[h.trim()] = v.trim();
  }
  return out;
}

const lines = (s: string | undefined) => (s ?? "").split(/\r?\n/);

class Reporter {
  issues: Issue[] = [];
  constructor(private sheet: string) {}
  add(severity: Issue["severity"], row: number, message: string) {
    this.issues.push({ severity, sheet: this.sheet, row, message });
  }
  zod(row: number, err: z.ZodError) {
    for (const i of err.issues) {
      const path = i.path.join(".");
      this.add("error", row, path ? `${path}: ${i.message}` : i.message);
    }
  }
}

function num(r: Reporter, row: number, label: string, text: string | undefined): number | undefined {
  if (!text) return undefined;
  const n = Number(text);
  if (!Number.isFinite(n)) {
    r.add("error", row, `${label}: "${text}" is not a number`);
    return undefined;
  }
  return n;
}

interface Meeting {
  days: string;
  start?: number;
  duration?: number;
  room: string;
}

/**
 * One record → its meetings (the compact form). Each of MeetingDays, StartTime,
 * MeetingDuration and Classroom holds either ONE value or n newline-separated
 * values, with the same n in every column that has more than one; a single value
 * is repeated for each of the n meetings. A blank cell is one (empty) value.
 * `00:00` for `0` minutes means "no time".
 *
 * Leniency for old exports, which joined rooms with ", ": if only Classroom has
 * a single line and splitting it on commas gives exactly n parts, it is split.
 */
function meetings(r: Reporter, row: number, k: Rec): Meeting[] {
  const names = ["MeetingDays", "StartTime", "MeetingDuration", "Classroom"] as const;
  const cols = names.map((c) => lines(k[c]));
  const n = Math.max(...cols.map((c) => c.length));
  const rooms = cols[3]!;
  if (n > 1 && rooms.length === 1) {
    const parts = rooms[0]!.split(/\s*,\s*/);
    if (parts.length === n) cols[3] = parts;
  }
  const bad = names.filter((_, i) => cols[i]!.length !== 1 && cols[i]!.length !== n);
  if (bad.length) {
    r.add("error", row, `${bad.join(", ")} must hold one value or ${n} newline-separated values (like the other meeting columns), not ${bad.map((c) => cols[names.indexOf(c)]!.length).join(", ")}`);
    return [];
  }
  const out: Meeting[] = [];
  for (let i = 0; i < n; i++) {
    const [d, t, du, room] = cols.map((c) => (c.length === 1 ? c[0]! : c[i]!).trim()) as [string, string, string, string];
    const days = parseDays(d);
    const start = parseTime(t);
    const duration = du === "" ? undefined : Number(du);
    if (days === null) r.add("error", row, `MeetingDays: "${d}" is not a set of day letters (M T W R F S U)`);
    if (start === null) r.add("error", row, `StartTime: "${t}" is not a time`);
    if (duration !== undefined && !Number.isFinite(duration)) r.add("error", row, `MeetingDuration: "${du}" is not a number`);
    // "No meeting" = no days and no real time. `00:00` for 0 minutes is how the
    // old export said that. Anything partial is passed on so validation flags it.
    const none = !days && (start === undefined || start === 0) && (duration === undefined || duration === 0);
    out.push(
      none
        ? { days: "", room }
        : {
            days: days ?? "",
            start: typeof start === "number" ? start : undefined,
            duration: duration !== undefined && Number.isFinite(duration) ? duration : undefined,
            room,
          },
    );
  }
  return out;
}

/** Listings from a Prefix/CourseNumber pair of (possibly multi-line) cells; primary first. */
function listings(r: Reporter, row: number, k: Rec): { prefix: string; courseNumber: string }[] {
  const list = (s: string | undefined) => (s ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
  const p = list(k.Prefix);
  const c = list(k.CourseNumber);
  if (p.length === 0 || c.length === 0) return [];
  const n = Math.max(p.length, c.length);
  if ((p.length !== 1 && p.length !== n) || (c.length !== 1 && c.length !== n)) {
    r.add("error", row, `Prefix has ${p.length} lines but CourseNumber has ${c.length}`);
    return [];
  }
  return Array.from({ length: n }, (_, i) => ({ prefix: p[p.length === 1 ? 0 : i]!, courseNumber: c[c.length === 1 ? 0 : i]! }));
}

export const deriveSectionId = (s: Pick<Session, "academicYear" | "term" | "prefix" | "courseNumber" | "section">) =>
  `${s.academicYear}-${s.term}-${s.prefix}${s.courseNumber}-${s.section}`;

const SECTION_FIELDS = [
  "department", "academicYear", "term", "termPart", "prefix", "courseNumber", "section", "faculty",
  "facultyLoad", "minimumCredits", "maximumCredits", "shortTitle", "instructionalMethod", "courseLevel",
  "group", "deliveryMode", "comment", "enrollment", "enrollmentDay10", "extra",
] as const;

export interface SessionsImport {
  sessions: Session[];
  crossListings: CrossListing[];
  /** Rows with no Prefix, CourseNumber or Section: the old export lists non-teaching load inline. */
  nonTeaching: NonTeaching[];
  issues: Issue[];
}

export interface ImportOptions {
  /** Fills a blank AcademicYear (old exports leave it blank on every row). */
  academicYear?: string;
}

/** Sessions sheet records (compact or multi-row form) → sessions, cross-listings, inline non-teaching rows. */
export function importSessions(records: Rec[], settings: Settings = defaultSettings(), opts: ImportOptions = {}): SessionsImport {
  const r = new Reporter("Sessions");
  const nonTeaching: NonTeaching[] = [];
  const terms = new Set(settings.terms.map((t) => t.code));
  const sessions: Session[] = [];
  const crossListings: CrossListing[] = [];
  const items: { row: number; section: Record<string, unknown>; ms: Meeting[] }[] = [];
  const seenListing = new Set<string>();
  const unassigned = new Map<string, number>();

  records.forEach((rec, idx) => {
    const row = idx + 2;
    const { known: k, extra } = split(rec, SESSION_COLUMNS);
    if (opts.academicYear && !k.AcademicYear) k.AcademicYear = opts.academicYear;

    // No course at all: a non-teaching load row (activity in InstructionalMethod).
    if (!k.Prefix && !k.CourseNumber && !k.Section) {
      const t = (k.Term ?? "").toUpperCase();
      const people = parseFaculty(k.Faculty ?? "");
      const before = r.issues.length;
      const who = `${k.Faculty || "no faculty"}: ${k.InstructionalMethod || "no activity"}`;
      if (!k.AcademicYear) r.add("error", row, `AcademicYear is blank (${who}); give a default academic year when opening the file`);
      if (!t) r.add("error", row, `a non-teaching row needs a Term (${who})`);
      else if (!terms.has(t) && t !== AY) r.add("error", row, `Term: "${k.Term}" is not a configured term (${[...terms].join(", ")}) (${who})`);
      if (!people.length) r.add("error", row, "a non-teaching row (no Prefix, CourseNumber or Section) needs a Faculty");
      if (!k.InstructionalMethod) r.add("error", row, "a non-teaching row needs its activity in InstructionalMethod");
      const load = num(r, row, "FacultyLoad", k.FacultyLoad) ?? 0;
      if (r.issues.length === before) {
        for (const share of sectionShares(load, people)) {
          const parsed = nonTeachingSchema.safeParse({ academicYear: k.AcademicYear ?? "", faculty: share.name, activity: k.InstructionalMethod, term: t, load: share.load, comment: k.Comment ?? "", extra });
          if (parsed.success) nonTeaching.push(parsed.data);
          else r.zod(row, parsed.error);
        }
      }
      return;
    }
    const ls = listings(r, row, k);
    const primary = ls[0] ?? { prefix: k.Prefix ?? "", courseNumber: k.CourseNumber ?? "" };
    // A combined code like FA1 fills both columns when TermPart is blank (or agrees).
    let term = (k.Term ?? "").toUpperCase();
    let impliedPart: string | undefined;
    if (term && !terms.has(term) && term !== AY) {
      const split = splitTermCode(settings, term);
      if (split) {
        if (!k.TermPart || k.TermPart.toLowerCase() === split.part.toLowerCase()) {
          term = split.term;
          impliedPart = split.part;
        } else r.add("error", row, `Term: "${k.Term}" means ${split.term} ${split.part}, but TermPart says "${k.TermPart}"`);
      }
    }
    if (term === AY) r.add("error", row, `Term: AY (full academic year) is only for non-teaching load; enter a year-long course as separate sections in each semester`);
    else if (term && !terms.has(term)) r.add("error", row, `Term: "${k.Term}" is not a configured term (${[...terms].join(", ")})`);
    const partCodes = partsFor(settings, term).map((p) => p.code);
    let part = impliedPart ?? "Full";
    if (k.TermPart) {
      const hit = partCodes.find((c) => c.toLowerCase() === k.TermPart!.toLowerCase());
      if (hit) part = hit;
      else {
        part = k.TermPart;
        if (term) r.add("error", row, `TermPart: "${k.TermPart}" is not defined for term ${term} (${partCodes.join(", ")})`);
      }
    }

    const base = {
      academicYear: k.AcademicYear ?? "",
      term,
      prefix: primary.prefix,
      courseNumber: primary.courseNumber,
      section: k.Section ?? "",
    };
    // Say plainly which required cells are blank, once per row (not once per meeting).
    const blank = ([["AcademicYear", base.academicYear], ["Term", term], ["Prefix", base.prefix], ["CourseNumber", base.courseNumber], ["Section", base.section]] as const)
      .filter(([, v]) => !v)
      .map(([name]) => name);
    if (blank.length) {
      for (const name of blank) {
        r.add("error", row, name === "AcademicYear" ? "AcademicYear is blank; give a default academic year when opening the file" : `${name} is blank`);
      }
      return;
    }
    let sectionId = k.SectionId || (base.academicYear && term && base.prefix && base.courseNumber && base.section ? deriveSectionId(base) : "");
    // Sections lettered "?" (the registrar assigns the letter) can be many in one course, so without an
    // explicit SectionId every record is its own section: the 2nd gets "-2" after its id, and so on.
    if (!k.SectionId && sectionId && base.section === "?") {
      const n = unassigned.get(sectionId) ?? 0;
      unassigned.set(sectionId, n + 1);
      if (n > 0) sectionId = `${sectionId}-${n + 1}`;
    }

    const section = {
      sectionId,
      department: k.Department ?? "",
      ...base,
      termPart: part,
      faculty: parseFaculty(k.Faculty ?? ""),
      facultyLoad: num(r, row, "FacultyLoad", k.FacultyLoad),
      minimumCredits: num(r, row, "MinimumCredits", k.MinimumCredits),
      maximumCredits: num(r, row, "MaximumCredits", k.MaximumCredits),
      shortTitle: k.ShortTitle ?? "",
      instructionalMethod: k.InstructionalMethod ?? "",
      courseLevel: k.CourseLevel ?? "",
      group: k.Group ?? "",
      deliveryMode: k.DeliveryMode ?? "",
      comment: k.Comment ?? "",
      enrollment: num(r, row, "Enrollment", k.Enrollment),
      enrollmentDay10: num(r, row, "EnrollmentDay10", k.EnrollmentDay10),
      extra,
    };

    items.push({ row, section, ms: meetings(r, row, k) });
    for (const l of ls.slice(1)) {
      const id = `${sectionId}|${l.prefix}|${l.courseNumber}`;
      if (!seenListing.has(id)) {
        seenListing.add(id);
        crossListings.push({ sectionId, ...l });
      }
    }
  });
  // Section-level fields repeat on every row of a section. A blank cell on a later
  // row inherits the section's other rows; two different non-blank values are an error.
  const isEmpty = (v: unknown) =>
    v === undefined || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length === 0);
  const merged = new Map<string, { row: number; fields: Record<string, unknown> }>();
  for (const it of items) {
    const id = it.section.sectionId as string;
    const m = merged.get(id);
    if (!m) {
      merged.set(id, { row: it.row, fields: { ...it.section } });
      continue;
    }
    const clash: string[] = [];
    for (const f of SECTION_FIELDS) {
      const a = m.fields[f];
      const b = it.section[f];
      if (isEmpty(b)) continue;
      if (isEmpty(a)) m.fields[f] = b;
      else if (JSON.stringify(a) !== JSON.stringify(b)) clash.push(f);
    }
    if (clash.length) r.add("error", it.row, `rows of section ${id} disagree on ${clash.join(", ")} (see row ${m.row})`);
  }
  for (const it of items) {
    const id = it.section.sectionId as string;
    for (const m of it.ms) {
      const parsed = sessionSchema.safeParse({ ...merged.get(id)!.fields, ...m });
      if (parsed.success) sessions.push(parsed.data);
      else r.zod(it.row, parsed.error);
    }
  }
  return { sessions, crossListings, nonTeaching, issues: r.issues };
}

/** CrossListings sheet records, merged into `existing` (duplicates ignored). */
export function importCrossListings(
  records: Rec[],
  sessions: Session[],
  existing: CrossListing[] = [],
): { crossListings: CrossListing[]; issues: Issue[] } {
  const r = new Reporter("CrossListings");
  const ids = new Set(sessions.map((s) => s.sectionId));
  const out = [...existing];
  const seen = new Set(out.map((l) => `${l.sectionId}|${l.prefix}|${l.courseNumber}`));
  records.forEach((rec, idx) => {
    const row = idx + 2;
    const { known: k } = split(rec, CROSSLISTING_COLUMNS);
    const parsed = crossListingSchema.safeParse({ sectionId: k.SectionId ?? "", prefix: k.Prefix ?? "", courseNumber: k.CourseNumber ?? "" });
    if (!parsed.success) return r.zod(row, parsed.error);
    const l = parsed.data;
    if (!ids.has(l.sectionId)) return r.add("error", row, `SectionId "${l.sectionId}" is not in Sessions`);
    const id = `${l.sectionId}|${l.prefix}|${l.courseNumber}`;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(l);
    }
  });
  return { crossListings: out, issues: r.issues };
}

export function importNonTeaching(records: Rec[], settings: Settings = defaultSettings(), opts: ImportOptions = {}): { nonTeaching: NonTeaching[]; issues: Issue[] } {
  const r = new Reporter("NonTeaching");
  const terms = new Set([AY, ...settings.terms.map((t) => t.code)]);
  const out: NonTeaching[] = [];
  records.forEach((rec, idx) => {
    const row = idx + 2;
    const { known: k, extra } = split(rec, NONTEACHING_COLUMNS);
    if (opts.academicYear && !k.AcademicYear) k.AcademicYear = opts.academicYear;
    const term = (k.Term ?? "").toUpperCase();
    if (term && !terms.has(term)) r.add("error", row, `Term: "${k.Term}" is not a configured term (${[...terms].join(", ")})`);
    const parsed = nonTeachingSchema.safeParse({
      academicYear: k.AcademicYear ?? "",
      faculty: k.Faculty ?? "",
      activity: k.Activity ?? "",
      term,
      load: num(r, row, "Load", k.Load) ?? 0,
      comment: k.Comment ?? "",
      extra,
    });
    if (parsed.success) out.push(parsed.data);
    else r.zod(row, parsed.error);
  });
  return { nonTeaching: out, issues: r.issues };
}

export function importConstraints(records: Rec[]): { constraints: Constraint[]; issues: Issue[] } {
  const r = new Reporter("Constraints");
  const out: Constraint[] = [];
  records.forEach((rec, idx) => {
    const row = idx + 2;
    const { known: k } = split(rec, CONSTRAINT_COLUMNS);
    // "MATH 231" names every section; "MATH 231 A" (or a Section column) names one.
    const tokens = (k.Course ?? "").split(/\s+/).filter(Boolean);
    const typed = tokens.length >= 3 ? tokens.slice(2).join(" ") : "";
    const column = (k.Section ?? "").trim();
    if (typed && column && typed.toLowerCase() !== column.toLowerCase()) r.add("error", row, `Course says section "${typed}" but Section says "${column}"`);
    const parsed = constraintSchema.safeParse({
      constraint: k.Constraint ?? "",
      course: tokens.length >= 3 ? tokens.slice(0, 2).join(" ") : tokens.join(" "),
      section: column || typed,
      comment: k.Comment ?? "",
    });
    if (parsed.success) out.push(parsed.data);
    else r.zod(idx + 2, parsed.error);
  });
  return { constraints: out, issues: r.issues };
}

/**
 * Settings sheet records (`Kind,Code,Name,Term,StartWeek,EndWeek`) → settings.
 * Kinds: `Term`, `Part`, `SpreadTerm`, `NonRoom`. Anything absent keeps its default.
 */
export function importSettings(recs: Rec[]): { settings: Settings; issues: Issue[] } {
  const issues: Issue[] = [];
  const warn = (message: string) => issues.push({ severity: "warning", sheet: "Settings", message });
  const base = defaultSettings();
  const terms: { code: string; name: string }[] = [];
  const parts: PartDef[] = [];
  const spread: string[] = [];
  const nonRooms: string[] = [];
  for (const rec of recs) {
    const kind = (rec.Kind ?? "").trim().toLowerCase();
    const code = (rec.Code ?? "").trim();
    if (kind === "term") {
      if (code) terms.push({ code: code.toUpperCase(), name: (rec.Name ?? "").trim() || code });
    } else if (kind === "part") {
      const start = Number(rec.StartWeek);
      const end = Number(rec.EndWeek);
      if (!code || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
        warn(`part "${code}": needs a code and StartWeek <= EndWeek (positive whole weeks); ignored`);
        continue;
      }
      const term = (rec.Term ?? "").trim().toUpperCase();
      parts.push({ ...(term ? { term } : {}), code, name: (rec.Name ?? "").trim() || code, startWeek: start, endWeek: end });
    } else if (kind === "spreadterm") {
      if (code) spread.push(code.toUpperCase());
    } else if (kind === "nonroom") {
      if (code) nonRooms.push(code);
    } else if (kind) warn(`unknown setting kind "${rec.Kind}" ignored`);
  }
  const known = new Set((terms.length ? terms : base.terms).map((t) => t.code));
  for (const c of spread) if (!known.has(c)) warn(`SpreadTerm "${c}" is not a configured term`);
  for (const p of parts) if (p.term && !known.has(p.term)) warn(`part ${p.code}: term "${p.term}" is not a configured term`);
  return {
    settings: {
      terms: terms.length ? terms : base.terms,
      // Defaults stay unless the file defines its own: the semester grid unless it has term-less
      // parts, and a term's built-in parts (WI) unless it has parts for that term.
      parts: [
        ...(parts.some((p) => !p.term) ? [] : DEFAULT_PARTS),
        ...DEFAULT_TERM_PARTS.filter((d) => !parts.some((p) => p.term === d.term)),
        ...parts,
      ].map((p) => ({ ...p })),
      spreadTerms: spread.length ? spread : base.spreadTerms,
      nonRooms: nonRooms.length ? nonRooms : base.nonRooms,
    },
    issues,
  };
}

export interface ImportInput {
  sessions: Rec[];
  crossListings?: Rec[];
  nonTeaching?: Rec[];
  constraints?: Rec[];
  settings?: Settings;
  meta?: Meta;
  /** Fills a blank AcademicYear (see `ImportOptions`). */
  academicYear?: string;
}

export interface ImportResult {
  schedule: Schedule;
  issues: Issue[];
  /** True when there are no errors (warnings allowed). */
  ok: boolean;
}

/** Record-level import of a whole schedule. Pure and synchronous. */
export function importRecords(input: ImportInput): ImportResult {
  const settings = input.settings ?? defaultSettings();
  const opts = input.academicYear ? { academicYear: input.academicYear } : {};
  const s = importSessions(input.sessions, settings, opts);
  const cl = importCrossListings(input.crossListings ?? [], s.sessions, s.crossListings);
  const nt = importNonTeaching(input.nonTeaching ?? [], settings, opts);
  const co = importConstraints(input.constraints ?? []);
  const issues = [...s.issues, ...cl.issues, ...nt.issues, ...co.issues];
  return {
    schedule: {
      meta: input.meta ?? emptyMeta(),
      settings,
      sessions: s.sessions,
      crossListings: cl.crossListings,
      nonTeaching: [...s.nonTeaching, ...nt.nonTeaching],
      constraints: co.constraints,
    },
    issues,
    ok: !issues.some((i) => i.severity === "error"),
  };
}
