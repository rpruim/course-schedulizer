import { constraintNames, constraintNamesInstructor, courseMatches, listingKeys, normCourse } from "./constraints.js";
import { displayNames, listingsOf } from "./names.js";
import { formatTime } from "./format.js";
import { adviseTimes, planSeats, type SeatElement } from "./seats.js";
import { meetingsOverlap, scheduled, weeksConcurrent } from "./overlap.js";
import { DAY_ORDER, DEFAULT_STANDARD_TIMES, type Constraint, type Schedule, type Session, type StandardTime } from "./types.js";

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

const dayList = (days: string) => [...days].join(" ");
const interval = (r: Pick<Rule, "from" | "to">) => `${formatTime(r.from ?? 0)}–${formatTime(r.to ?? 0)}`;
const itemText = (it: RuleItem) => (it.instructor ? it.instructor : `${it.course}${it.section ? ` ${it.section}` : ""}`);
/** `overlaps` or `within`, resolving the blank default. */
export const meetsMode = (r: Pick<Rule, "meets" | "should">) => r.meets || (r.should === "should" ? "within" : "overlaps");

/** A rule in a sentence, for lists. */
export function describeRule(r: Rule): string {
  const items = r.items.map(itemText).join(", ") || "…";
  /** The sentence, led by the terms the rule is limited to (`In FA, …`); `lower`: its first word is a plain word, not a course or a name. */
  const lead = (sentence: string, lower = true) => (r.term.trim() ? `In ${termList(r.term).join(", ")}, ${lower ? sentence.charAt(0).toLowerCase() + sentence.slice(1) : sentence}` : sentence);
  if (r.type === "takeable") {
    const n = r.count === undefined ? "all" : `${r.choose} ${r.count}`;
    return lead(`A student must be able to take ${n} of ${items}.`);
  }
  if (r.type === "standard") {
    const everything = r.items.length > 0 && r.items.every((it) => it.course.trim() === "*");
    const at = (n: number) => formatTime(n).replace(/^0/, "");
    const change = (c: StandardChange) => {
      const times = `${c.duration !== undefined ? ` for ${c.duration} minutes` : ""}${c.starts.length ? ` starting ${c.starts.map(at).join(", ")}` : ""}`;
      return c.action === "allow" ? `also allow ${dayList(c.days)}${times}` : `stop allowing ${dayList(c.days)}${times}`;
    };
    return lead(`Modified standard times for ${everything ? "every course" : items}: ${r.changes.map(change).join("; ") || "no changes yet"}.`);
  }
  if (r.type === "subset") {
    const everything = r.items.length > 0 && r.items.every((it) => it.course.trim() === "*");
    return lead(`${everything ? "Every course" : items} may meet on only some of the days of a standard time (for example Tuesday alone when TR is standard).`, everything);
  }
  if (r.type === "cohortPlan") {
    const each = r.elements.map((e) => `${e.students ?? "…"} student${e.students === 1 ? "" : "s"} must be able to take ${e.courses.join(", ") || "…"}`).join("; ");
    const seats = r.capacities.map((c) => `${c.course} ${c.seats ?? "…"}`).join(", ");
    return lead(`${each || "No groups yet"}${seats ? `. Seats in each section: ${seats}` : ""}.`, false);
  }
  if (r.type === "colocate" || r.type === "colocateDifferent") {
    const everything = r.items.length > 0 && r.items.every((it) => it.course.trim() === "*");
    return lead(`${everything ? "Any courses" : items} ${r.items.length > 1 || everything ? "are" : "is"} colocated${r.type === "colocate" ? " (same instructor)" : " (different instructors)"}: ${r.items.length > 1 || everything ? "they" : "its sections"} may share a room at the same or overlapping times without a conflict.`, everything);
  }
  if (r.type === "consecutive") {
    const many = r.items.length > 1;
    const who = many ? `Each of ${items}` : items;
    const how = r.bound === "atMost" ? "at most" : "at least";
    const sentence = `${who} should teach ${how} ${r.count ?? "…"} consecutive ${r.count === 1 ? "class" : "classes"} (a class follows another when it starts within ${r.gap} minutes of the other's end).`;
    // "at least" is asked of every term, so it reads "In each term (FA, SP), …"
    if (r.bound === "atLeast") return `In each term${r.term.trim() ? ` (${termList(r.term).join(", ")})` : ""}, ${many ? sentence.charAt(0).toLowerCase() + sentence.slice(1) : sentence}`;
    return lead(sentence, many);
  }
  const people = ruleSubject(r) === "instructors";
  const of = people ? "sections taught by" : "sections of";
  const which = r.count === undefined ? `Every section ${people ? "taught by" : "of"}` : `At least ${r.count} of the ${of}`;
  const verb = r.should === "should" ? "should" : "should not";
  const how = meetsMode(r) === "within" ? "meet within" : "meet during";
  const days = ruleDays(r);
  const dayText = days.length === 1 ? `on ${days}` : `on ${r.dayRule} of ${dayList(days)}`;
  return lead(`${which} ${items} ${verb} ${how} ${interval(r)} ${dayText}.`);
}

