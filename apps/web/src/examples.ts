/** The examples offered on the Import tab, listed in `public/examples/examples.yml`. */
export interface Example {
  name: string;
  /** What goes in the address box: one file address, or several files written as a link's query (see `parseAddress`). */
  url: string;
}

/** Read the list; entries without a name or url are left out. */
export async function parseExamples(text: string): Promise<Example[]> {
  const { parse } = await import("yaml");
  const data: unknown = parse(text);
  if (!Array.isArray(data)) return [];
  return data.flatMap((item): Example[] => {
    const { name, url } = (item ?? {}) as { name?: unknown; url?: unknown };
    return typeof name === "string" && typeof url === "string" && name.trim() && url.trim() ? [{ name: name.trim(), url: url.trim() }] : [];
  });
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
