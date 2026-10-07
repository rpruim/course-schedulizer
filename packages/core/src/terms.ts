import type { PartDef, Settings } from "./types.js";

/**
 * The term parts valid for a term: the parts that name the term, or, if it has
 * none, the default (term-less) semester parts. FA, SP and SU all use the
 * default grid (full, half and quarter terms); WI (2 weeks) has its own.
 * In the order they run: by first week, the longer part first, so the semester grid
 * reads Full, First, A, B, Second, C, D.
 */
export function partsFor(settings: Settings, term: string): PartDef[] {
  const own = settings.parts.filter((p) => p.term?.toUpperCase() === term.toUpperCase());
  const parts = own.length ? own : settings.parts.filter((p) => !p.term);
  return [...parts].sort((a, b) => a.startWeek - b.startWeek || b.endWeek - a.endWeek);
}

/** The numbers the registrar's reports use for the two halves of a term, and the parts they mean. */
const NUMBERED_PARTS: Record<string, string> = { "1": "First", "2": "Second" };

/**
 * The part of `term` that `text` names: its code in any case, or, when the term has no part with that code,
 * `1` / `2` for the First / Second half. `undefined` if the term has no such part.
 */
export function partNamed(settings: Settings, term: string, text: string): string | undefined {
  const codes = partsFor(settings, term).map((p) => p.code);
  const t = text.trim().toLowerCase();
  const exact = codes.find((c) => c.toLowerCase() === t);
  if (exact) return exact;
  const numbered = NUMBERED_PARTS[t];
  return numbered && codes.includes(numbered) ? numbered : undefined;
}

/** How a part is written in an export: First and Second as 1 and 2 (unless the term has parts coded 1 or 2 of its own). */
export function partForExport(settings: Settings, term: string, code: string): string {
  const number = Object.keys(NUMBERED_PARTS).find((n) => NUMBERED_PARTS[n] === code);
  if (!number) return code;
  return partsFor(settings, term).some((p) => p.code === number) ? code : number;
}

/**
 * The registrar's reports (reports.calvin.edu) code the winter interim as part 0 of Spring: `SP` with `TermPart` 0. The app keeps it as
 * its own term, `WI`. This is the term and part for a data row: `WI` when the data says Spring, part 0 (and the schedule has a WI term).
 */
export function termFromData(settings: Settings, term: string, partText: string): { term: string; part: string } | undefined {
  if (term.trim().toUpperCase() === "SP" && partText.trim() === "0" && settings.terms.some((t) => t.code === "WI")) return { term: "WI", part: "Full" };
  return undefined;
}

/** A section's term and part the way the data writes them: `WI` as `SP` with part 0, the halves as 1 and 2. */
export function termForData(settings: Settings, term: string, part: string): { term: string; part: string } {
  if (term === "WI") return { term: "SP", part: "0" };
  return { term, part: partForExport(settings, term, part) };
}

/** Inclusive week range of a part within a term, or `undefined` if the part is not defined for it. */
export function weeksOf(settings: Settings, term: string, part: string): [number, number] | undefined {
  const p = partsFor(settings, term).find((x) => x.code.toLowerCase() === part.toLowerCase());
  return p ? [p.startWeek, p.endWeek] : undefined;
}

/** Do two week ranges share a week? */
export const weeksOverlap = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1];

/** Suffix digits that registrars append to a term code, and the part each means. */
const SUFFIX_PARTS: Record<string, string> = { "1": "First", "2": "Second" };

/**
 * Split a combined code such as `FA1` / `SP2` / `SU1` (the 8-week accelerated
 * terms) into a configured term and a part: `FA` + `First`. Returns `undefined`
 * unless the prefix is a configured term and the part exists for that term.
 */
export function splitTermCode(settings: Settings, text: string): { term: string; part: string } | undefined {
  const code = text.trim().toUpperCase();
  for (const t of settings.terms) {
    const rest = code.startsWith(t.code) ? code.slice(t.code.length) : "";
    const part = SUFFIX_PARTS[rest];
    if (part && partsFor(settings, t.code).some((p) => p.code === part)) return { term: t.code, part };
  }
  return undefined;
}