/** Is this meeting at a standard time: exactly these days, this start, this length? */
export function isStandardTime(m: Pick<Session, "days" | "start" | "duration">, times: StandardTime[] = DEFAULT_STANDARD_TIMES): boolean {
  return times.some((t) => t.days === m.days && t.duration === m.duration && m.start !== undefined && t.starts.includes(m.start));
}

/**
 * A meeting that uses only some of the days of a standard time: the same start and length as a standard pattern, on some but not
 * all of its days (T at 8:00 for 100 minutes, where TR at 8:00 for 100 minutes is standard). Returns that pattern's days, or undefined.
 */
export function subsetOfStandard(m: Pick<Session, "days" | "start" | "duration">, times: StandardTime[] = DEFAULT_STANDARD_TIMES): string | undefined {
  if (m.start === undefined || m.days === "") return undefined;
  return times.find((t) => t.duration === m.duration && t.starts.includes(m.start!) && t.days !== m.days && [...m.days].every((d) => t.days.includes(d)))?.days;
}

/** Why a meeting is not at a standard time, and what would be: the standard starts for its days and length, else the lengths or days that exist. */
export function standardAdvice(m: Pick<Session, "days" | "start" | "duration">, times: StandardTime[] = DEFAULT_STANDARD_TIMES): string {
  const at = (n: number) => formatTime(n).replace(/^0/, "");
  const same = times.find((t) => t.days === m.days && t.duration === m.duration);
  if (same) return `standard ${dayList(m.days)} starts for ${m.duration} minutes: ${same.starts.map(at).join(", ")}`;
  const lengths = times.filter((t) => t.days === m.days);
  if (lengths.length) return `standard ${dayList(m.days)} lengths: ${lengths.map((t) => t.duration).join(", ")} minutes`;
  return `no standard time uses the days ${dayList(m.days)}`;
}

/** The standard times after allowing and disallowing the given patterns (later changes win). */
export function applyChanges(times: StandardTime[], changes: StandardChange[]): StandardTime[] {
  if (changes.length === 0) return times;
  const atoms = new Map<string, { days: string; duration: number; start: number }>();
  const key = (days: string, duration: number, start: number) => `${days}|${duration}|${start}`;
  for (const t of times) for (const s of t.starts) atoms.set(key(t.days, t.duration, s), { days: t.days, duration: t.duration, start: s });
  for (const c of changes) {
    const days = [...DAY_ORDER].filter((d) => c.days.includes(d)).join("");
    if (c.action === "allow") {
      if (c.duration !== undefined) for (const s of c.starts) atoms.set(key(days, c.duration, s), { days, duration: c.duration, start: s });
    } else {
      for (const [k, a] of atoms) {
        if (a.days === days && (c.duration === undefined || a.duration === c.duration) && (c.starts.length === 0 || c.starts.includes(a.start))) atoms.delete(k);
      }
    }
  }
  const grouped = new Map<string, StandardTime>();
  for (const a of atoms.values()) {
    const g = grouped.get(`${a.days}|${a.duration}`) ?? { days: a.days, duration: a.duration, starts: [] };
    g.starts.push(a.start);
    grouped.set(`${a.days}|${a.duration}`, g);
  }
  return [...grouped.values()].map((g) => ({ ...g, starts: g.starts.sort((x, y) => x - y) }));
}

export interface RuleViolation {
  rule: string;
  /** From the built-in standard-times check rather than from a rule in the schedule. */
  builtin?: boolean;
  type: Rule["type"];
  academicYear: string;
  term: string;
  /** What is wrong, in a sentence. */
  message: string;
  /** The sections involved. */
  sectionIds: string[];
  /** The meetings to highlight in views. */
  sessions: Session[];
}

