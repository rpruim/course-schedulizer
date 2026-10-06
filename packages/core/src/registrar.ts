import { colocatedPairs } from "./conflicts.js";
import { formatNumber } from "./format.js";
import { SPECIAL_TOPIC, type Table } from "./export.js";
import { partForExport } from "./terms.js";
import type { Schedule, Session } from "./types.js";
import { AY } from "./types.js";

/**
 * The registrar's tab ("Registrar Schedule"): the old app's 17 columns in the
 * same order, then `CrossListings` next to the notes (`Comment`) column and the `CoreTag`, then `SpecialTopic` (blank, or "Special Topic") and `Level` (`UGRAD` for a course numbered 499 or below, `GRAD` for 500 or above; worked out from the course number), then `Colocations` (the other sections that actually meet with this one under a colocate rule, which would otherwise be flagged as a conflict). One row
 * per section.
 */
export const REGISTRAR_COLUMNS = [
  "Term", "Prefix", "CourseNumber", "Section", "StudentCredits", "FacultyLoad", "MeetingDays",
  "MeetingTime", "BuildingAndRoom", "TermPart", "TermAndPart", "Duration", "ShortTitle", "Faculty",
  "InstructionalMethod", "DeliveryMode", "Comment", "CrossListings", "CoreTag", "SpecialTopic", "Level", "Colocations",
] as const;

export const REGISTRAR_SHEET = "Registrar Schedule";

/** `GRAD` for a course numbered 500 or above, `UGRAD` for 499 or below (a letter after the number, as in `182C`, is ignored); blank when there is no number. */
export function gradLevelOf(courseNumber: string): "GRAD" | "UGRAD" | "" {
  const n = /^\s*(\d+)/.exec(courseNumber);
  if (!n) return "";
  return Number(n[1]) >= 500 ? "GRAD" : "UGRAD";
}

const pad2 = (n: number) => String(n).padStart(2, "0");
/** `HH:MM:00`, wrapping past midnight. */
const clock = (minutes: number) => `${pad2(Math.floor((minutes % 1440) / 60))}:${pad2(minutes % 60)}:00`;

/** Compact form: one value if there is one meeting, else one value per meeting, newline-separated. */
const compact = (values: string[]) => values.join("\n");

/**
 * The registrar tab for a schedule.
 *
 * - Teaching sections: a section's meetings fill MeetingDays, MeetingTime,
 *   BuildingAndRoom and Duration with one value per meeting, aligned and
 *   newline-separated (the compact form, so a section with two meetings has two
 *   lines in each — unlike the old app, which kept only the first meeting's time).
 * - Prefix and CourseNumber are the section's primary listing only; any other
 *   listings go in `CrossListings` as `URBS 388, MUSC 310`.
 * - Rows are in natural course order: prefix, then course number, then section
 *   letter (then term, then academic year); non-teaching rows come first.
 * - Faculty: names only (a `Name (n)` load share is not shown here); `FacultyLoad`
 *   is the section's total.
 * - Non-teaching load follows the old app and is listed inline first, as rows
 *   with no course: the activity in InstructionalMethod, `0` StudentCredits. A
 *   year-long (`AY`) row appears once per spread term with the load divided.
 *   `includeNonTeaching: false` leaves those rows out (a teaching-only export).
 */
