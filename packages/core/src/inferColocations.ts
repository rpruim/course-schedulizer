import { findConflicts } from "./conflicts.js";
import { naturalCompare } from "./text.js";
import type { Constraint, Issue, Schedule, Session } from "./types.js";

/**
 * Colocate rules for the sections of a schedule that meet together: sections at overlapping times in the same room. When the
 * registrar's report says which sections are colocated (`colocated`, from its Colocated column), only those are joined, and they may
 * also be joined by sharing an instructor (their room may be missing); a marked section that meets with no other marked section is
 * reported, since it is likely colocated with a course another department schedules.
 *
 * Sections joined (directly or through others) form groups, kept apart by kind: “same instructor” for pairs that share an instructor
 * and “different instructors” for those that do not, as `allowedCollisions` expects. Rules name courses, not sections, where they can,
 * since section letters change while a schedule is made: two courses go in one rule without letters when every section of each (in
 * the term) is in a group with a section of the other, and a course on its own when every section of it is in a group with another
 * of its sections. A group not covered that way gets a rule naming its sections (but a course all of whose sections are in the group
 * without letters).
 */
export function inferColocations(schedule: Schedule, colocated?: Set<string>): { constraints: Constraint[]; issues: Issue[] } {
  const first = new Map<string, Session>();
  for (const s of schedule.sessions) if (!first.has(s.sectionId)) first.set(s.sectionId, s);
  const pairs = new Map<string, { a: string; b: string; room: boolean; instructor: boolean }>();
  for (const c of findConflicts(schedule)) {
    if (c.type === "Wildcard") continue;
    const k = `${c.sectionIdA}\u0000${c.sectionIdB}`;
    const p = pairs.get(k) ?? { a: c.sectionIdA, b: c.sectionIdB, room: false, instructor: false };
    if (c.type === "Room") p.room = true;
    else p.instructor = true;
    pairs.set(k, p);
  }
  const joined = [...pairs.values()].filter((p) => (colocated ? colocated.has(p.a) && colocated.has(p.b) : p.room));

  const taken = new Set(schedule.constraints.map((c) => c.constraint));
  const constraints: Constraint[] = [];
  const issues: Issue[] = [];
  // The sections of each course in each year and term.
  const courseKey = (s: Session) => `${s.academicYear}\u0000${s.term}\u0000${s.prefix} ${s.courseNumber}`;
  const courseName = (key: string) => key.split("\u0000")[2]!;
  const sectionsOf = new Map<string, string[]>();
  for (const s of first.values()) sectionsOf.set(courseKey(s), [...(sectionsOf.get(courseKey(s)) ?? []), s.sectionId]);
  const label = (id: string) => { const s = first.get(id)!; return `${s.prefix} ${s.courseNumber} ${s.section}`; };
  const byLabel = (a: string, b: string) => naturalCompare(label(a), label(b));
  const union = <T>() => {
    const parent = new Map<T, T>();
    const root = (x: T): T => { const p = parent.get(x) ?? x; if (p === x) return x; const r = root(p); parent.set(x, r); return r; };
    return { root, join: (a: T, b: T) => { const ra = root(a), rb = root(b); if (ra !== rb) parent.set(ra, rb); } };
  };
  // Rules are gathered first, so that the same rule found in several terms becomes one rule for all of them.
  const drafts = new Map<string, { list: string; terms: string[]; same: boolean; items: { course: string; section: string }[] }>();
  const addRule = (list: string, term: string, same: boolean, items: { course: string; section: string }[]) => {
    const k = `${same}\u0000${list}`;
    const d = drafts.get(k) ?? { list, terms: [], same, items };
    if (!d.terms.includes(term)) d.terms.push(term);
    drafts.set(k, d);
  };
  const termRank = (t: string) => { const i = schedule.settings.terms.findIndex((d) => d.code === t); return i < 0 ? Infinity : i; };
  const writeRule = ({ list, terms, same, items }: { list: string; terms: string[]; same: boolean; items: { course: string; section: string }[] }) => {
    const term = [...terms].sort((a, b) => termRank(a) - termRank(b) || naturalCompare(a, b)).join(", ");
    let name = `Colocated: ${list} (${term})`;
    for (let n = 2; taken.has(name); n++) name = `Colocated: ${list} (${term}) (${n})`;
    taken.add(name);
    items.forEach(({ course, section }, i) => {
      constraints.push({
        constraint: name, type: same ? "colocate" : "colocateDifferent", course, section, instructor: "",
        term, choose: "some", bound: "atMost", gap: 20, dayRule: "any", should: "should not", meets: "", active: true, action: "", starts: [], days: "",
        comment: i === 0 ? (colocated ? "Inferred at import from the Colocated column and the times and rooms" : "Inferred at import: same times and room") : "",
      });
    });
  };

  for (const same of [true, false]) {
    // Groups of sections joined by pairs of this kind.
    const sections = union<string>();
    const kind = joined.filter((p) => p.instructor === same);
    for (const p of kind) sections.join(p.a, p.b);
    const groupOf = new Map<string, string[]>();
    for (const id of new Set(kind.flatMap((p) => [p.a, p.b]))) {
      const g = groupOf.get(sections.root(id)) ?? [];
      g.push(id);
      groupOf.set(sections.root(id), g);
    }
    const groups = [...groupOf.values()].map((g) => g.sort(byLabel)).sort((a, b) => byLabel(a[0]!, b[0]!));
    const groupOfSection = new Map<string, string[]>();
    for (const g of groups) for (const id of g) groupOfSection.set(id, g);

    // Does every section of course x share a group with a section of course y (another section, when x is y)?
    const covers = (x: string, y: string) => sectionsOf.get(x)!.every((id) => (groupOfSection.get(id) ?? []).some((o) => o !== id && courseKey(first.get(o)!) === y));
    const courses = union<string>();
    const related = new Set<string>();
    for (const g of groups) {
      const keys = [...new Set(g.map((id) => courseKey(first.get(id)!)))];
      for (const x of keys) {
        for (const y of keys) {
          if (x > y || !covers(x, y) || !covers(y, x)) continue;
          courses.join(x, y);
          related.add(x).add(y);
        }
      }
    }
    // A rule for each set of related courses, without section letters.
    const courseSets = new Map<string, string[]>();
    for (const x of related) courseSets.set(courses.root(x), [...(courseSets.get(courses.root(x)) ?? []), x]);
    for (const keys of [...courseSets.values()].map((k) => k.sort((a, b) => naturalCompare(courseName(a), courseName(b))))) {
      addRule(keys.map(courseName).join("; "), keys[0]!.split("\u0000")[1]!, same, keys.map((k) => ({ course: courseName(k), section: "" })));
    }
    // A rule naming the sections of each group those do not cover.
    for (const g of groups) {
      const keys = new Set(g.map((id) => courseKey(first.get(id)!)));
      if ([...keys].every((k) => related.has(k)) && new Set([...keys].map((k) => courses.root(k))).size === 1) continue;
      // A course all of whose sections are in the group is still named without letters.
      const byCourse = new Map<string, string[]>();
      for (const id of g) byCourse.set(courseKey(first.get(id)!), [...(byCourse.get(courseKey(first.get(id)!)) ?? []), id]);
      const letters = (k: string, ids: string[]) => (ids.length === sectionsOf.get(k)!.length ? [] : ids.map((id) => first.get(id)!.section));
      addRule(
        [...byCourse].map(([k, ids]) => [courseName(k), letters(k, ids).join(", ")].filter(Boolean).join(" ")).join("; "),
        first.get(g[0]!)!.term,
        same,
        [...byCourse].flatMap(([k, ids]) => { const l = letters(k, ids); return l.length ? l.map((section) => ({ course: courseName(k), section })) : [{ course: courseName(k), section: "" }]; }),
      );
    }
  }
  for (const d of drafts.values()) writeRule(d);

  const n = new Set(constraints.map((c) => c.constraint)).size;
  issues.push({
    severity: "info", sheet: "Constraints",
    message: n === 0
      ? "Infer colocations: no colocated sections were found"
      : `Infer colocations: made ${n} colocate rule${n === 1 ? "" : "s"} for sections that ${colocated ? "are marked Colocated and " : ""}meet at the same time in the same room${colocated ? " (or with the same instructor)" : ""}`,
  });
  if (colocated) {
    const found = new Set(joined.flatMap((p) => [p.a, p.b]));
    for (const id of [...colocated].filter((id) => first.has(id) && !found.has(id)).sort((a, b) => naturalCompare(label(a), label(b)))) {
      issues.push({ severity: "warning", sheet: "Sessions", message: `${label(id)} (${first.get(id)!.term}) is marked Colocated, but no other section here meets with it; it may be colocated with a course of another department` });
    }
  }
  return { constraints, issues };
}
