import { crossListingsOf, setCrossListings } from "./crosslistings.js";
import { parseDays } from "./format.js";
import { sectionShares } from "./load.js";
import type { Listing } from "./names.js";
import { nextFreeLetter, offeringOf, sameLetter, uniqueSectionId, type LetterResolution, type Offering } from "./sections.js";
import { partsFor } from "./terms.js";
import { deriveSectionId } from "./import.js";
import { sessionSchema, type Instructor, type Schedule, type Session } from "./types.js";

/** One meeting of a section being edited. Fully empty meetings (no days, time or room) are dropped on save. */
export interface MeetingDraft {
  /** Day letters (`MWF`). */
  days: string;
  /** Minutes since midnight. */
  start?: number;
  /** Minutes. */
  duration?: number;
  room: string;
}

/**
 * A section as the editor sees it: all its section-level fields, its meetings and
 * its additional (cross-) listings together. Saving writes them back as one unit
 * (spec §4). `sectionId` is absent for a section that does not exist yet.
 */
export interface SectionDraft {
  sectionId?: string;
  academicYear: string;
  term: string;
  termPart: string;
  prefix: string;
  courseNumber: string;
  /** The section letter. */
  section: string;
  department: string;
  shortTitle: string;
  instructionalMethod: string;
  courseLevel: string;
  group: string;
  deliveryMode: string;
  coreTag: string;
  specialTopic: boolean;
  comment: string;
  faculty: Instructor[];
  facultyLoad?: number;
  minimumCredits?: number;
  maximumCredits?: number;
  enrollment?: number;
  enrollmentDay10?: number;
  meetings: MeetingDraft[];
  crossListings: Listing[];
  /** Unrecognized imported columns, kept as they were. */
  extra: Record<string, string>;
}

export interface DraftError {
  /** The field the problem is about (`prefix`, `meetings.1.start`, …), for placing the message. */
  field: string;
  message: string;
}

const blank = (s: string) => s.trim() === "";

const firstSession = (schedule: Schedule, sectionId: string) => schedule.sessions.find((s) => s.sectionId === sectionId);

/** The editor's view of an existing section, or `undefined` if there is no such section. */
export function sectionToDraft(schedule: Schedule, sectionId: string): SectionDraft | undefined {
  const rows = schedule.sessions.filter((s) => s.sectionId === sectionId);
  const h = rows[0];
  if (!h) return undefined;
  const meetings = rows
    .map((r): MeetingDraft => ({ days: r.days, ...(r.start !== undefined ? { start: r.start } : {}), ...(r.duration !== undefined ? { duration: r.duration } : {}), room: r.room }))
    .filter((m) => m.days !== "" || m.room !== "");
  return {
    sectionId,
    academicYear: h.academicYear,
    term: h.term,
    termPart: h.termPart,
    prefix: h.prefix,
    courseNumber: h.courseNumber,
    section: h.section,
    department: h.department,
    shortTitle: h.shortTitle,
    instructionalMethod: h.instructionalMethod,
    courseLevel: h.courseLevel,
    group: h.group,
    deliveryMode: h.deliveryMode,
    coreTag: h.coreTag,
    specialTopic: h.specialTopic,
    comment: h.comment,
    faculty: h.faculty.map((f) => ({ ...f })),
    ...(h.facultyLoad !== undefined ? { facultyLoad: h.facultyLoad } : {}),
    ...(h.minimumCredits !== undefined ? { minimumCredits: h.minimumCredits } : {}),
    ...(h.maximumCredits !== undefined ? { maximumCredits: h.maximumCredits } : {}),
    ...(h.enrollment !== undefined ? { enrollment: h.enrollment } : {}),
    ...(h.enrollmentDay10 !== undefined ? { enrollmentDay10: h.enrollmentDay10 } : {}),
    meetings,
    crossListings: crossListingsOf(schedule, sectionId),
    extra: { ...h.extra },
  };
}

/** A blank section; its letter is the first one not yet used by that course in that term (`A` until a course is given). */
export function newSectionDraft(schedule: Schedule, defaults: Partial<SectionDraft> = {}): SectionDraft {
  const base: SectionDraft = {
    academicYear: "",
    term: schedule.settings.terms[0]?.code ?? "",
    termPart: "Full",
    prefix: "",
    courseNumber: "",
    section: "",
    department: "",
    shortTitle: "",
    instructionalMethod: "",
    courseLevel: "",
    group: "",
    deliveryMode: "",
    coreTag: "",
    specialTopic: false,
    comment: "",
    faculty: [],
    meetings: [],
    crossListings: [],
    extra: {},
    ...defaults,
  };
  delete base.sectionId;
  if (blank(base.section)) base.section = nextFreeLetter(schedule, offeringOf(base));
  return base;
}

