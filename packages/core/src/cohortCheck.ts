import { normCourse } from "./constraints.js";
import { listingsOf } from "./names.js";
import type { RuleViolation } from "./ruleCheck.js";
import type { Rule } from "./ruleModel.js";
import { adviseTimes, planSeats, type SeatElement } from "./seats.js";
import type { Schedule, Session } from "./types.js";

/** What the cohort planning check needs from the rule check it is part of. */
export interface CohortContext {
  schedule: Schedule;
  /** The meetings of each section. */
  bySection: Map<string, Session[]>;
  /** A section as people read it: `MUSC 105 A`. */
  label(sectionId: string): string;
  /** Do two sections meet at overlapping times? */
  overlap(a: string, b: string): boolean;
  /** Work out which sections to move apart when the times are what is in the way. */
  advice: boolean;
  report(v: RuleViolation): void;
}

/**
 * Cohort planning: can every student of every group be seated, at the same time, in a clash-free choice of sections of the group's
 * courses, without passing the seats of any section? (`planSeats`.) A group is looked at in a term when some of its courses are offered
 * then; a course of it that is not offered that term means its students cannot be seated.
 */
export function checkCohort(rule: Rule, g: { year: string; term: string; sections: Session[] }, cx: CohortContext): boolean {
  const { schedule, bySection, label, overlap: sectionsOverlap, advice } = cx;
  const seatsOf = new Map(rule.capacities.filter((c) => c.seats !== undefined).map((c) => [normCourse(c.course), c.seats!] as const));
  const offered = (course: string) => g.sections.filter((s) => listingsOf(s, schedule.crossListings).some((l) => normCourse(`${l.prefix} ${l.courseNumber}`) === normCourse(course)));
  const elements: SeatElement[] = [];
  const involved = new Set<string>();
  const notOffered: string[] = [];
  const noSeats = new Set<string>();
  let unseatable = 0;
  // A term where none of the rule's courses run is not looked at; in any other term a group whose courses are not offered cannot be seated.
  if (!rule.elements.some((e) => e.students !== undefined && e.courses.some((c) => offered(c).length > 0))) return false;
  for (const e of rule.elements) {
    if (e.students === undefined || e.courses.length === 0) continue;
    const found = e.courses.map((c) => ({ course: c, sections: offered(c) }));
    for (const x of found) if (!seatsOf.has(normCourse(x.course))) noSeats.add(x.course);
    const missing = found.filter((x) => x.sections.length === 0);
    for (const x of missing) if (!notOffered.includes(x.course)) notOffered.push(x.course);
    for (const x of found) for (const s of x.sections) involved.add(s.sectionId);
    if (missing.length > 0) {
      unseatable += e.students; // one of its courses is not offered, so no student of it can take them all
      continue;
    }
    elements.push({ students: e.students, courses: found.map((x) => ({ label: x.course, sections: x.sections.map((s) => ({ id: s.sectionId, seats: seatsOf.get(normCourse(x.course)) ?? 0 })) })) });
  }
  if (elements.length === 0 && unseatable === 0) return true;
  const ids = [...involved];
  const report = (message: string, sectionIds = ids) => cx.report({ rule: rule.name, type: "cohortPlan", academicYear: g.year, term: g.term, message, sectionIds, sessions: sectionIds.flatMap((id) => bySection.get(id) ?? []) });
  if (noSeats.size > 0) report(`The seats in each section are not given for ${[...noSeats].join(", ")}, so this cannot be checked`);
  if (noSeats.size > 0) return true;

  const result = planSeats(elements, sectionsOverlap);
  const total = result.total + unseatable;
  if (result.placed === total && unseatable === 0) return true;
  const parts: string[] = [];
  for (const c of notOffered) parts.push(`${c} is not offered in ${g.term}`);
  for (const s of result.short) parts.push(`not enough seats in ${s.label} (${s.seats} in all, ${s.needed} student${s.needed === 1 ? "" : "s"} need${s.needed === 1 ? "s" : ""} them)`);
  // With seats enough in every course the times are what is in the way: say which sections to move apart (when advice is asked for).
  let tip = "";
  if (result.placed < result.total && result.short.length === 0) {
    const options = advice ? adviseTimes(elements, sectionsOverlap) : [];
    const move = (pairs: [string, string][]) => pairs.map(([x, y]) => `${label(x)} and ${label(y)} at different times`);
    const joinWith = (items: string[], word: string) => (items.length === 1 ? items[0]! : `${items.slice(0, -1).join(", ")}, ${word} ${items[items.length - 1]}`);
    if (options.length > 0) tip = `Try offering ${options.length === 1 ? joinWith(move(options[0]!), "and") : joinWith(options.map((o) => move(o).join(" and ")), "or")}`;
    else for (const i of result.noSchedule) {
      const e = elements[i]!;
      parts.push(`no clash-free choice of sections lets ${e.students} student${e.students === 1 ? "" : "s"} take ${e.courses.map((c) => c.label).join(", ")}`);
    }
  }
  const how = result.exact ? "" : " (the search was cut off, so more might fit)";
  const why = parts.length ? `: ${parts.join("; ")}` : tip ? "" : ": the times of the sections keep them from fitting together";
  report(`${result.placed} of ${total} students can all get seats${how}${why}${tip ? `. ${tip}` : ""}`);
  return true;
}
