import type { Instructor } from "./types.js";

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** Minutes since midnight → `HH:MM`. */
export const formatTime = (minutes: number) => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;

/** `4` → `"4"`, `1.8` → `"1.8"` (no trailing zeros). */
export const formatNumber = (n: number | undefined) => (n === undefined ? "" : String(Math.round(n * 1e6) / 1e6));

/**
 * Time cell → minutes since midnight. Accepts `H:MM`, `HH:MM:SS`, `h:mm AM/PM`
 * and an Excel day-fraction (`0.5972…`). Returns `undefined` for blank and
 * `null` for text that is not a time.
 */
export function parseTime(text: string): number | undefined | null {
  const s = text.trim();
  if (s === "") return undefined;
  let m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(s);
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2]);
    const ap = m[4]?.toLowerCase();
    if (ap) {
      if (h < 1 || h > 12) return null;
      h = (h % 12) + (ap === "pm" ? 12 : 0);
    }
    return h < 24 && min < 60 ? h * 60 + min : null;
  }
  if (/^0?\.\d+$/.test(s) || s === "0") {
    return Math.round(Number(s) * 1440) % 1440;
  }
  return null;
}

/** Day cell → canonical day letters, or `null` if invalid. `TH`→`R`, `SU`→`U`. */
export function parseDays(text: string): string | null {
  const s = text.toUpperCase().replace(/[\s,]/g, "").replace(/TH/g, "R").replace(/SU/g, "U");
  if (!/^[MTWRFSU]*$/.test(s)) return null;
  return [..."MTWRFSU"].filter((d) => s.includes(d)).join("");
}

/**
 * `"Ada Example (3); Ben Sample"` → instructors. Semicolons or newlines separate; so do commas,
 * unless the text has a semicolon or `commas` is false (names such as `Pruim, Randall` contain commas).
 */
export function parseFaculty(text: string, o: { commas?: boolean } = {}): Instructor[] {
  const commas = (o.commas ?? true) && !text.includes(";");
  return text
    .split(commas ? /[,\n]/ : /[;\n]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = /^(.*?)\s*\(\s*(\d+(?:\.\d+)?)\s*\)$/.exec(p);
      return m && m[1] ? { name: m[1], load: Number(m[2]) } : { name: p };
    });
}

/** Instructors as text: `Ada Example (3), Ben Sample`; with `;` (always, or whenever a name has a comma, so it reads back the same). */
export function formatFaculty(fac: Instructor[], o: { semicolons?: boolean } = {}): string {
  const sep = o.semicolons || fac.some((f) => f.name.includes(",")) ? "; " : ", ";
  return fac.map((f) => (f.load === undefined ? f.name : `${f.name} (${formatNumber(f.load)})`)).join(sep);
}
