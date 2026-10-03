import { readWorkbook, type Schedule } from "@schedulizer/core";
import { allIssues } from "./issues";
import { directUrl, fetchProblem, nameFromUrl, type LinkRequest } from "./remote";
import type { OpenReport } from "./components";

export interface Fetched {
  name: string;
  /** Absent when the file could not be downloaded or read. */
  schedule?: Schedule;
  report: OpenReport;
}

const failed = (name: string, message: string): Fetched => ({ name, report: { name, issues: [{ severity: "error", sheet: name, message }] } });

/** Download one workbook and read it. Never throws: problems come back in the report. */
export async function fetchSchedule(
  file: LinkRequest,
  academicYear?: string,
  fetcher: typeof fetch = (...a) => fetch(...a),
  base = typeof document === "undefined" ? "http://localhost/" : document.baseURI,
): Promise<Fetched> {
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
    const result = await readWorkbook(bytes, academicYear ? { academicYear } : {});
    return { name, schedule: result.schedule, report: { name, issues: allIssues(result.schedule, result.issues) } };
  } catch (e) {
    return failed(name, `could not read this as an Excel workbook (${e instanceof Error ? e.message : String(e)}). If this is a web page rather than the file, the address is a sharing page, not a download`);
  }
}
