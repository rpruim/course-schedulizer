/** Constraint rules as the app works with them: a rule gathered from its constraint rows, written back as rows, saved, copied and checked for completeness. */
import { normCourse } from "./constraints.js";
import type { Constraint, Schedule } from "./types.js";

/** One line of a rule: a course pattern (with an optional section letter), or an instructor. */
export interface RuleItem {
  course: string;
  section: string;
  instructor: string;
}

/** One change to the standard times: allow, or stop allowing, meetings on these days (of this length, starting at these times). */
export interface StandardChange {
  action: "allow" | "disallow";
  days: string;
  /** Minutes; blank on a disallow = any length. */
  duration?: number;
  /** Minutes since midnight; empty on a disallow = any start. */
  starts: number[];
}

/** The name the built-in standard-times check goes by in reports. */
export const STANDARD_TIMES_RULE = "Standard times";

/** Does a rule's `term` setting (codes separated by commas or spaces; blank = every term) include this term? */
export const termMatches = (setting: string, term: string): boolean => {
  const terms = setting.split(/[,;\s]+/).filter(Boolean);
  return terms.length === 0 || terms.some((t) => t.toLowerCase() === term.toLowerCase());
};
export const termList = (setting: string): string[] => setting.split(/[,;\s]+/).filter(Boolean);

/** One element of a cohort planning rule: this many students must be able to take all of these courses. */
export interface CohortElement {
  /** Blank (undefined) while it is being typed. */
  students: number | undefined;
  /** Courses as `PREFIX NUMBER`. */
  courses: string[];
}

/** The seats in each section of a course (blank while it is being typed). */
export interface Capacity {
  course: string;
  seats: number | undefined;
}

/** A constraint as the editor sees it: the rows that share a name, gathered into one object. */
export interface Rule {
  name: string;
  type: "takeable" | "window" | "standard" | "subset" | "colocate" | "colocateDifferent" | "cohortPlan" | "consecutive";
  items: RuleItem[];
  /** `cohortPlan` rules: the groups of students and the courses each must be able to take. */
  elements: CohortElement[];
  /** `cohortPlan` rules: the seats in each section of each course. */
  capacities: Capacity[];
  /** `standard` rules: the changes to the standard times. */
  changes: StandardChange[];
  count?: number;
  /** Take together with a `count`: some set of that many courses must work, or every set must. */
  choose: "some" | "any";
  /** Back-to-back rules: at most / at least `count` consecutive classes. */
  bound: "atMost" | "atLeast";
  /** Back-to-back rules: minutes between one class ending and the next starting for them to be consecutive. */
  gap: number;
  term: string;
  days: string;
  dayRule: "any" | "all";
  from?: number;
  to?: number;
  should: "should" | "should not";
  meets: "" | "overlaps" | "within";
  /** False = deactivated: kept, but not checked. */
  active: boolean;
  comment: string;
}

export const emptyRule = (type: Rule["type"] = "takeable"): Rule => ({
  name: "", type, items: [], elements: [], capacities: [], changes: [], choose: "some", bound: "atMost", gap: 20, term: "", days: "", dayRule: "any", should: "should not", meets: "", active: true, comment: "",
  ...(type === "window" ? { from: 600, to: 660 } : {}),
  ...(type === "consecutive" ? { count: 3 } : {}),
});

/** What a window rule is about: sections of courses, or sections taught by instructors (all lines of a rule are one or the other). */
export const ruleSubject = (r: Pick<Rule, "items">): "courses" | "instructors" =>
  r.items.length > 0 && r.items.every((i) => i.instructor.trim() !== "" && i.course.trim() === "") ? "instructors" : "courses";

/** The days a window rule looks at: its own, or Monday to Friday. */
export const ruleDays = (r: Pick<Rule, "days">) => r.days || "MTWRF";

