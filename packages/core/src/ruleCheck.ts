/** Checking a schedule against its constraint rules (and the built-in standard times), and the colocations the rules allow. */
import { sameText as sameLetter } from "./text.js";
import { constraintNames, constraintNamesInstructor, courseMatches, listingKeys, normCourse } from "./constraints.js";
import { displayNames, listingsOf } from "./names.js";
import { formatTime } from "./format.js";
import { checkCohort } from "./cohortCheck.js";
import { meetingsOverlap, scheduled, weeksConcurrent } from "./overlap.js";
import { DAY_ORDER, DEFAULT_STANDARD_TIMES, type Constraint, type Schedule, type Session, type StandardTime } from "./types.js";
import { STANDARD_TIMES_RULE, ruleDays, rulesOf, termMatches, type Rule } from "./ruleModel.js";
import { dayList, interval, meetsMode } from "./ruleText.js";
import { applyChanges, isStandardTime, standardAdvice, subsetOfStandard } from "./standardTimes.js";

export interface RuleViolation {
  rule: string;
  /** From the built-in standard-times check rather than from a rule in the schedule. */
  builtin?: boolean;
  type: Rule["type"];
  academicYear: string;
  term: string;
  /** What is wrong, in a sentence. */
  message: string;
  /** In a merged schedule: other rules (by their merged names) that are the same rule saved in another schedule, checked here only once. */
  sameAs?: string[];
  /** The sections involved. */
  sectionIds: string[];
  /** The meetings to highlight in views. */
  sessions: Session[];
}


/**
 * Every constraint rule that is not met, per academic year and term (rules apply within a term).
 *
 * - **take together**: the rule's course lines are expanded into courses (a pattern such as
 *   `MUSC 3*` stands for each matching course), keeping those offered in the term. Choosing one
 *   section of each of some `n` of them (n = `count`, default all, never more than are offered),
 *   must be possible with no two chosen sections overlapping (`choose` "some"). With "any", this
 *   must hold for every set of n courses, not just for some set. Rules with fewer than two courses
 *   offered in a term are skipped there.
 * - **window**: each section named (by course pattern or instructor, in the term) that has a
 *   scheduled meeting is tested: it "meets in the interval" on a day if one of its meetings that
 *   day overlaps (or lies within) the interval; it holds if that is true on any / all of the rule's
 *   days; it satisfies a *should* rule if it holds and a *should not* rule if it does not. Every
 *   section must satisfy the rule, or, with `count`, that many of them.
 */
export function findRuleViolations(schedule: Schedule, opts: { advice?: boolean } = {}): RuleViolation[] {
  // Schedules are never changed in place, so the result for a schedule object can be kept and handed out again. Callers must not
  // change it. Advice (which sections of a cohort to move apart) costs more and is only worked out when asked for; a result with
  // advice also serves a request without.
  const kept = ruleCache.get(schedule) ?? {};
  const hit = opts.advice ? kept.advised : (kept.plain ?? kept.advised);
  if (hit) return hit;
  const found = checkRules(schedule, opts.advice === true);
  ruleCache.set(schedule, opts.advice ? { ...kept, advised: found } : { ...kept, plain: found });
  return found;
}

const ruleCache = new WeakMap<Schedule, { plain?: RuleViolation[]; advised?: RuleViolation[] }>();

