import { describe, expect, it } from "vitest";
import { directUrl, fetchProblem, linkRequests, nameFromUrl, shareLink } from "./remote";

describe("directUrl", () => {
  it("keeps ordinary http(s) addresses", () => {
    expect(directUrl("https://example.org/a/b.xlsx")).toBe("https://example.org/a/b.xlsx");
  });
  it("turns a GitHub file page into the raw file", () => {
    expect(directUrl("https://github.com/me/repo/blob/main/data/AY25.xlsx")).toBe("https://raw.githubusercontent.com/me/repo/main/data/AY25.xlsx");
  });
  it("turns a Dropbox share link into a download", () => {
    expect(directUrl("https://www.dropbox.com/s/abc/AY25.xlsx?dl=0")).toBe("https://dl.dropboxusercontent.com/s/abc/AY25.xlsx?raw=1");
  });
  it("resolves relative addresses against the base", () => {
    expect(directUrl("examples/a.xlsx", "https://site.example/app/")).toBe("https://site.example/app/examples/a.xlsx");
  });
  it("refuses other kinds of address", () => {
    expect(directUrl("javascript:alert(1)")).toBeUndefined();
    expect(directUrl("file:///etc/passwd")).toBeUndefined();
  });
});

describe("linkRequests and shareLink", () => {
  it("reads repeated urls, names by position, and a year", () => {
    const r = linkRequests(new URLSearchParams("url=https://a/x.xlsx&url=https://b/y.xlsx&name=Draft&year=AY25"));
    expect(r.files).toEqual([{ url: "https://a/x.xlsx", name: "Draft" }, { url: "https://b/y.xlsx" }]);
    expect(r.academicYear).toBe("AY25");
  });
  it("has no files without a url", () => {
    expect(linkRequests(new URLSearchParams("")).files).toEqual([]);
  });
  it("builds a link that reads back the same", () => {
    const link = shareLink("https://app.example/#/old", ["https://a/x y.xlsx?v=1&w=2"], { name: "Draft", academicYear: "AY25" });
    const q = new URLSearchParams(link.split("?")[1]);
    expect(link.startsWith("https://app.example/#/import?")).toBe(true);
    expect(linkRequests(q)).toEqual({ files: [{ url: "https://a/x y.xlsx?v=1&w=2", name: "Draft" }], academicYear: "AY25" });
  });
});

describe("names and problems", () => {
  it("names a schedule after its file", () => {
    expect(nameFromUrl("https://a/b/My%20Schedule.xlsx?raw=1")).toBe("My Schedule");
  });
  it("explains failures", () => {
    expect(fetchProblem("https://x.org/f.xlsx", undefined, 404)).toContain("not found");
    expect(fetchProblem("https://x.org/f.xlsx", new TypeError("Failed to fetch"))).toContain("does not allow");
  });
});