export function registrarTable(schedule: Schedule, opts: { includeNonTeaching?: boolean } = {}): Table {
  const rows: string[][] = [];
  const row = (c: Record<(typeof REGISTRAR_COLUMNS)[number], string>) => REGISTRAR_COLUMNS.map((h) => c[h]);

  // The sections each one is colocated with (only those that really meet together), as `PREFIX NUMBER LETTER`.
  const byId = new Map<string, Session>();
  for (const s of schedule.sessions) if (!byId.has(s.sectionId)) byId.set(s.sectionId, s);
  const together = new Map<string, string[]>();
  const nameOf = (id: string) => { const s = byId.get(id)!; return `${s.prefix} ${s.courseNumber} ${s.section}`; };
  for (const [a, b] of colocatedPairs(schedule)) {
    together.set(a, [...(together.get(a) ?? []), nameOf(b)]);
    together.set(b, [...(together.get(b) ?? []), nameOf(a)]);
  }
  for (const [id, list] of together) together.set(id, list.sort((x, y) => x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" })));

  const spread = schedule.settings.spreadTerms;
  for (const n of opts.includeNonTeaching === false ? [] : schedule.nonTeaching) {
    const terms = n.term === AY && spread.length ? spread : [n.term];
    for (const term of terms) {
      rows.push(row({
        Term: term, Prefix: "", CourseNumber: "", Section: "", StudentCredits: "0",
        FacultyLoad: formatNumber(Math.round((n.load / terms.length) * 1e6) / 1e6),
        MeetingDays: "", MeetingTime: "", BuildingAndRoom: "", TermPart: "Full", TermAndPart: `${term}-Full`,
        Duration: "", ShortTitle: "", Faculty: n.faculty, InstructionalMethod: n.activity,
        DeliveryMode: "", Comment: n.comment, CrossListings: "", CoreTag: "", SpecialTopic: "", Level: "", Colocations: "",
      }));
    }
  }

  const bySection = new Map<string, Session[]>();
  for (const s of schedule.sessions) bySection.set(s.sectionId, [...(bySection.get(s.sectionId) ?? []), s]);
  const termRank = new Map(schedule.settings.terms.map((t, i) => [t.code, i]));
  const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  const ordered = [...bySection].sort(([, a], [, b]) => {
    const x = a[0]!;
    const y = b[0]!;
    return (
      natural(x.academicYear, y.academicYear) ||
      natural(x.prefix, y.prefix) ||
      natural(x.courseNumber, y.courseNumber) ||
      natural(x.section, y.section) ||
      (termRank.get(x.term) ?? 99) - (termRank.get(y.term) ?? 99)
    );
  });
  for (const [id, ms] of ordered) {
    const head = ms[0]!;
    const others = schedule.crossListings.filter((l) => l.sectionId === id);
    const scheduled = ms.some((m) => m.days !== "");
    const when = (m: Session) => (m.days !== "" && m.start !== undefined && m.duration !== undefined ? m : undefined);
    rows.push(row({
      Term: head.term,
      Prefix: head.prefix,
      CourseNumber: head.courseNumber,
      Section: head.section,
      StudentCredits: formatNumber(head.minimumCredits),
      FacultyLoad: formatNumber(head.facultyLoad),
      MeetingDays: scheduled || ms.length > 1 ? compact(ms.map((m) => m.days)) : "",
      MeetingTime: scheduled ? compact(ms.map((m) => { const w = when(m); return w ? `${clock(w.start!)} - ${clock(w.start! + w.duration!)}` : ""; })) : "",
      BuildingAndRoom: ms.some((m) => m.room !== "") ? compact(ms.map((m) => m.room)) : "",
      TermPart: partForExport(schedule.settings, head.term, head.termPart),
      TermAndPart: `${head.term}-${partForExport(schedule.settings, head.term, head.termPart)}`,
      Duration: scheduled ? compact(ms.map((m) => formatNumber(when(m)?.duration))) : "",
      ShortTitle: head.shortTitle,
      Faculty: head.faculty.map((f) => f.name).join(", "),
      InstructionalMethod: head.instructionalMethod,
      DeliveryMode: head.deliveryMode,
      Comment: head.comment,
      CrossListings: others.map((l) => `${l.prefix} ${l.courseNumber}`).join(", "),
      CoreTag: head.coreTag,
      SpecialTopic: head.specialTopic ? SPECIAL_TOPIC : "",
      Level: gradLevelOf(head.courseNumber),
      Colocations: (together.get(head.sectionId) ?? []).join(", "),
    }));
  }
  return { header: [...REGISTRAR_COLUMNS], rows };
}