/** Another section of the same course: everything copied but the id, letter (next free) and enrollment. */
export function copyAsNewSection(schedule: Schedule, sectionId: string): SectionDraft | undefined {
  const d = sectionToDraft(schedule, sectionId);
  if (!d) return undefined;
  const copy: SectionDraft = { ...d, section: "", meetings: d.meetings.map((m) => ({ ...m })), faculty: d.faculty.map((f) => ({ ...f })), crossListings: d.crossListings.map((l) => ({ ...l })) };
  delete copy.sectionId;
  delete copy.enrollment;
  delete copy.enrollmentDay10;
  copy.section = nextFreeLetter(schedule, offeringOf(copy));
  return copy;
}

const meetingEmpty = (m: MeetingDraft) => blank(m.days) && m.start === undefined && m.duration === undefined && blank(m.room);

/** The session rows for a draft: one per (non-empty) meeting, or a single unscheduled row. Not validated. */
export function draftToSessions(d: SectionDraft, sectionId: string): Session[] {
  const meetings = d.meetings.filter((m) => !meetingEmpty(m));
  const rows = meetings.length ? meetings : [{ days: "", room: "" } as MeetingDraft];
  return rows.map((m) => ({
    sectionId,
    department: d.department.trim(),
    academicYear: d.academicYear.trim(),
    term: d.term.trim().toUpperCase(),
    termPart: d.termPart,
    prefix: d.prefix.trim(),
    courseNumber: d.courseNumber.trim(),
    section: tidyLetter(d.section),
    faculty: d.faculty.map((f) => ({ ...f })),
    ...(d.facultyLoad !== undefined ? { facultyLoad: d.facultyLoad } : {}),
    ...(d.minimumCredits !== undefined ? { minimumCredits: d.minimumCredits } : {}),
    ...(d.maximumCredits !== undefined ? { maximumCredits: d.maximumCredits } : {}),
    shortTitle: d.shortTitle.trim(),
    instructionalMethod: d.instructionalMethod.trim(),
    courseLevel: d.courseLevel.trim(),
    group: d.group.trim(),
    deliveryMode: d.deliveryMode.trim(),
    coreTag: d.coreTag.trim(),
    specialTopic: d.specialTopic,
    comment: d.comment,
    ...(d.enrollment !== undefined ? { enrollment: d.enrollment } : {}),
    ...(d.enrollmentDay10 !== undefined ? { enrollmentDay10: d.enrollmentDay10 } : {}),
    days: parseDays(m.days) ?? m.days,
    ...(m.start !== undefined ? { start: m.start } : {}),
    ...(m.duration !== undefined ? { duration: m.duration } : {}),
    room: m.room.trim(),
    extra: { ...d.extra },
  }));
}

/**
 * Everything wrong with a draft that would stop it being saved. (Section-load
 * shares that do not add up, and conflicts, are warnings shown elsewhere.)
 */
