import { weeksOf, weeksOverlap } from "./terms.js";
import type { Schedule, Session } from "./types.js";

/** A session with a day, a start time and a duration. */
export const scheduled = (s: Session): s is Session & { start: number; duration: number } =>
  s.days !== "" && s.start !== undefined && s.duration !== undefined;

/** Do the two sections run in overlapping weeks of the same term of the same academic year? */
export function weeksConcurrent(schedule: Schedule, a: Session, b: Session): boolean {
  if (a.academicYear !== b.academicYear) return false;
  if (a.term !== b.term) return false;
  const wa = weeksOf(schedule.settings, a.term, a.termPart);
  const wb = weeksOf(schedule.settings, b.term, b.termPart);
  return !wa || !wb || weeksOverlap(wa, wb); // an undefined part is an import error; be conservative
}

export const shareDay = (a: string, b: string) => [...a].some((d) => b.includes(d));

/** Do two meetings (sessions) overlap in time, on a shared day, in concurrent weeks? Back-to-back does not overlap. */
export function meetingsOverlap(schedule: Schedule, a: Session, b: Session): boolean {
  if (!scheduled(a) || !scheduled(b)) return false;
  return shareDay(a.days, b.days) && a.start < b.start + b.duration && b.start < a.start + a.duration && weeksConcurrent(schedule, a, b);
}
