import { DEFAULT_SAVE_AS, type Meta } from "./types.js";

const two = (n: number) => String(n).padStart(2, "0");

/** A typed file name made safe: no `.xlsx`, odd characters as `_`; blank gives the default. */
export function cleanFileName(text: string | undefined): string {
  return (text ?? "").trim().replace(/\.xlsx$/i, "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || DEFAULT_SAVE_AS;
}

/** The name an export is suggested under, before any time stamp: the Save As text of the Meta tab. */
export const exportBaseName = (meta: Pick<Meta, "saveAs">): string => cleanFileName(meta.saveAs);

const stampOf = (now: Date) => `_${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}_${two(now.getHours())}${two(now.getMinutes())}`;

/**
 * The download name for an export: the Save As text (or `base`, when the person typed another name), plus `_YYYY-MM-DD_HHMM` when the
 * time stamp is on.
 */
export function exportFileName(meta: Pick<Meta, "saveAs" | "timestamp">, now: Date = new Date(), base?: string): string {
  const name = base === undefined ? exportBaseName(meta) : cleanFileName(base);
  return `${name}${meta.timestamp === false ? "" : stampOf(now)}.xlsx`;
}

/** Which names an export writes: with the time stamp, without it, or both files. */
export type StampChoice = "with" | "without" | "both";

/** The stamp choice the Meta tab's time stamp setting stands for. */
export const stampChoiceOf = (meta: Pick<Meta, "timestamp">): StampChoice => (meta.timestamp === "both" ? "both" : meta.timestamp === false ? "without" : "with");

/** The file names of one export operation (with the time stamp first when both are asked for). */
export function exportFileNames(meta: Pick<Meta, "saveAs">, choice: StampChoice, now: Date = new Date(), base?: string): string[] {
  const names = choice === "both" ? [true, false] : [choice === "with"];
  return names.map((stamped) => exportFileName({ saveAs: meta.saveAs, timestamp: stamped }, now, base));
}
