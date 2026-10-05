/** The core tags a course can carry. */
export const CORE_TAGS = ["Diversity and Difference", "Environmental Sustainability", "Global Regions and Cultures"] as const;
export type CoreTag = (typeof CORE_TAGS)[number];

/** Words that point to each tag, as bare lowercase letters. */
const CUES: [CoreTag, string[]][] = [
  ["Diversity and Difference", ["divers", "differen"]],
  ["Environmental Sustainability", ["environ", "sustain"]],
  ["Global Regions and Cultures", ["global", "region", "cultur"]],
];

/**
 * A core tag as the registrar writes it, from whatever a file has: any capitalization, spacing or punctuation (`Diversity & Difference`,
 * `global regions/cultures`), or a distinctive part of it (`Sustainability`). `""` for blank text and `undefined` when it is not
 * recognizably one tag, or points to more than one.
 */
export function normalizeCoreTag(text: string): CoreTag | "" | undefined {
  const key = text.toLowerCase().replace(/[^a-z]/g, "");
  if (key === "") return "";
  if (["none", "na", "no", "notag", "notapplicable"].includes(key)) return "";
  const hits = CUES.filter(([, cues]) => cues.some((c) => key.includes(c))).map(([tag]) => tag);
  return hits.length === 1 ? hits[0] : undefined;
}