function checkRules(schedule: Schedule, advice: boolean): RuleViolation[] {
  // In a merged schedule, a rule about sections one at a time (the standard times, a window rule for every section) belongs to the
  // schedule it came from and applies only to that schedule's sections. A rule about sections together (take together, cohort planning,
  // back-to-back, colocate, a window rule with a count) is checked against the whole merged schedule.
  const scopes = [...new Set([...schedule.sessions, ...schedule.constraints].map((x) => x.scope).filter((x): x is string => x !== undefined))];
  if (scopes.length === 0) return violationsIn(schedule, "all", advice);
  const scoped = scopes.flatMap((scope) => {
    const sessions = schedule.sessions.filter((s) => s.scope === scope);
    const ids = new Set(sessions.map((s) => s.sectionId));
    return violationsIn({ ...schedule, sessions, constraints: schedule.constraints.filter((c) => c.scope === scope), crossListings: schedule.crossListings.filter((c) => ids.has(c.sectionId)) }, "scoped", advice);
  });
  // The same rule saved in several schedules (a copy) is checked once, and its violations say which copies they stand for.
  const bySignature = new Map<string, string[]>();
  const byRule = new Map<string, Constraint[]>();
  for (const c of schedule.constraints) if (spansSchedules(c)) byRule.set(`${c.scope}\u0000${c.constraint}`, [...(byRule.get(`${c.scope}\u0000${c.constraint}`) ?? []), c]);
  const constraints: Constraint[] = [];
  for (const rows of byRule.values()) {
    const signature = JSON.stringify(rows.map(({ constraint: _n, scope: _s, comment: _c, ...rest }) => rest));
    const names = bySignature.get(signature);
    if (names) {
      names.push(rows[0]!.constraint);
      continue;
    }
    bySignature.set(signature, [rows[0]!.constraint]);
    constraints.push(...rows);
  }
  const twins = new Map([...bySignature.values()].filter((n) => n.length > 1).map((n) => [n[0]!, n.slice(1)] as const));
  const global = violationsIn({ ...schedule, constraints }, "global", advice).map((v) => (twins.has(v.rule) ? { ...v, sameAs: twins.get(v.rule)! } : v));
  return [...scoped, ...global];
}

/** Does the rule this row belongs to look at sections together, so that in a merged schedule it reaches across the schedules? */
export const spansSchedules = (c: Pick<Constraint, "type" | "count">) => c.type === "window" ? c.count !== undefined : c.type !== "standard" && c.type !== "subset";

