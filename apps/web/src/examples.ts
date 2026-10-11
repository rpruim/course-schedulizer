/** The examples offered on the Import tab, listed in `public/examples/examples.yml`. */
export interface Example {
  name: string;
  /** What goes in the address box: one file address, or several files written as a link's query (see `parseAddress`). */
  url: string;
}

/**
 * Read the list; entries without a name or url are left out. The file is a YAML list of `name:` / `url:` pairs, and only that much YAML
 * is understood (comments, `- key: value` starting an entry, indented `key: value` lines, quoted values), so the app needs no YAML
 * library. Anything else, such as a file that is not a list, gives no examples.
 */
export async function parseExamples(text: string): Promise<Example[]> {
  const items: Record<string, string>[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === "" || raw.trim().startsWith("#")) continue;
    const entry = /^-\s+(.*)$/.exec(raw);
    if (entry) items.push({});
    else if (!/^\s/.test(raw) || items.length === 0) return []; // not a list
    const m = /^(\w+):\s*(.*)$/.exec((entry ? entry[1]! : raw).trim());
    if (m) items[items.length - 1]![m[1]!] = scalar(m[2]!);
  }
  return items.flatMap((item): Example[] => {
    const name = item.name?.trim() ?? "";
    const url = item.url?.trim() ?? "";
    return name && url ? [{ name, url }] : [];
  });
}

/** A YAML scalar as written on one line: quoted ('it''s', "say \"hi\""), or plain with any ` # comment` dropped. */
function scalar(text: string): string {
  const t = text.trim();
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) return t.slice(1, -1).replace(/''/g, "'");
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) return t.slice(1, -1).replace(/\\(["\\])/g, "$1");
  return t.replace(/\s+#.*$/, "");
}

/** Fetch the list from next to the app. Anything that goes wrong means no examples, never an error. */
export async function loadExamples(fetcher: typeof fetch = (...a) => fetch(...a), base = document.baseURI): Promise<Example[]> {
  try {
    const res = await fetcher(new URL("examples/examples.yml", base).toString());
    return res.ok ? await parseExamples(await res.text()) : [];
  } catch {
    return [];
  }
}
