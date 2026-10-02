import { listingsOf } from "./names.js";
import type { Constraint, Issue, Schedule, Session } from "./types.js";

export const normCourse = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const sameLetter = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The `prefix number` keys of a section's listings, normalized for matching. */
export function listingKeys(schedule: Schedule, primary: Session): Set<string> {
  return new Set(listingsOf(primary, schedule.crossListings).map((l) => normCourse(`${l.prefix} ${l.courseNumber}`)));
}

/** Does a constraint row name this section? (Course on any listing; the letter too if the row has one.) */
export function constraintNames(c: Constraint, keys: Set<string>, letter: string): boolean {
  return keys.has(normCourse(c.course)) && (c.section.trim() === "" || sameLetter(c.section, letter));
}

/** Constraint rows that name a section — e.g. to warn before its letter is changed. */
export function constraintsNaming(schedule: Schedule, sectionId: string): Constraint[] {
  const s = schedule.sessions.find((x) => x.sectionId === sectionId);
  if (!s) return [];
  const keys = listingKeys(schedule, s);
  return schedule.constraints.filter((c) => constraintNames(c, keys, s.section));
}

/**
 * Constraints that cannot do anything: a row that matches no section (a typo, or
 * a section whose letter was changed), or a group with fewer than two rows.
 */
export function constraintWarnings(schedule: Schedule): Issue[] {
  const out: Issue[] = [];
  const first = new Map<string, Session>();
  for (const s of schedule.sessions) if (!first.has(s.sectionId)) first.set(s.sectionId, s);
  const keyed = [...first.values()].map((s) => ({ keys: listingKeys(schedule, s), letter: s.section }));
  const sizes = new Map<string, number>();
  schedule.constraints.forEach((c, i) => {
    sizes.set(c.constraint, (sizes.get(c.constraint) ?? 0) + 1);
    if (!keyed.some((k) => constraintNames(c, k.keys, k.letter))) {
      const what = c.section ? `${c.course} section ${c.section}` : c.course;
      out.push({ severity: "warning", sheet: "Constraints", row: i + 2, message: `"${c.constraint}": no section matches ${what}` });
    }
  });
  for (const [name, n] of sizes) {
    if (n < 2) out.push({ severity: "warning", sheet: "Constraints", message: `"${name}" has only one row, so it cannot conflict with anything` });
  }
  return out;
}
