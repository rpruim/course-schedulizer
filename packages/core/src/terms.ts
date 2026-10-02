import type { PartDef, Settings } from "./types.js";

/**
 * The term parts valid for a term: the parts that name the term, or, if it has
 * none, the default (term-less) semester parts. FA, SP and SU all use the
 * default grid (full, half and quarter terms); WI (2 weeks) has its own.
 */
export function partsFor(settings: Settings, term: string): PartDef[] {
  const own = settings.parts.filter((p) => p.term?.toUpperCase() === term.toUpperCase());
  return own.length ? own : settings.parts.filter((p) => !p.term);
}

/** Inclusive week range of a part within a term, or `undefined` if the part is not defined for it. */
export function weeksOf(settings: Settings, term: string, part: string): [number, number] | undefined {
  const p = partsFor(settings, term).find((x) => x.code.toLowerCase() === part.toLowerCase());
  return p ? [p.startWeek, p.endWeek] : undefined;
}

/** Do two week ranges share a week? */
export const weeksOverlap = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1];
