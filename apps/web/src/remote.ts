/** Opening a schedule from a web address: `…/#/import?url=<file address>` loads that file as a new schedule. */

/** One file a link asks for, with the name and academic year given for it (if any). */
export interface LinkRequest {
  url: string;
  name?: string;
  academicYear?: string;
}

export interface LinkRequests {
  files: LinkRequest[];
  /** An academic year for every file that has none of its own (a `year=` before the first `url=`). */
  academicYear?: string;
}

/**
 * Turn the address someone copied from a sharing page into one that downloads the file itself, where we
 * know how: a GitHub "blob" page becomes the raw file, a Dropbox share link downloads instead of previewing.
 * Relative addresses are resolved against `base` (so examples can be hosted next to the app).
 * Returns undefined for anything that is not an http(s) address.
 */
export function directUrl(raw: string, base = "http://localhost/"): string | undefined {
  let u: URL;
  try {
    u = new URL(raw.trim(), base);
  } catch {
    return undefined;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
  if (u.hostname === "github.com") {
    const m = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(u.pathname);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
  }
  if (/(^|\.)dropbox\.com$/.test(u.hostname)) {
    u.hostname = "dl.dropboxusercontent.com";
    u.searchParams.delete("dl");
    u.searchParams.set("raw", "1");
    return u.toString();
  }
  return u.toString();
}

/** A name for a schedule opened from an address: the file name without its extension. */
export function nameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(last).replace(/\.xlsx$/i, "") || new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Read the request out of a link's query. Each `url=` starts a file; the `name=` and `year=` that follow it belong
 * to that file. A `year=` before any `url=` is the default for all files.
 */
export function linkRequests(params: URLSearchParams): LinkRequests {
  const files: LinkRequest[] = [];
  let academicYear: string | undefined;
  for (const [key, raw] of params) {
    const value = raw.trim();
    const last = files.at(-1);
    if (key === "url") {
      if (value) files.push({ url: value });
    } else if (key === "name" && last && value) last.name = value;
    else if (key === "year" && value) {
      if (last) last.academicYear = value;
      else academicYear = value;
    }
  }
  return { files, ...(academicYear ? { academicYear } : {}) };
}

/**
 * What the address box holds: one file address, or several files written as a link's query (`url=…&name=…&url=…`),
 * or a whole link to this app (`…/#/import?url=…`).
 */
export function parseAddress(text: string): LinkRequests {
  const t = text.trim();
  if (!t) return { files: [] };
  const route = t.indexOf("#/import?");
  if (route >= 0) return linkRequests(new URLSearchParams(t.slice(route + "#/import?".length)));
  if (/^url=/i.test(t)) return linkRequests(new URLSearchParams(t));
  return { files: [{ url: t }] };
}

/** The link to give someone so that the files open in the app. `appUrl` is the address of the app itself. */
export function shareLink(appUrl: string, files: LinkRequest[], defaultYear?: string): string {
  const q = new URLSearchParams();
  if (defaultYear) q.set("year", defaultYear);
  for (const f of files) {
    q.append("url", f.url);
    if (f.name) q.append("name", f.name);
    if (f.academicYear) q.append("year", f.academicYear);
  }
  return `${appUrl.replace(/#.*$/, "")}#/import?${q.toString()}`;
}

/** A plain-language reason a fetch failed. A blocked cross-origin read shows up as a bare TypeError. */
export function fetchProblem(url: string, e: unknown, status?: number): string {
  const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  if (status !== undefined) return `${host} answered ${status}${status === 404 ? " (not found)" : status === 401 || status === 403 ? " (not allowed; the file may be private)" : ""}`;
  if (e instanceof TypeError) return `could not download from ${host}. The address may be wrong, or that site does not allow other web pages to read its files (OneDrive and Google Drive share links usually do not)`;
  return e instanceof Error ? e.message : String(e);
}
