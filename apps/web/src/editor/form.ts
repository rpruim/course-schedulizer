import {
  formatFaculty,
  formatNumber,
  formatTime,
  parseFaculty,
  parseTime,
  type DraftError,
  type SectionDraft,
} from "@schedulizer/core";

export const DAYS = [
  { letter: "M", label: "Mon" },
  { letter: "T", label: "Tue" },
  { letter: "W", label: "Wed" },
  { letter: "R", label: "Thu" },
  { letter: "F", label: "Fri" },
  { letter: "S", label: "Sat" },
  { letter: "U", label: "Sun" },
] as const;

export interface MeetingForm {
  /** Selected day letters. */
  days: string[];
  /** `HH:MM`, as a time input holds it. */
  start: string;
  /** Minutes, as typed. */
  duration: string;
  room: string;
}

/** Everything the dialog edits, as the strings its inputs hold. */
export interface Form {
  sectionId: string | undefined;
  academicYear: string;
  term: string;
  termPart: string;
  prefix: string;
  courseNumber: string;
  section: string;
  department: string;
  shortTitle: string;
  instructionalMethod: string;
  courseLevel: string;
  group: string;
  deliveryMode: string;
  comment: string;
  /** `Ada Example (3), Ben Sample` */
  faculty: string;
  facultyLoad: string;
  minimumCredits: string;
  maximumCredits: string;
  enrollment: string;
  enrollmentDay10: string;
  meetings: MeetingForm[];
  crossListings: { prefix: string; courseNumber: string }[];
  extra: Record<string, string>;
}

export const emptyMeetingForm = (): MeetingForm => ({ days: [], start: "", duration: "", room: "" });

const text = (n: number | undefined) => formatNumber(n);

export function draftToForm(d: SectionDraft): Form {
  return {
    sectionId: d.sectionId,
    academicYear: d.academicYear,
    term: d.term,
    termPart: d.termPart,
    prefix: d.prefix,
    courseNumber: d.courseNumber,
    section: d.section,
    department: d.department,
    shortTitle: d.shortTitle,
    instructionalMethod: d.instructionalMethod,
    courseLevel: d.courseLevel,
    group: d.group,
    deliveryMode: d.deliveryMode,
    comment: d.comment,
    faculty: formatFaculty(d.faculty),
    facultyLoad: text(d.facultyLoad),
    minimumCredits: text(d.minimumCredits),
    maximumCredits: text(d.maximumCredits),
    enrollment: text(d.enrollment),
    enrollmentDay10: text(d.enrollmentDay10),
    meetings: d.meetings.map((m) => ({
      days: [...m.days],
      start: m.start === undefined ? "" : formatTime(m.start),
      duration: text(m.duration),
      room: m.room,
    })),
    crossListings: d.crossListings.map((l) => ({ ...l })),
    extra: { ...d.extra },
  };
}

/**
 * The form as a draft, plus problems with *reading* it (a number that is not a
 * number, a time that is not a time). Rules about the draft itself (required
 * fields, term parts, …) are `validateDraft`'s, in the core.
 */
export function formToDraft(f: Form): { draft: SectionDraft; errors: DraftError[] } {
  const errors: DraftError[] = [];
  const num = (field: string, s: string, label: string): number | undefined => {
    if (s.trim() === "") return undefined;
    const n = Number(s);
    if (!Number.isFinite(n)) {
      errors.push({ field, message: `${label} is not a number` });
      return undefined;
    }
    return n;
  };
  const facultyLoad = num("facultyLoad", f.facultyLoad, "Faculty load");
  const minimumCredits = num("minimumCredits", f.minimumCredits, "Credits");
  const maximumCredits = num("maximumCredits", f.maximumCredits, "Maximum credits");
  const enrollment = num("enrollment", f.enrollment, "Enrollment");
  const enrollmentDay10 = num("enrollmentDay10", f.enrollmentDay10, "Day-10 enrollment");

  const meetings = f.meetings.map((m, i) => {
    const t = parseTime(m.start);
    if (t === null) errors.push({ field: `meetings.${i}.start`, message: `"${m.start}" is not a time` });
    const dur = num(`meetings.${i}.duration`, m.duration, "Duration");
    return {
      days: DAYS.map((d) => d.letter).filter((l) => m.days.includes(l)).join(""),
      ...(typeof t === "number" ? { start: t } : {}),
      ...(dur !== undefined ? { duration: dur } : {}),
      room: m.room,
    };
  });

  const draft: SectionDraft = {
    ...(f.sectionId ? { sectionId: f.sectionId } : {}),
    academicYear: f.academicYear,
    term: f.term,
    termPart: f.termPart,
    prefix: f.prefix,
    courseNumber: f.courseNumber,
    section: f.section,
    department: f.department,
    shortTitle: f.shortTitle,
    instructionalMethod: f.instructionalMethod,
    courseLevel: f.courseLevel,
    group: f.group,
    deliveryMode: f.deliveryMode,
    comment: f.comment,
    faculty: parseFaculty(f.faculty),
    ...(facultyLoad !== undefined ? { facultyLoad } : {}),
    ...(minimumCredits !== undefined ? { minimumCredits } : {}),
    ...(maximumCredits !== undefined ? { maximumCredits } : {}),
    ...(enrollment !== undefined ? { enrollment } : {}),
    ...(enrollmentDay10 !== undefined ? { enrollmentDay10 } : {}),
    meetings,
    crossListings: f.crossListings.map((l) => ({ ...l })),
    extra: { ...f.extra },
  };
  return { draft, errors };
}

/** Group messages by the field they are about, for placing them next to inputs. */
export function byField(errors: DraftError[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of errors) (out[e.field] ??= []).push(e.message);
  return out;
}
