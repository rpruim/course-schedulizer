/** The university's standard meeting times, and the changes to them that the standard-times rules make. */
import type { StandardChange } from "./ruleModel.js";
import { DAY_ORDER, DEFAULT_STANDARD_TIMES, type Session, type StandardTime } from "./types.js";
import { formatTime } from "./format.js";
import { dayList } from "./ruleText.js";

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
