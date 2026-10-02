import { listingsOf } from "./names.js";
import type { Constraint, Issue, Schedule, Session } from "./types.js";

export const normCourse = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const sameLetter = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const globRe = (pattern: string) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i");

/**
 * Does a course pattern match a course? The pattern is `PREFIX NUMBER` where `*` matches any
 * run of characters: `MATH 231` (exactly), `MATH 3*` (300-level), `MATH *` or just `MATH` (any
 * MATH course), `* 2*`. Matching ignores case and extra spaces.
 */
export function courseMatches(pattern: string, prefix: string, courseNumber: string): boolean {
  const [p, ...rest] = normCourse(pattern).split(" ");
  if (!p) return false;
  return globRe(p).test(prefix.trim()) && globRe(rest.join(" ") || "*").test(courseNumber.trim());
}

/** The `prefix number` keys of a section's listings, normalized for matching. */
export function listingKeys(schedule: Schedule, primary: Session): Set<string> {
  return new Set(listingsOf(primary, schedule.crossListings).map((l) => normCourse(`${l.prefix} ${l.courseNumber}`)));
}

const matchesKey = (pattern: string, key: string) => {
  const i = key.indexOf(" ");
  return courseMatches(pattern, i < 0 ? key : key.slice(0, i), i < 0 ? "" : key.slice(i + 1));
};

/** Does a constraint row name this section? (A course on any listing matches the pattern; the letter too if the row has one.) */
export function constraintNames(c: Constraint, keys: Set<string>, letter: string): boolean {
  if (c.course.trim() === "") return false;
  return [...keys].some((k) => matchesKey(c.course, k)) && (c.section.trim() === "" || sameLetter(c.section, letter));
}

/** Does a constraint row name this section's instructor? */
export const constraintNamesInstructor = (c: Constraint, session: Session) =>
  c.instructor.trim() !== "" && session.faculty.some((f) => normCourse(f.name) === normCourse(c.instructor));

/** Constraint rows that name a section by course — e.g. to warn before its letter is changed. */
export function constraintsNaming(schedule: Schedule, sectionId: string): Constraint[] {
  const s = schedule.sessions.find((x) => x.sectionId === sectionId);
  if (!s) return [];
  const keys = listingKeys(schedule, s);
  return schedule.constraints.filter((c) => constraintNames(c, keys, s.section));
}

/**
 * Constraints that cannot do anything: a row that matches no section (a typo, or a section whose
 * letter was changed), or a "take at least" rule that names fewer than two courses.
 */
export function constraintWarnings(schedule: Schedule): Issue[] {
  const out: Issue[] = [];
  const first = new Map<string, Session>();
  for (const s of schedule.sessions) if (!first.has(s.sectionId)) first.set(s.sectionId, s);
  const keyed = [...first.values()].map((s) => ({ session: s, keys: listingKeys(schedule, s), letter: s.section }));
  const courses = new Map<string, Set<string>>(); // rule → distinct courses its rows match
  schedule.constraints.forEach((c, i) => {
    const hits = keyed.filter((k) => constraintNames(c, k.keys, k.letter) || constraintNamesInstructor(c, k.session));
    if (hits.length === 0) {
      const what = c.instructor ? `instructor ${c.instructor}` : c.section ? `${c.course} section ${c.section}` : c.course;
      out.push({ severity: "warning", sheet: "Constraints", row: i + 2, message: `"${c.constraint}": no section matches ${what}` });
    }
    const set = courses.get(c.constraint) ?? new Set<string>();
    for (const h of hits) for (const k of h.keys) if (matchesKey(c.course, k)) set.add(`${k}|${c.section.trim().toLowerCase()}`);
    courses.set(c.constraint, set);
  });
  const kinds = new Map(schedule.constraints.map((c) => [c.constraint, c.type]));
  for (const [name, set] of courses) {
    if (kinds.get(name) === "takeable" && set.size < 2) out.push({ severity: "warning", sheet: "Constraints", message: `"${name}" names fewer than two courses that exist in the schedule, so it cannot conflict with anything` });
  }
  return out;
}