/** The constraint rows, gathered by name (in order of first appearance) into rules. */
export function rulesOf(schedule: Schedule): Rule[] {
  const byName = new Map<string, Constraint[]>();
  for (const c of schedule.constraints) byName.set(c.constraint, [...(byName.get(c.constraint) ?? []), c]);
  return [...byName].map(([name, rows]) => {
    const f = rows[0]!;
    const comments = [...new Set(rows.map((r) => r.comment.trim()).filter(Boolean))];
    const cohort = f.type === "cohortPlan";
    const elements = new Map<number, CohortElement>();
    if (cohort) {
      for (const r of rows) {
        if (r.element === undefined) continue;
        const e = elements.get(r.element) ?? { students: r.count, courses: [] };
        if (e.students === undefined) e.students = r.count;
        if (r.course.trim()) e.courses.push(r.course.trim());
        elements.set(r.element, e);
      }
    }
    return {
      name,
      type: f.type,
      elements: [...elements].sort((a, b) => a[0] - b[0]).map(([, e]) => e),
      capacities: cohort ? rows.filter((r) => r.element === undefined && r.capacity !== undefined).map((r) => ({ course: r.course.trim(), seats: r.capacity })) : [],
      items: cohort ? [] : rows.filter((r) => r.action === "").map((r) => ({ course: r.course, section: r.section, instructor: r.instructor })),
      changes: rows.filter((r) => r.action !== "").map((r) => ({ action: r.action as "allow" | "disallow", days: r.days, ...(r.duration !== undefined ? { duration: r.duration } : {}), starts: r.starts })),
      ...(f.count !== undefined ? { count: f.count } : {}),
      choose: f.choose,
      bound: f.bound,
      gap: f.gap,
      term: f.term,
      days: f.days,
      dayRule: f.dayRule,
      ...(f.from !== undefined ? { from: f.from } : {}),
      ...(f.to !== undefined ? { to: f.to } : {}),
      should: f.should,
      meets: f.meets,
      active: rows.every((r) => r.active),
      comment: comments.join("; "),
    };
  });
}

/** A rule as constraint rows: the rule's settings repeat on every row; the comment goes on the first. */
export function rulesToRows(rule: Rule): Constraint[] {
  if (rule.type === "cohortPlan") return cohortRows(rule);
  const window = rule.type === "window";
  const common = {
    constraint: rule.name,
    type: rule.type,
    ...(rule.count !== undefined ? { count: rule.count } : {}),
    choose: rule.choose,
    bound: rule.bound,
    gap: rule.gap,
    term: rule.term.trim(),
    dayRule: rule.dayRule,
    ...(window && rule.from !== undefined ? { from: rule.from } : {}),
    ...(window && rule.to !== undefined ? { to: rule.to } : {}),
    should: rule.should,
    meets: window ? rule.meets : "",
    active: rule.active,
  };
  const items = rule.items.map((it, i) => ({
    ...common,
    course: it.course.trim(),
    section: it.section.trim(),
    instructor: it.instructor.trim(),
    action: "" as const,
    starts: [] as number[],
    days: window ? rule.days : "",
    comment: i === 0 ? rule.comment.trim() : "",
  }));
  const changes = (rule.type === "standard" ? rule.changes : []).map((c) => ({
    ...common,
    course: "",
    section: "",
    instructor: "",
    action: c.action,
    ...(c.duration !== undefined ? { duration: c.duration } : {}),
    starts: [...c.starts],
    days: c.days,
    comment: "",
  }));
  return [...items, ...changes];
}

/** A cohort planning rule as rows: a line for each course of each element (with the element and its students), then a seats line per course. */
function cohortRows(rule: Rule): Constraint[] {
  const base = { constraint: rule.name, type: "cohortPlan" as const, term: rule.term.trim(), choose: rule.choose, bound: rule.bound, gap: rule.gap, dayRule: rule.dayRule, should: rule.should, meets: "" as const, active: rule.active, section: "", instructor: "", action: "" as const, starts: [] as number[], days: "" };
  const rows: Constraint[] = [];
  rule.elements.forEach((e, i) => {
    for (const course of e.courses.filter((c) => c.trim())) {
      rows.push({ ...base, course: course.trim(), ...(e.students !== undefined ? { count: e.students } : {}), element: i + 1, comment: rows.length === 0 ? rule.comment.trim() : "" });
    }
  });
  for (const c of rule.capacities) {
    if (!c.course.trim()) continue;
    rows.push({ ...base, course: c.course.trim(), ...(c.seats !== undefined ? { capacity: c.seats } : {}), comment: rows.length === 0 ? rule.comment.trim() : "" });
  }
  return rows;
}

/** Turn the rule called `name` on or off (a deactivated rule is kept but not checked). */
export const setRuleActive = (schedule: Schedule, name: string, active: boolean): Schedule => ({ ...schedule, constraints: schedule.constraints.map((c) => (c.constraint === name ? { ...c, active } : c)) });

/** Replace the rule called `original` (or add a new one at the end) — returns a new schedule. */
export function saveRule(schedule: Schedule, original: string | undefined, rule: Rule): Schedule {
  const rows = rulesToRows(rule);
  if (original === undefined || !schedule.constraints.some((c) => c.constraint === original)) return { ...schedule, constraints: [...schedule.constraints, ...rows] };
  const at = schedule.constraints.findIndex((c) => c.constraint === original);
  const rest = schedule.constraints.filter((c) => c.constraint !== original);
  rest.splice(at, 0, ...rows);
  return { ...schedule, constraints: rest };
}

