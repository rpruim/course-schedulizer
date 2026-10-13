import { findConflicts } from "./conflicts.js";
import { naturalCompare } from "./text.js";
import type { Constraint, Issue, Schedule, Session } from "./types.js";

/**
 * Colocate rules for the sections of a schedule that meet together: sections at overlapping times in the same room. When the
 * registrar's report says which sections are colocated (`colocated`, from its Colocated column), only those are joined, and they may
 * also be joined by sharing an instructor (their room may be missing); a marked section that meets with no other marked section is
 * reported, since it is likely colocated with a course another department schedules.
 *
 * Sections joined (directly or through others) make one rule per term: “same instructor” for pairs that share an instructor and
 * “different instructors” for those that do not, as `allowedCollisions` expects. A course all of whose sections in the term are in
 * the group is listed without section letters (“MUSC 182”), so the rule still holds when its sections are renamed or added.
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
  // How many sections each course has in each year and term.
  const courseKey = (s: Session) => `${s.academicYear}\u0000${s.term}\u0000${s.prefix} ${s.courseNumber}`;
  const sectionCount = new Map<string, number>();
  for (const s of first.values()) sectionCount.set(courseKey(s), (sectionCount.get(courseKey(s)) ?? 0) + 1);
  const label = (id: string) => { const s = first.get(id)!; return `${s.prefix} ${s.courseNumber} ${s.section}`; };
  for (const same of [true, false]) {
    // Groups of sections joined by pairs of this kind.
    const parent = new Map<string, string>();
    const root = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = root(p); parent.set(x, r); return r; };
    const kind = joined.filter((p) => p.instructor === same);
    for (const p of kind) parent.set(root(p.a), root(p.b));
    const groups = new Map<string, string[]>();
    for (const id of new Set(kind.flatMap((p) => [p.a, p.b]))) groups.set(root(id), [...(groups.get(root(id)) ?? []), id]);
    for (const ids of [...groups.values()].map((g) => g.sort((a, b) => naturalCompare(label(a), label(b))))) {
      const term = first.get(ids[0]!)!.term;
      // The sections of each course; a course whose sections are all here is named without letters.
      const byCourse = new Map<string, { sections: Session[]; whole: boolean }>();
      for (const id of ids) {
        const s = first.get(id)!;
        const c = `${s.prefix} ${s.courseNumber}`;
        byCourse.set(c, { sections: [...(byCourse.get(c)?.sections ?? []), s], whole: false });
      }
      for (const v of byCourse.values()) v.whole = v.sections.length === sectionCount.get(courseKey(v.sections[0]!));
      // “MUSC 182” for all its sections, “ARTS 258 A; ARTS 308 A” for some.
      const list = [...byCourse].map(([c, v]) => (v.whole ? c : `${c} ${v.sections.map((x) => x.section).join(", ")}`)).join("; ");
      let name = `Colocated: ${list} (${term})`;
      for (let n = 2; taken.has(name); n++) name = `Colocated: ${list} (${term}) (${n})`;
      taken.add(name);
      const items = [...byCourse].flatMap(([course, v]) => (v.whole ? [{ course, section: "" }] : v.sections.map((x) => ({ course, section: x.section }))));
      items.forEach(({ course, section }, i) => {
        constraints.push({
          constraint: name, type: same ? "colocate" : "colocateDifferent", course, section, instructor: "",
          term, choose: "some", bound: "atMost", gap: 20, dayRule: "any", should: "should not", meets: "", active: true, action: "", starts: [], days: "",
          comment: i === 0 ? (colocated ? "Inferred at import from the Colocated column and the times and rooms" : "Inferred at import: same times and room") : "",
        });
      });
    }
  }

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
