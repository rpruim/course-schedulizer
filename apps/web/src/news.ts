/** NEWS.md at the top of the repository, in the style of an R package's: a heading per version, newest first, then bullets. */
export interface NewsItem {
  text: string;
  /** Bullets indented under this one. */
  items: NewsItem[];
}

export interface NewsEntry {
  /** The heading as written, for example `Course Schedulizer 2.0.1`. */
  heading: string;
  /** The version number in the heading, or "" if it has none. */
  version: string;
  items: NewsItem[];
}

/** Read the file: `# heading` starts an entry, `* bullet` (indented two spaces per level) is an item, and an indented line that is not a bullet continues the item above it. */
export function parseNews(text: string): NewsEntry[] {
  const entries: NewsEntry[] = [];
  // The items open at each depth of the entry being read.
  let stack: NewsItem[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const heading = /^#\s+(.*\S)\s*$/.exec(raw);
    if (heading) {
      entries.push({ heading: heading[1]!, version: /\d+(?:\.\d+)+/.exec(heading[1]!)?.[0] ?? "", items: [] });
      stack = [];
      continue;
    }
    const entry = entries.at(-1);
    if (!entry) continue;
    const bullet = /^(\s*)[*-]\s+(.*\S)\s*$/.exec(raw);
    if (bullet) {
      const depth = Math.min(Math.floor(bullet[1]!.length / 2), stack.length);
      const item: NewsItem = { text: bullet[2]!, items: [] };
      (depth === 0 ? entry.items : stack[depth - 1]!.items).push(item);
      stack = [...stack.slice(0, depth), item];
    } else if (raw.trim() && /^\s/.test(raw) && stack.length) {
      stack.at(-1)!.text += ` ${raw.trim()}`;
    }
  }
  return entries;
}

/** Split a line of text into plain, `code` and *emphasized* runs, for display. */
export function inlineRuns(text: string): { kind: "text" | "code" | "em"; text: string }[] {
  const runs: { kind: "text" | "code" | "em"; text: string }[] = [];
  const re = /`([^`]+)`|\*([^*]+)\*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) runs.push({ kind: "text", text: text.slice(last, m.index) });
    runs.push(m[1] !== undefined ? { kind: "code", text: m[1] } : { kind: "em", text: m[2]! });
    last = m.index! + m[0].length;
  }
  if (last < text.length) runs.push({ kind: "text", text: text.slice(last) });
  return runs;
}