/**
 * Copy the rule called `name` from one schedule to another. A rule with that name already in the target is
 * left alone when it says the same thing (`already`); otherwise the copy is named `name (2)` and so on if
 * the name is taken (`renamed`), or keeps its name (`added`). `missing`: the source has no such rule.
 */
export function copyRule(from: Schedule, to: Schedule, name: string): { schedule: Schedule; name: string; result: "added" | "renamed" | "already" | "missing" } {
  const rows = from.constraints.filter((c) => c.constraint === name).map(({ scope: _scope, ...c }) => c);
  if (rows.length === 0) return { schedule: to, name, result: "missing" };
  const mine = to.constraints.filter((c) => c.constraint === name).map(({ scope: _scope, ...c }) => c);
  if (mine.length > 0 && JSON.stringify(mine) === JSON.stringify(rows)) return { schedule: to, name, result: "already" };
  const taken = new Set(to.constraints.map((c) => c.constraint.toLowerCase()));
  let copy = name;
  for (let n = 2; taken.has(copy.toLowerCase()); n++) copy = `${name} (${n})`;
  return { schedule: { ...to, constraints: [...to.constraints, ...rows.map((c) => ({ ...c, constraint: copy }))] }, name: copy, result: copy === name ? "added" : "renamed" };
}

export const deleteRule = (schedule: Schedule, name: string): Schedule => ({ ...schedule, constraints: schedule.constraints.filter((c) => c.constraint !== name) });

export interface RuleProblem {
  /** Which field, for the editor to mark: `name`, `items`, `count`, `days`, `from`, `to`, … */
  field: string;
  message: string;
}