const sameLetter = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

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
export function findRuleViolations(schedule: Schedule): RuleViolation[] {
  // In a merged schedule each rule belongs to the schedule it came from and applies only to that schedule's sections.
  const scopes = [...new Set([...schedule.sessions, ...schedule.constraints].map((x) => x.scope).filter((x): x is string => x !== undefined))];
  if (scopes.length === 0) return violationsIn(schedule);
  return scopes.flatMap((scope) => {
    const sessions = schedule.sessions.filter((s) => s.scope === scope);
    const ids = new Set(sessions.map((s) => s.sectionId));
    return violationsIn({ ...schedule, sessions, constraints: schedule.constraints.filter((c) => c.scope === scope), crossListings: schedule.crossListings.filter((c) => ids.has(c.sectionId)) });
  });
}

function violationsIn(all: Schedule): RuleViolation[] {
  const schedule = { ...all, constraints: all.constraints.filter((c) => c.active) }; // a deactivated rule is not checked
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
      else if (rule.type === "cohortPlan") cohortSeen = cohortPlanning(rule, g) || cohortSeen;
      else window(rule, g);
    }
    // A cohort rule none of whose courses is offered in any term it covers is not met, not vacuously satisfied.
    if (rule.type === "cohortPlan" && !cohortSeen && rule.elements.some((e) => e.students !== undefined && e.courses.length > 0)) {
      out.push({ rule: rule.name, type: "cohortPlan", academicYear: "", term: "", message: "None of the courses in this rule are offered in the schedule, so its students cannot take them", sectionIds: [], sessions: [] });
    }
  }
  for (const g of groups.values()) standardTimes(g);
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
            for (const x of list[idx[a]!]!.sectionIds) for (const y of list[idx[b]!]!.sectionIds) if (sectionsOverlap(x, y)) (clashing.add(x), clashing.add(y));
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

  /**
   * Cohort planning: can every student of every group be seated, at the same time, in a clash-free choice of sections of the group's
   * courses, without passing the seats of any section? (`planSeats`.) A group is looked at in a term when some of its courses are offered
   * then; a course of it that is not offered that term means its students cannot be seated.
   */
  function cohortPlanning(rule: Rule, g: { year: string; term: string; sections: Session[] }): boolean {
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
    const report = (message: string, sectionIds = ids) => out.push({ rule: rule.name, type: "cohortPlan", academicYear: g.year, term: g.term, message, sectionIds, sessions: sectionIds.flatMap((id) => bySection.get(id) ?? []) });
    if (noSeats.size > 0) report(`The seats in each section are not given for ${[...noSeats].join(", ")}, so this cannot be checked`);
    if (noSeats.size > 0) return true;

    const result = planSeats(elements, sectionsOverlap);
    const total = result.total + unseatable;
    if (result.placed === total && unseatable === 0) return true;
    const parts: string[] = [];
    for (const c of notOffered) parts.push(`${c} is not offered in ${g.term}`);
    for (const s of result.short) parts.push(`not enough seats in ${s.label} (${s.seats} in all, ${s.needed} student${s.needed === 1 ? "" : "s"} need${s.needed === 1 ? "s" : ""} them)`);
    // With seats enough in every course the times are what is in the way: say which sections to move apart.
    let advice = "";
    if (result.placed < result.total && result.short.length === 0) {
      const options = adviseTimes(elements, sectionsOverlap);
      const move = (pairs: [string, string][]) => pairs.map(([x, y]) => `${label(x)} and ${label(y)} at different times`);
      const joinWith = (items: string[], word: string) => (items.length === 1 ? items[0]! : `${items.slice(0, -1).join(", ")}, ${word} ${items[items.length - 1]}`);
      if (options.length > 0) advice = `Try offering ${options.length === 1 ? joinWith(move(options[0]!), "and") : joinWith(options.map((o) => move(o).join(" and ")), "or")}`;
      else for (const i of result.noSchedule) {
        const e = elements[i]!;
        parts.push(`no clash-free choice of sections lets ${e.students} student${e.students === 1 ? "" : "s"} take ${e.courses.map((c) => c.label).join(", ")}`);
      }
    }
    const how = result.exact ? "" : " (the search was cut off, so more might fit)";
    const why = parts.length ? `: ${parts.join("; ")}` : advice ? "" : ": the seats and the times of the sections do not fit together";
    report(`${result.placed} of ${total} students can all get seats${how}${why}${advice ? `. ${advice}` : ""}`);
    return true;
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
      if (c.scope !== undefined && p.scope !== c.scope) continue;
      if (!termMatches(c.term, p.term)) continue;
      if (constraintNames({ course: c.course, section: c.section } as Constraint, listingKeys(schedule, p), p.section)) rule.sections.add(p.sectionId);
    }
    byRule.set(key, rule);
  }
  const rules = [...byRule.values()];
  return (a, b, sharesInstructor) => rules.some((r) => r.sections.has(a) && r.sections.has(b) && r.sameInstructor === sharesInstructor);
}
