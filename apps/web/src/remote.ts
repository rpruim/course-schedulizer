/** Opening a schedule from a web address: `…/#/import?url=<file address>` loads that file as a new schedule. */

/** What a link asks for: files to fetch (in order), with optional names, and an academic year for files that lack one. */
export interface LinkRequest {
  url: string;
  name?: string;
}

export interface LinkRequests {
  files: LinkRequest[];
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
 * Read the request out of a link's query: repeated `url=` (each may be followed by its own `name=`),
 * and `year=`. `name=` entries are matched to `url=` entries by position.
 */
export function linkRequests(params: URLSearchParams): LinkRequests {
  const urls = params.getAll("url").map((u) => u.trim()).filter(Boolean);
  const names = params.getAll("name");
  const year = params.get("year")?.trim();
  return {
    files: urls.map((url, i) => ({ url, ...(names[i]?.trim() ? { name: names[i]!.trim() } : {}) })),
    ...(year ? { academicYear: year } : {}),
  };
}

/** The link to give someone so that the file opens in the app. `appUrl` is the address of the app itself. */
export function shareLink(appUrl: string, fileUrls: string[], options: { name?: string; academicYear?: string } = {}): string {
  const q = new URLSearchParams();
  for (const u of fileUrls) q.append("url", u);
  if (options.name && fileUrls.length === 1) q.set("name", options.name);
  if (options.academicYear) q.set("year", options.academicYear);
  return `${appUrl.replace(/#.*$/, "")}#/import?${q.toString()}`;
}

/** A plain-language reason a fetch failed. A blocked cross-origin read shows up as a bare TypeError. */
export function fetchProblem(url: string, e: unknown, status?: number): string {
  const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  if (status !== undefined) return `${host} answered ${status}${status === 404 ? " (not found)" : status === 401 || status === 403 ? " (not allowed; the file may be private)" : ""}`;
  if (e instanceof TypeError) return `could not download from ${host}. The address may be wrong, or that site does not allow other web pages to read its files (OneDrive and Google Drive share links usually do not)`;
  return e instanceof Error ? e.message : String(e);
}
