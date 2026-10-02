import { z } from "zod";
import { parseDays, parseFaculty, parseTime } from "./format.js";
import { partsFor } from "./terms.js";
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
  "MeetingDuration", "Classroom", "ShortTitle", "InstructionalMethod", "CourseLevel", "Group",
  "Comment", "Enrollment", "EnrollmentDay10",
] as const;
export const CROSSLISTING_COLUMNS = ["SectionId", "Prefix", "CourseNumber"] as const;
export const NONTEACHING_COLUMNS = ["AcademicYear", "Faculty", "Activity", "Term", "Load", "Comment"] as const;
export const CONSTRAINT_COLUMNS = ["Constraint", "Course", "Comment"] as const;

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Split a record into known columns (canonical names) and the rest. */
function split(rec: Rec, known: readonly string[]): { known: Rec; extra: Rec } {
  const byKey = new Map(known.map((k) => [key(k), k]));
  const out = { known: {} as Rec, extra: {} as Rec };
  for (const [h, v] of Object.entries(rec)) {
    const canon = byKey.get(key(h));
    if (canon) out.known[canon] = v.trim();
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
 * One record → its meetings. Newlines in MeetingDays/StartTime/MeetingDuration/
 * Classroom separate meetings (the packed form); a record with none is a single
 * (possibly unscheduled) meeting. `00:00` for `0` minutes means "no time".
 */
function meetings(r: Reporter, row: number, k: Rec): Meeting[] {
  const cols = ["MeetingDays", "StartTime", "MeetingDuration", "Classroom"].map((c) => lines(k[c]));
  const n = Math.max(1, ...cols.map((c) => (c.length === 1 && c[0] === "" ? 0 : c.length)));
  const out: Meeting[] = [];
  for (let i = 0; i < n; i++) {
    const [d, t, du, room] = cols.map((c) => (c[i] ?? "").trim()) as [string, string, string, string];
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
  const p = lines(k.Prefix).map((x) => x.trim()).filter(Boolean);
  const c = lines(k.CourseNumber).map((x) => x.trim()).filter(Boolean);
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
  "group", "comment", "enrollment", "enrollmentDay10", "extra",
] as const;

export interface SessionsImport {
  sessions: Session[];
  crossListings: CrossListing[];
  issues: Issue[];
}

/** Sessions sheet records (multi-row or packed form) → sessions + cross-listings. */
export function importSessions(records: Rec[], settings: Settings = defaultSettings()): SessionsImport {
  const r = new Reporter("Sessions");
  const terms = new Set([AY, ...settings.terms.map((t) => t.code)]);
  const sessions: Session[] = [];
  const crossListings: CrossListing[] = [];
  const items: { row: number; section: Record<string, unknown>; ms: Meeting[] }[] = [];
  const seenListing = new Set<string>();

  records.forEach((rec, idx) => {
    const row = idx + 2;
    const { known: k, extra } = split(rec, SESSION_COLUMNS);
    const ls = listings(r, row, k);
    const primary = ls[0] ?? { prefix: k.Prefix ?? "", courseNumber: k.CourseNumber ?? "" };
    const term = (k.Term ?? "").toUpperCase();
    if (term && !terms.has(term)) r.add("error", row, `Term: "${k.Term}" is not a configured term (${[...terms].join(", ")})`);
    const partCodes = partsFor(settings, term).map((p) => p.code);
    let part = "Full";
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
    const sectionId = k.SectionId || (base.academicYear && term && base.prefix && base.courseNumber && base.section ? deriveSectionId(base) : "");

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
  return { sessions, crossListings, issues: r.issues };
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

export function importNonTeaching(records: Rec[], settings: Settings = defaultSettings()): { nonTeaching: NonTeaching[]; issues: Issue[] } {
  const r = new Reporter("NonTeaching");
  const terms = new Set([AY, ...settings.terms.map((t) => t.code)]);
  const out: NonTeaching[] = [];
  records.forEach((rec, idx) => {
    const row = idx + 2;
    const { known: k, extra } = split(rec, NONTEACHING_COLUMNS);
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
    const { known: k } = split(rec, CONSTRAINT_COLUMNS);
    const parsed = constraintSchema.safeParse({ constraint: k.Constraint ?? "", course: (k.Course ?? "").replace(/\s+/g, " "), comment: k.Comment ?? "" });
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
  const s = importSessions(input.sessions, settings);
  const cl = importCrossListings(input.crossListings ?? [], s.sessions, s.crossListings);
  const nt = importNonTeaching(input.nonTeaching ?? [], settings);
  const co = importConstraints(input.constraints ?? []);
  const issues = [...s.issues, ...cl.issues, ...nt.issues, ...co.issues];
  return {
    schedule: {
      meta: input.meta ?? emptyMeta(),
      settings,
      sessions: s.sessions,
      crossListings: cl.crossListings,
      nonTeaching: nt.nonTeaching,
      constraints: co.constraints,
    },
    issues,
    ok: !issues.some((i) => i.severity === "error"),
  };
}