function violationsIn(all: Schedule, mode: "all" | "scoped" | "global", advice: boolean): RuleViolation[] {
  const schedule = { ...all, constraints: all.constraints.filter((c) => c.active && (mode === "all" || (mode === "global") === spansSchedules(c))) }; // a deactivated rule is not checked
  const names = displayNames(schedule);
  const bySection = new Map<string, Session[]>();
  for (const s of schedule.sessions) bySection.set(s.sectionId, [...(bySection.get(s.sectionId) ?? []), s]);
  const primaries = [...bySection.values()].map((rows) => rows[0]!);
  const label = (sectionId: string) => `${names.get(sectionId) ?? sectionId} ${bySection.get(sectionId)![0]!.section}`;

  const overlapCache = new Map<string, boolean>();
  const sectionsOverlap = (a: string, b: string): boolean => {
    if (a === b) return true; // one section cannot stand for two courses
    const k = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
    let v = overlapCache.get(k);
    if (v === undefined) {
      v = bySection.get(a)!.some((x) => bySection.get(b)!.some((y) => meetingsOverlap(schedule, x, y)));
      overlapCache.set(k, v);
    }
    return v;
  };

  const groups = new Map<string, { year: string; term: string; sections: Session[] }>();
  for (const p of primaries) {
    const g = groups.get(`${p.academicYear}\u0000${p.term}`) ?? { year: p.academicYear, term: p.term, sections: [] };
    g.sections.push(p);
    groups.set(`${p.academicYear}\u0000${p.term}`, g);
  }

  const out: RuleViolation[] = [];
  const rules = rulesOf(schedule);
  for (const rule of rules) {
    if (rule.type === "consecutive") {
      consecutive(rule);
      continue;
    }
    if (rule.type === "colocate" || rule.type === "colocateDifferent") continue; // they only silence conflicts (`allowedCollisions`)
    if (rule.type === "standard" || rule.type === "subset") continue; // they change what the standard-times check accepts, below
    let cohortSeen = false;
    for (const g of groups.values()) {
      if (!termMatches(rule.term, g.term)) continue;
      if (rule.type === "takeable") takeable(rule, g);
      else if (rule.type === "cohortPlan") cohortSeen = checkCohort(rule, g, { schedule, bySection, label, overlap: sectionsOverlap, advice, report: (v) => out.push(v) }) || cohortSeen;
      else window(rule, g);
    }
    // A cohort rule none of whose courses is offered in any term it covers is not met, not vacuously satisfied.
    if (rule.type === "cohortPlan" && !cohortSeen && rule.elements.some((e) => e.students !== undefined && e.courses.length > 0)) {
      out.push({ rule: rule.name, type: "cohortPlan", academicYear: "", term: "", message: "None of the courses in this rule are offered in the schedule, so its students cannot take them", sectionIds: [], sessions: [] });
    }
  }
  if (mode !== "global") for (const g of groups.values()) standardTimes(g);
  return out;

  /** Sections of the group that a rule's course lines name. */
  function named(rule: Rule, g: { sections: Session[] }) {
    return g.sections.filter((p) => rule.items.some((it) => constraintNames({ course: it.course, section: it.section } as Constraint, listingKeys(schedule, p), p.section)));
  }

  /**
   * The built-in standard-times check (always on): every scheduled meeting must be one of the department's standard
   * patterns, as changed by the `standard` rules that name its section (in the order they are listed).
   */
  function standardTimes(g: { year: string; term: string; sections: Session[] }) {
    const changing = rules.filter((r) => r.type === "standard" && termMatches(r.term, g.term));
    const subsetting = rules.filter((r) => r.type === "subset" && termMatches(r.term, g.term));
    const effective = new Map<string, StandardTime[]>();
    for (const p of g.sections) {
      const mine = changing.filter((r) => named(r, { sections: [p] }).length > 0);
      const key = mine.map((r) => r.name).join("\u0000");
      let times = effective.get(key);
      if (!times) {
        times = mine.reduce((t, r) => applyChanges(t, r.changes), DEFAULT_STANDARD_TIMES);
        effective.set(key, times);
      }
      // A section a “subset of standard times” rule names may use some, but not all, of the days of a standard time.
      const mayUseSubset = subsetting.some((r) => named(r, { sections: [p] }).length > 0);
      const odd = bySection.get(p.sectionId)!.filter((m) => scheduled(m) && !isStandardTime(m, times) && !(mayUseSubset && subsetOfStandard(m, times) !== undefined));
      if (odd.length === 0) continue;
      const what = odd.map((m) => `${dayList(m.days)} ${formatTime(m.start!)}–${formatTime((m.start! + m.duration!) % 1440)} (${m.duration} min)`);
      const tails = [...new Set(odd.map((m) => {
        const whole = subsetOfStandard(m, times!);
        if (whole) return `which is not a standard time (only some of the days of ${dayList(whole)} at that time; a “Subset of standard times” rule allows that)`;
        // Standard by default, but a rule took it away: say so, instead of listing starts that seem to leave it out.
        if (mine.length > 0 && isStandardTime(m, DEFAULT_STANDARD_TIMES)) return `which is a standard time, but not allowed by ${mine.map((r) => `“${r.name}”`).join(", ")}; ${standardAdvice(m, times!).replace(/^standard /, "allowable ")}`;
        return `which is not a standard time (${standardAdvice(m, times!)})`;
      }))].join("; and ");
      out.push({
        rule: STANDARD_TIMES_RULE,
        builtin: true,
        type: "standard",
        academicYear: g.year,
        term: g.term,
        message: `${label(p.sectionId)} meets ${[...new Set(what)].join(" and ")}, ${tails}`,
        sectionIds: [p.sectionId],
        sessions: odd,
      });
    }
  }

  /** Back-to-back classes of each instructor named: at most n in a row (per term), or at least n somewhere in each term. */
  function consecutive(rule: Rule) {
    const n = rule.count;
    if (n === undefined) return;
    const classLabel = (m: Session) => `${label(m.sectionId)} ${formatTime(m.start!)}–${formatTime((m.start! + m.duration!) % 1440)}`;
    const people = [...new Set(rule.items.map((it) => it.instructor.trim()).filter(Boolean))];
    for (const person of people) {
      const key = normCourse(person);
      const mine = schedule.sessions.filter((s) => scheduled(s) && s.faculty.some((f) => normCourse(f.name) === key) && termMatches(rule.term, s.term));
      const years = [...new Set(mine.map((s) => s.academicYear))];
      for (const year of years) {
        // runs of consecutive classes: per term and day, in start order
        const runs: { term: string; day: string; classes: Session[]; sections: string[] }[] = [];
        const terms = [...new Set(mine.filter((s) => s.academicYear === year).map((s) => s.term))];
        for (const term of terms) {
          for (const day of "MTWRFSU") {
            const todays = mine.filter((s) => s.academicYear === year && s.term === term && s.days.includes(day)).sort((a, b) => a.start! - b.start!);
            let chain: Session[] = [];
            const flush = () => {
              if (chain.length) runs.push({ term, day, classes: chain, sections: [...new Set(chain.map((c) => c.sectionId))] });
              chain = [];
            };
            for (const m of todays) {
              const last = chain[chain.length - 1];
              const between = last ? m.start! - (last.start! + last.duration!) : 0;
              if (last && between >= 0 && between <= rule.gap && weeksConcurrent(schedule, last, m)) chain.push(m);
              else {
                flush();
                chain.push(m);
              }
            }
            flush();
          }
        }
        if (runs.length === 0) continue;
        if (rule.bound === "atMost") {
          for (const run of runs.filter((r) => r.sections.length > n)) {
            out.push({
              rule: rule.name,
              type: "consecutive",
              academicYear: year,
              term: run.term,
              message: `${person} teaches ${run.sections.length} consecutive classes on ${run.day}: ${run.classes.map(classLabel).join(", ")} (at most ${n})`,
              sectionIds: run.sections,
              sessions: run.classes,
            });
          }
        } else {
          // at least n somewhere in the term: checked for each term the instructor teaches in
          for (const term of terms) {
            const here = runs.filter((r) => r.term === term);
            const best = here.reduce((a, b) => (b.sections.length > a.sections.length ? b : a));
            if (best.sections.length < n) {
              out.push({
                rule: rule.name,
                type: "consecutive",
                academicYear: year,
                term,
                message: `${person} never teaches ${n} consecutive classes in ${term} (the most is ${best.sections.length}${best.sections.length > 1 ? `, on ${best.day}` : ""})`,
                sectionIds: best.sections,
                sessions: [],
              });
            }
          }
        }
      }
    }
  }

  function takeable(rule: Rule, g: { year: string; term: string; sections: Session[] }) {
    const items = new Map<string, { label: string; sectionIds: Set<string> }>();
    for (const it of rule.items) {
      if (!it.course.trim()) continue;
      for (const s of g.sections) {
        if (it.section.trim() && !sameLetter(it.section, s.section)) continue;
        for (const l of listingsOf(s, schedule.crossListings)) {
          if (!courseMatches(it.course, l.prefix, l.courseNumber)) continue;
          const course = `${l.prefix} ${l.courseNumber}`;
          const key = normCourse(course) + (it.section.trim() ? `|${it.section.trim().toLowerCase()}` : "");
          const item = items.get(key) ?? { label: it.section.trim() ? `${course} ${s.section}` : course, sectionIds: new Set<string>() };
          item.sectionIds.add(s.sectionId);
          items.set(key, item);
        }
      }
    }
    const list = [...items.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
    const need = Math.min(rule.count ?? list.length, list.length);
    if (list.length < 2 || need < 2) return;

    // "any n": every set of n courses must be takeable together, not just some set.
    if (rule.choose === "any" && need < list.length) {
      const failing: number[][] = [];
      let tried = 0;
      let failures = 0;
      const feasible = (idx: number[]): boolean => {
        const picked: string[] = [];
        const go = (k: number): boolean => {
          if (k === idx.length) return true;
          for (const sid of list[idx[k]!]!.sectionIds) {
            if (picked.every((c) => !sectionsOverlap(c, sid))) {
              picked.push(sid);
              if (go(k + 1)) return true;
              picked.pop();
            }
          }
          return false;
        };
        return go(0);
      };
      const combine = (from: number, idx: number[]) => {
        if (tried >= 20000) return;
        if (idx.length === need) {
          tried++;
          if (!feasible(idx)) {
            failures++;
            if (failing.length < 8) failing.push([...idx]);
          }
          return;
        }
        for (let i = from; i <= list.length - (need - idx.length); i++) combine(i + 1, [...idx, i]);
      };
      combine(0, []);
      if (failures === 0) return;
      const clashing = new Set<string>();
      for (const idx of failing) {
        for (let a = 0; a < idx.length; a++) {
          for (let b = a + 1; b < idx.length; b++) {
            for (const x of list[idx[a]!]!.sectionIds) for (const y of list[idx[b]!]!.sectionIds) if (sectionsOverlap(x, y)) clashing.add(x).add(y);
          }
        }
      }
      const sets = failing.slice(0, 4).map((idx) => idx.map((i) => list[i]!.label).join(" + ")).join(", ") + (failures > 4 ? `, and ${failures - 4} more` : "");
      const involved = [...clashing];
      out.push({
        rule: rule.name,
        type: "takeable",
        academicYear: g.year,
        term: g.term,
        message: `Not every ${need} of the ${list.length} courses can be taken together: ${sets}`,
        sectionIds: involved.length ? involved : [...new Set(list.flatMap((x) => [...x.sectionIds]))],
        sessions: involved.flatMap((id) => bySection.get(id)!),
      });
      return;
    }

    // "some n" (or all): can `need` courses be taken, one section each, with none overlapping?
    let best = 0;
    const chosen: string[] = [];
    const search = (i: number) => {
      if (chosen.length > best) best = chosen.length;
      if (best >= need || i === list.length || chosen.length + (list.length - i) <= best) return;
      for (const sid of list[i]!.sectionIds) {
        if (chosen.every((c) => !sectionsOverlap(c, sid))) {
          chosen.push(sid);
          search(i + 1);
          chosen.pop();
          if (best >= need) return;
        }
      }
      search(i + 1);
    };
    search(0);
    if (best >= need) return;

    // Which sections of different courses overlap? They explain the problem.
    const pairs: [string, string][] = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        for (const a of list[i]!.sectionIds) for (const b of list[j]!.sectionIds) if (sectionsOverlap(a, b)) pairs.push([a, b]);
      }
    }
    const involved = [...new Set(pairs.flat())];
    const sample = pairs.slice(0, 4).map(([a, b]) => `${label(a)} × ${label(b)}`).join(", ") + (pairs.length > 4 ? `, and ${pairs.length - 4} more` : "");
    const needs = need === list.length ? `all ${need}` : String(need);
    out.push({
      rule: rule.name,
      type: "takeable",
      academicYear: g.year,
      term: g.term,
      message: `Only ${best} of the ${list.length} courses can be taken together (needs ${needs})${sample ? `: ${sample}` : ""}`,
      sectionIds: involved.length ? involved : [...new Set(list.flatMap((x) => [...x.sectionIds]))],
      sessions: involved.flatMap((id) => bySection.get(id)!),
    });
  }

  function window(rule: Rule, g: { year: string; term: string; sections: Session[] }) {
    if (rule.from === undefined || rule.to === undefined) return;
    const from = rule.from;
    const to = rule.to;
    const days = [...ruleDays(rule)].filter((d) => DAY_ORDER.includes(d));
    const mode = meetsMode(rule);
    const subject = g.sections.filter((p) =>
      rule.items.some((it) => {
        const row = { course: it.course, section: it.section, instructor: it.instructor } as Constraint;
        return constraintNames(row, listingKeys(schedule, p), p.section) || constraintNamesInstructor(row, p);
      }),
    ).filter((p) => bySection.get(p.sectionId)!.some(scheduled));

    const hitDays = (id: string) =>
      days.filter((d) =>
        bySection.get(id)!.some((m) => {
          if (!scheduled(m) || !m.days.includes(d)) return false;
          const end = m.start + m.duration;
          return mode === "within" ? m.start >= from && end <= to : m.start < to && from < end;
        }),
      );
    const holds = (id: string) => {
      const hit = hitDays(id);
      return rule.dayRule === "all" ? hit.length === days.length : hit.length > 0;
    };
    const passes = (id: string) => (rule.should === "should" ? holds(id) : !holds(id));

    const verb = mode === "within" ? "within" : "during";
    const where = `${interval(rule)} on ${days.length === 1 ? days[0] : `${rule.dayRule} of ${dayList(days.join(""))}`}`;
    if (rule.count === undefined) {
      for (const p of subject) {
        if (passes(p.sectionId)) continue;
        const message =
          rule.should === "should"
            ? `${label(p.sectionId)} does not meet ${verb} ${where}`
            : `${label(p.sectionId)} meets ${verb} ${interval(rule)} on ${dayList(hitDays(p.sectionId).join(""))}`;
        out.push({ rule: rule.name, type: "window", academicYear: g.year, term: g.term, message, sectionIds: [p.sectionId], sessions: bySection.get(p.sectionId)!.filter(scheduled) });
      }
      return;
    }
    const ok = subject.filter((p) => passes(p.sectionId)).length;
    const need = Math.min(rule.count, subject.length);
    if (subject.length === 0 || ok >= need) return;
    out.push({
      rule: rule.name,
      type: "window",
      academicYear: g.year,
      term: g.term,
      message: `Only ${ok} of ${subject.length} section${subject.length === 1 ? "" : "s"} ${rule.should === "should" ? "meet" : "avoid meeting"} ${verb} ${where} (needs ${need})`,
      sectionIds: subject.map((p) => p.sectionId),
      sessions: [],
    });
  }
}