export function validateDraft(schedule: Schedule, d: SectionDraft): DraftError[] {
  const errors: DraftError[] = [];
  const need = (field: keyof SectionDraft, label: string) => {
    if (blank(String(d[field] ?? ""))) errors.push({ field, message: `${label} is required` });
  };
  need("academicYear", "Academic year");
  need("term", "Term");
  need("prefix", "Prefix");
  need("courseNumber", "Course number");
  need("section", "Section letter");

  const term = d.term.trim().toUpperCase();
  if (term && !schedule.settings.terms.some((t) => t.code === term)) {
    errors.push({ field: "term", message: `"${d.term}" is not a configured term (${schedule.settings.terms.map((t) => t.code).join(", ")})` });
  } else if (term && !partsFor(schedule.settings, term).some((p) => p.code === d.termPart)) {
    errors.push({ field: "termPart", message: `"${d.termPart}" is not a part of ${term} (${partsFor(schedule.settings, term).map((p) => p.code).join(", ")})` });
  }

  const nonNeg = (field: string, n: number | undefined, label: string) => {
    if (n !== undefined && (!Number.isFinite(n) || n < 0)) errors.push({ field, message: `${label} cannot be negative` });
  };
  nonNeg("facultyLoad", d.facultyLoad, "Faculty load");
  nonNeg("minimumCredits", d.minimumCredits, "Credits");
  nonNeg("maximumCredits", d.maximumCredits, "Maximum credits");
  nonNeg("enrollment", d.enrollment, "Enrollment");
  nonNeg("enrollmentDay10", d.enrollmentDay10, "Day-10 enrollment");
  d.faculty.forEach((f, i) => nonNeg(`faculty.${i}`, f.load, `${f.name}'s share`));

  d.meetings.forEach((m, i) => {
    if (meetingEmpty(m)) return;
    const f = `meetings.${i}`;
    const days = parseDays(m.days);
    if (days === null) errors.push({ field: `${f}.days`, message: `"${m.days}" is not a set of day letters (M T W R F S U)` });
    const timed = !blank(m.days) || m.start !== undefined || m.duration !== undefined;
    if (timed) {
      if (blank(m.days)) errors.push({ field: `${f}.days`, message: "Choose the meeting days" });
      if (m.start === undefined) errors.push({ field: `${f}.start`, message: "Give a start time" });
      else if (!Number.isInteger(m.start) || m.start < 0 || m.start > 1439) errors.push({ field: `${f}.start`, message: "Start time must be within a day" });
      if (m.duration === undefined) errors.push({ field: `${f}.duration`, message: "Give a duration in minutes" });
      else if (!Number.isInteger(m.duration) || m.duration < 1) errors.push({ field: `${f}.duration`, message: "Duration must be a whole number of minutes" });
    }
  });

  const seen = new Set<string>();
  d.crossListings.forEach((l, i) => {
    const key = `${l.prefix.trim().toUpperCase()} ${l.courseNumber.trim()}`.toLowerCase();
    if (blank(l.prefix) || blank(l.courseNumber)) errors.push({ field: `crossListings.${i}`, message: "A listing needs a prefix and a course number" });
    else if (key === `${d.prefix.trim().toUpperCase()} ${d.courseNumber.trim()}`.toLowerCase()) errors.push({ field: `crossListings.${i}`, message: `${key.toUpperCase()} is this section's own course` });
    else if (seen.has(key)) errors.push({ field: `crossListings.${i}`, message: `${key.toUpperCase()} is listed twice` });
    seen.add(key);
  });

  if (errors.length === 0) {
    const parsed = draftToSessions(d, d.sectionId ?? "x").map((s) => sessionSchema.safeParse(s));
    for (const p of parsed) if (!p.success) for (const i of p.error.issues) errors.push({ field: String(i.path[0] ?? ""), message: i.message });
  }
  return errors;
}

export type SaveResult =
  | {
      kind: "saved";
      schedule: Schedule;
      sectionId: string;
      /** What happened to the other section that held the letter, if there was one. */
      other?: { sectionId: string; from: string; to?: string; deleted?: boolean };
    }
  /** The letter is taken in that course and term: ask the user, then save again with a resolution. */
  | { kind: "collision"; other: { sectionId: string; letter: string }; options: ("swap" | "relabel" | "delete" | "cancel")[]; defaultOption: "swap" }
  | { kind: "canceled"; schedule: Schedule }
  | { kind: "invalid"; errors: DraftError[] };

/** A purely alphabetic section letter is stored upper-case (`a` → `A`); anything else (`04`, `O1`) is kept as typed. */
export const tidyLetter = (s: string) => (/^[A-Za-z]+$/.test(s.trim()) ? s.trim().toUpperCase() : s.trim());

const sameOffering = (a: Offering, b: Offering) =>
  a.academicYear === b.academicYear && a.term === b.term && a.prefix === b.prefix && a.courseNumber === b.courseNumber;

/**
 * Save a draft as one unit: add a section, or replace an existing one in place.
 * An existing section keeps its id however its letter or course changes. If the
 * letter is already used by another section of the same course and term, nothing
 * is written until the caller supplies a resolution (swap — the default —
 * relabel the other section, delete it, or cancel); a swap gives the other
 * section this section's previous letter in that course, or else the first free one.
 */
