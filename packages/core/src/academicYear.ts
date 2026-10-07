/**
 * Academic years are coded `AY25` in the registrar's data (the year 2025–26) but shown in the app as `25-26`, which is what people
 * expect. The app converts when it reads data (`yearFromData`) and when it writes it (`yearToData`). Anything else a person types
 * (`2025-26`, `2025-2026`) is read as the same year; a value that is not a year at all is left as it is.
 */

/** What to tell people to type where an academic year is asked for. */
export const ACADEMIC_YEAR_HELP = "Use two 2-digit years separated by a dash, such as 25-26 for the 2025–26 academic year. Schedulizer will take care of converting to from AY25 for you.";

const two = (n: number) => String(((n % 100) + 100) % 100).padStart(2, "0");

/** A year as the app shows it: `AY25`, `25-26`, `2025-26` and `2025-2026` all become `25-26`. Other text is kept. */
export function yearFromData(text: string | undefined): string {
  const t = (text ?? "").trim();
  const ay = /^AY(?:20)?(\d{2})$/i.exec(t);
  if (ay) return `${ay[1]}-${two(Number(ay[1]) + 1)}`;
  const range = /^(?:20)?(\d{2})\s*[-–—/]\s*(?:20)?(\d{2})$/.exec(t);
  if (range && Number(range[2]) === (Number(range[1]) + 1) % 100) return `${range[1]}-${range[2]}`;
  return t;
}

/** A year as the data writes it: `25-26` becomes `AY25`. A year already in that form, or text that is not a year, is kept. */
export function yearToData(year: string): string {
  const m = /^(\d{2})-(\d{2})$/.exec(year.trim());
  return m && Number(m[2]) === (Number(m[1]) + 1) % 100 ? `AY${m[1]}` : year;
}
