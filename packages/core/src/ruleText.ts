/** A constraint rule in words: the sentences shown in lists and the pieces the rule checks use in their messages. */
import { formatTime } from "./format.js";
import { ruleDays, ruleSubject, termList, type Rule, type RuleItem, type StandardChange } from "./ruleModel.js";

export const dayList = (days: string) => [...days].join(" ");
export const interval = (r: Pick<Rule, "from" | "to">) => `${formatTime(r.from ?? 0)}–${formatTime(r.to ?? 0)}`;
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