export function saveDraft(schedule: Schedule, draft: SectionDraft, resolution?: LetterResolution): SaveResult {
  const errors = validateDraft(schedule, draft);
  if (errors.length) return { kind: "invalid", errors };

  const existing = draft.sectionId ? firstSession(schedule, draft.sectionId) : undefined;
  if (draft.sectionId && !existing) return { kind: "invalid", errors: [{ field: "", message: `no section ${draft.sectionId}` }] };
  const d: SectionDraft = { ...draft, term: draft.term.trim().toUpperCase(), prefix: draft.prefix.trim(), courseNumber: draft.courseNumber.trim(), section: tidyLetter(draft.section), academicYear: draft.academicYear.trim() };
  const id = existing ? existing.sectionId : uniqueSectionId(schedule, deriveSectionId(d));
  const target = offeringOf(d);

  const other = [...new Map(schedule.sessions.map((s) => [s.sectionId, s])).values()].find(
    (s) => s.sectionId !== id && sameOffering(offeringOf(s), target) && sameLetter(s.section, d.section),
  );
  if (other && !resolution) {
    return { kind: "collision", other: { sectionId: other.sectionId, letter: other.section }, options: ["swap", "relabel", "delete", "cancel"], defaultOption: "swap" };
  }
  if (other && resolution?.kind === "cancel") return { kind: "canceled", schedule };

  // Write the section: replace its rows where the first one was, or append.
  const fresh = draftToSessions(d, id);
  let placed = false;
  const sessions: Session[] = [];
  for (const s of schedule.sessions) {
    if (s.sectionId !== id) sessions.push(s);
    else if (!placed) {
      sessions.push(...fresh);
      placed = true;
    }
  }
  if (!placed) sessions.push(...fresh);
  let next: Schedule = { ...schedule, sessions };
  let report: Extract<SaveResult, { kind: "saved" }>["other"];

  if (other) {
    const previous = existing && sameOffering(offeringOf(existing), target) ? existing.section : undefined;
    const setLetter = (otherId: string, letter: string) => {
      next = { ...next, sessions: next.sessions.map((s) => (s.sectionId === otherId ? { ...s, section: letter } : s)) };
    };
    const used = (letter: string) => next.sessions.some((s) => s.sectionId !== other.sectionId && s.sectionId !== id && sameOffering(offeringOf(s), target) && sameLetter(s.section, letter));
    switch (resolution!.kind) {
      case "swap": {
        const to = previous && !used(previous) ? previous : nextFreeLetter(next, target);
        setLetter(other.sectionId, to);
        report = { sectionId: other.sectionId, from: other.section, to };
        break;
      }
      case "relabel": {
        const to = resolution!.letter.trim();
        if (to === "") return { kind: "invalid", errors: [{ field: "section", message: "A section letter cannot be blank" }] };
        if (sameLetter(to, d.section)) return { kind: "invalid", errors: [{ field: "section", message: `Both sections cannot be ${d.section}` }] };
        if (used(to)) return { kind: "invalid", errors: [{ field: "section", message: `Letter ${to} is already used by another section` }] };
        setLetter(other.sectionId, to);
        report = { sectionId: other.sectionId, from: other.section, to };
        break;
      }
      case "delete":
        next = {
          ...next,
          sessions: next.sessions.filter((s) => s.sectionId !== other.sectionId),
          crossListings: next.crossListings.filter((l) => l.sectionId !== other.sectionId),
        };
        report = { sectionId: other.sectionId, from: other.section, deleted: true };
        break;
    }
  }

  const cl = setCrossListings(next, id, d.crossListings);
  if (cl.kind === "invalid") return { kind: "invalid", errors: [{ field: "crossListings", message: cl.message }] };
  next = cl.schedule;
  return { kind: "saved", schedule: next, sectionId: id, ...(report ? { other: report } : {}) };
}

/** Remove a section: its rows and its additional listings. (Cohort-constraint rows naming it are left, and then reported by `constraintWarnings`.) */
export function deleteSection(schedule: Schedule, sectionId: string): Schedule {
  return {
    ...schedule,
    sessions: schedule.sessions.filter((s) => s.sectionId !== sectionId),
    crossListings: schedule.crossListings.filter((l) => l.sectionId !== sectionId),
  };
}

/** Remove several sections (all their meetings and cross-listings). The input is not changed. */
export function deleteSections(schedule: Schedule, sectionIds: Iterable<string>): Schedule {
  const gone = new Set(sectionIds);
  if (gone.size === 0) return schedule;
  return {
    ...schedule,
    sessions: schedule.sessions.filter((s) => !gone.has(s.sectionId)),
    crossListings: schedule.crossListings.filter((l) => !gone.has(l.sectionId)),
  };
}

/** Keep only the given sections, removing every other one (to cut a department's export down to the part you schedule). */
export function keepSections(schedule: Schedule, sectionIds: Iterable<string>): Schedule {
  const keep = new Set(sectionIds);
  const gone = new Set(schedule.sessions.map((s) => s.sectionId).filter((id) => !keep.has(id)));
  return deleteSections(schedule, gone);
}

/** How a draft's load would be divided, for showing next to the instructor field. */
export const draftShares = (d: SectionDraft) => sectionShares(d.facultyLoad ?? 0, d.faculty);
