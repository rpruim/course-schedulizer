import { DEFAULT_SAVE_AS, type Meta } from "./types.js";

const two = (n: number) => String(n).padStart(2, "0");

/** The download name for an export: the Save As text, plus `_YYYY-MM-DD_HHMM` when the time stamp is on. */
export function exportFileName(meta: Pick<Meta, "saveAs" | "timestamp">, now: Date = new Date()): string {
  const base = (meta.saveAs ?? "").trim().replace(/\.xlsx$/i, "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || DEFAULT_SAVE_AS;
  const stamp = meta.timestamp === false ? "" : `_${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}_${two(now.getHours())}${two(now.getMinutes())}`;
  return `${base}${stamp}.xlsx`;
}