/** What is wrong with a rule that is about to be saved; empty when it is fine. `original` is the name it had when opened. */
export function validateRule(schedule: Schedule, rule: Rule, original?: string): RuleProblem[] {
  const out: RuleProblem[] = [];
  const name = rule.name.trim();
  if (!name) out.push({ field: "name", message: "Give the rule a name." });
  else if (schedule.constraints.some((c) => c.constraint.toLowerCase() === name.toLowerCase() && c.constraint !== original)) out.push({ field: "name", message: `Another rule is already called “${name}”.` });
  if (rule.type !== "cohortPlan" && rule.items.length === 0) {
    const message = { takeable: "List at least two courses.", window: "Say which courses or instructors the rule is about.", standard: "Say which courses it applies to (* means every course).", subset: "Say which courses it applies to (* means every course).", colocate: "Say which course is colocated.", colocateDifferent: "Say which course is colocated.", cohortPlan: "", consecutive: "List at least one instructor." }[rule.type];
    out.push({ field: "items", message });
  }
  rule.items.forEach((it, i) => {
    if (!it.course.trim() && !it.instructor.trim()) out.push({ field: `items.${i}`, message: "Name a course or an instructor." });
    if (it.course.trim() && it.instructor.trim()) out.push({ field: `items.${i}`, message: "Use a course or an instructor on a line, not both." });
    if (rule.type === "window" && ruleSubject(rule) === "courses" && it.instructor.trim() && !it.course.trim()) out.push({ field: `items.${i}`, message: "A rule is about courses or about instructors, not both." });
    if ((rule.type === "takeable" || rule.type === "standard" || rule.type === "subset" || rule.type === "colocate" || rule.type === "colocateDifferent") && it.instructor.trim()) out.push({ field: `items.${i}`, message: `A “${rule.type === "standard" ? "standard times" : rule.type === "subset" ? "subset of standard times" : rule.type === "colocate" ? "colocate (same instructor)" : rule.type === "colocateDifferent" ? "colocate (different instructors)" : "take together"}” rule lists courses.` });
    if (rule.type === "consecutive" && it.course.trim()) out.push({ field: `items.${i}`, message: "A back-to-back rule lists instructors." });
    if (rule.type !== "consecutive" && it.course.trim() && !/^\S+(\s+\S+)?$/.test(it.course.trim())) out.push({ field: `items.${i}`, message: "Write a course as PREFIX NUMBER, for example MUSC 234 or MUSC 3*." });
  });
  if (rule.type === "takeable") {
    const wild = rule.items.some((it) => /[*?[]/.test(it.course) || !/\s/.test(it.course.trim()));
    if (rule.items.length === 1 && !wild) out.push({ field: "items", message: "A rule about taking courses together needs at least two courses." });
    if (rule.count !== undefined && !wild && rule.count > rule.items.length) out.push({ field: "count", message: `Only ${rule.items.length} courses are listed.` });
  } else if (rule.type === "consecutive") {
    if (rule.count === undefined) out.push({ field: "count", message: "Say how many consecutive classes." });
    if (!Number.isInteger(rule.gap) || rule.gap < 0 || rule.gap > 240) out.push({ field: "gap", message: "Use a number of minutes from 0 to 240." });
  } else if (rule.type === "window") {
    if (rule.from === undefined) out.push({ field: "from", message: "Give the start of the interval." });
    if (rule.to === undefined) out.push({ field: "to", message: "Give the end of the interval." });
    if (rule.from !== undefined && rule.to !== undefined && rule.from >= rule.to) out.push({ field: "to", message: "The interval must end after it starts." });
  }
  if (rule.type === "cohortPlan") out.push(...validateCohort(rule));
  if (rule.count !== undefined && (!Number.isInteger(rule.count) || rule.count < 1)) out.push({ field: "count", message: "Use a whole number, 1 or more." });
  for (const t of termList(rule.term)) {
    if (!schedule.settings.terms.some((x) => x.code.toLowerCase() === t.toLowerCase())) out.push({ field: "term", message: `“${t}” is not a term of this schedule.` });
  }
  if (rule.type === "standard") {
    if (rule.changes.length === 0) out.push({ field: "changes", message: "Add at least one change to the standard times." });
    rule.changes.forEach((c, i) => {
      if (!/^[MTWRFSU]+$/.test(c.days)) out.push({ field: `changes.${i}`, message: "Give the days as letters, for example MWF or TR (R is Thursday)." });
      if (c.duration !== undefined && (!Number.isInteger(c.duration) || c.duration < 1)) out.push({ field: `changes.${i}`, message: "The length is a number of minutes." });
      if (c.action === "allow" && (c.duration === undefined || c.starts.length === 0)) out.push({ field: `changes.${i}`, message: "To allow a time, give its length and at least one start time." });
    });
  }
  return out;
}

/** What is wrong with the elements and seats of a cohort planning rule. Every course named in an element needs its seats given. */
function validateCohort(rule: Rule): RuleProblem[] {
  const out: RuleProblem[] = [];
  if (rule.elements.length === 0) out.push({ field: "elements", message: "Add at least one group of students and the courses they must be able to take." });
  const seatsFor = new Map<string, number | undefined>();
  rule.capacities.forEach((c, i) => {
    if (!c.course.trim()) out.push({ field: `capacities.${i}`, message: "Name the course." });
    else if (!/^\S+\s+\S+$/.test(c.course.trim()) || /[*?[\]]/.test(c.course)) out.push({ field: `capacities.${i}`, message: "Write a course as PREFIX NUMBER, for example MUSC 234 (no patterns)." });
    if (c.seats === undefined) out.push({ field: `capacities.${i}`, message: "Give the seats in each section." });
    else if (!Number.isInteger(c.seats) || c.seats < 1) out.push({ field: `capacities.${i}`, message: "The seats are a whole number, 1 or more." });
    if (c.course.trim()) {
      const key = normCourse(c.course);
      if (seatsFor.has(key)) out.push({ field: `capacities.${i}`, message: `${c.course.trim()} is listed twice.` });
      seatsFor.set(key, c.seats);
    }
  });
  rule.elements.forEach((e, i) => {
    if (e.students === undefined) out.push({ field: `elements.${i}`, message: "Say how many students." });
    else if (!Number.isInteger(e.students) || e.students < 1) out.push({ field: `elements.${i}`, message: "The students are a whole number, 1 or more." });
    if (e.courses.length === 0) out.push({ field: `elements.${i}`, message: "List at least one course." });
    const seen = new Set<string>();
    for (const course of e.courses) {
      const key = normCourse(course);
      if (!course.trim()) out.push({ field: `elements.${i}`, message: "Name a course on every line." });
      else if (!/^\S+\s+\S+$/.test(course.trim()) || /[*?[\]]/.test(course)) out.push({ field: `elements.${i}`, message: `Write ${course.trim()} as PREFIX NUMBER, for example MUSC 234 (no patterns).` });
      else if (seen.has(key)) out.push({ field: `elements.${i}`, message: `${course.trim()} is listed twice in this group.` });
      else if (!seatsFor.has(key)) out.push({ field: `elements.${i}`, message: `Give the seats in each section of ${course.trim()} (under Seats).` });
      seen.add(key);
    }
  });
  return out;
}
