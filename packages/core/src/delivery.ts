/** How a section is delivered: the three choices the registrar's schedule has. */
export const DELIVERY_MODES = ["In-Person", "Online", "Hybrid"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

/** Other ways people write each mode, as bare lowercase letters (case, spaces and punctuation do not matter). */
const SYNONYMS: Record<string, DeliveryMode> = {
  inperson: "In-Person", person: "In-Person", inpersn: "In-Person", faceto: "In-Person", facetoface: "In-Person", f2f: "In-Person", ftf: "In-Person",
  oncampus: "In-Person", campus: "In-Person", inclass: "In-Person", classroom: "In-Person", onsite: "In-Person", traditional: "In-Person", live: "In-Person",
  online: "Online", onl: "Online", web: "Online", virtual: "Online", remote: "Online", distance: "Online", elearning: "Online",
  async: "Online", asynchronous: "Online", sync: "Online", synchronous: "Online", onlineasync: "Online", onlinesync: "Online", onlineasynchronous: "Online", onlinesynchronous: "Online",
  zoom: "Online",
  hybrid: "Hybrid", blended: "Hybrid", mixed: "Hybrid", hyflex: "Hybrid", partonline: "Hybrid", partlyonline: "Hybrid",
};

/** The words a slightly misspelled entry is compared with (not every synonym: `off campus` is one edit from `on campus`). */
const FUZZY = ["inperson", "online", "hybrid", "facetoface", "asynchronous", "synchronous", "blended"];

/** Edit distance counting a swap of two neighboring letters as one edit (so `hybird` is one edit from `hybrid`). */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

/**
 * A delivery mode as the registrar writes it, from whatever a file has: any capitalization, spacing or hyphenation, a common
 * synonym (`face to face`, `async`, `blended`), or a slightly misspelled one (`on-lne`, `hybird`). `""` for blank text and
 * `undefined` when it is not recognizably one of the three.
 */
export function normalizeDelivery(text: string): DeliveryMode | "" | undefined {
  const key = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key === "") return "";
  const exact = SYNONYMS[key];
  if (exact) return exact;
  if (key.length < 4) return undefined;
  const allowed = key.length >= 9 ? 2 : 1;
  let best: { mode: DeliveryMode; d: number } | undefined;
  let tie = false;
  for (const word of FUZZY) {
    const mode = SYNONYMS[word]!;
    const d = distance(key, word);
    if (d > allowed) continue;
    if (!best || d < best.d) {
      best = { mode, d };
      tie = false;
    } else if (d === best.d && mode !== best.mode) tie = true;
  }
  return best && !tie ? best.mode : undefined;
}