/**
 * Whether a pair of sections is colocated: some colocate rule names both (within its terms, and, in a merged schedule, within the
 * schedule the rule came from) and the instructors fit the rule. “Colocate (same instructor)” is for one instructor teaching several
 * classes at once, so it applies to a pair that shares an instructor; “Colocate (different instructors)” is for classes sharing a large
 * space (a gym, a pool), so it applies to a pair that shares none. `sharesInstructor` says which this pair is. Colocated sections are
 * not reported as conflicting (`findConflicts`); a pair the rules do not fit is reported as usual.
 */
export function allowedCollisions(schedule: Schedule): (sectionIdA: string, sectionIdB: string, sharesInstructor: boolean) => boolean {
  const rows = schedule.constraints.filter((c) => c.active && (c.type === "colocate" || c.type === "colocateDifferent"));
  if (rows.length === 0) return () => false;
  const first = new Map<string, Session>();
  for (const s of schedule.sessions) if (!first.has(s.sectionId)) first.set(s.sectionId, s);
  const byRule = new Map<string, { sections: Set<string>; sameInstructor: boolean }>();
  for (const c of rows) {
    const key = `${c.scope ?? ""}\u0000${c.constraint}`;
    const rule = byRule.get(key) ?? { sections: new Set<string>(), sameInstructor: c.type === "colocate" };
    for (const p of first.values()) {
      if (!termMatches(c.term, p.term)) continue;
      if (constraintNames({ course: c.course, section: c.section } as Constraint, listingKeys(schedule, p), p.section)) rule.sections.add(p.sectionId);
    }
    byRule.set(key, rule);
  }
  const rules = [...byRule.values()];
  return (a, b, sharesInstructor) => rules.some((r) => r.sections.has(a) && r.sections.has(b) && r.sameInstructor === sharesInstructor);
}
