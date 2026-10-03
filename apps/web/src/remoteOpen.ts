import { readWorkbook, type Schedule } from "@schedulizer/core";
import { allIssues } from "./issues";
import { GraphError, isOneDriveUrl, type OneDriveSource } from "./onedrive/graph";
import { directUrl, fetchProblem, nameFromUrl, type LinkRequest } from "./remote";
import type { OpenReport } from "./components";

export interface Fetched {
  name: string;
  /** Absent when the file could not be downloaded or read. */
  schedule?: Schedule;
  report: OpenReport;
  /** Set when the file came from OneDrive. */
  source?: OneDriveSource;
  /** True when a OneDrive file needs a person to sign in first (a click is needed to open the sign-in window). */
  needsSignIn?: boolean;
}

/** Opens a OneDrive/SharePoint sharing link as the signed-in person. */
export type SharedOpener = (link: string) => Promise<{ source: OneDriveSource; bytes: Uint8Array }>;

const failed = (name: string, message: string): Fetched => ({ name, report: { name, issues: [{ severity: "error", sheet: name, message }] } });

/** Download one workbook and read it. Never throws: problems come back in the report. */
export async function fetchSchedule(
  file: LinkRequest,
  academicYear?: string,
  fetcher: typeof fetch = (...a) => fetch(...a),
  base = typeof document === "undefined" ? "http://localhost/" : document.baseURI,
  shared?: SharedOpener,
): Promise<Fetched> {
  if (isOneDriveUrl(file.url)) return fetchShared(file, academicYear, shared);
  const url = directUrl(file.url, base);
  if (!url) return failed(file.url, "this is not a web address (it should start with https://)");
  const name = file.name ?? nameFromUrl(url);
  let bytes: Uint8Array;
  try {
    const res = await fetcher(url);
    if (!res.ok) return failed(name, fetchProblem(url, undefined, res.status));
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    return failed(name, fetchProblem(url, e));
  }
  try {
    const year = file.academicYear ?? academicYear;
    const result = await readWorkbook(bytes, year ? { academicYear: year } : {});
    return { name, schedule: result.schedule, report: { name, issues: allIssues(result.schedule, result.issues) } };
  } catch (e) {
    return failed(name, `could not read this as an Excel workbook (${e instanceof Error ? e.message : String(e)}). If this is a web page rather than the file, the address is a sharing page, not a download`);
  }
}

async function fetchShared(file: LinkRequest, academicYear: string | undefined, shared: SharedOpener | undefined): Promise<Fetched> {
  const link = file.url.trim();
  const name = file.name ?? nameFromUrl(link);
  if (!shared) return failed(name, "this is a OneDrive address, and this site is not set up for signing in to OneDrive. Download the file and open it with Open Excel file…");
  let got;
  try {
    got = await shared(link);
  } catch (e) {
    if (e instanceof GraphError && e.kind === "signin") return { ...failed(name, e.message), needsSignIn: true };
    return failed(name, e instanceof Error ? e.message : String(e));
  }
  const shown = file.name ?? got.source.name.replace(/\.xlsx$/i, "");
  try {
    const year = file.academicYear ?? academicYear;
    const result = await readWorkbook(got.bytes, year ? { academicYear: year } : {});
    return { name: shown, schedule: result.schedule, source: got.source, report: { name: shown, issues: allIssues(result.schedule, result.issues) } };
  } catch (e) {
    return failed(shown, `could not read this as an Excel workbook (${e instanceof Error ? e.message : String(e)})`);
  }
}
