import { describe, expect, it } from "vitest";
import { directUrl, fetchProblem, linkRequests, nameFromUrl, parseAddress, shareLink } from "./remote";

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

describe("linkRequests, parseAddress and shareLink", () => {
  it("attaches each name and year to the file before it", () => {
    const r = linkRequests(new URLSearchParams("url=https://a/x.xlsx&name=Draft&year=AY25&url=https://b/y.xlsx"));
    expect(r.files).toEqual([{ url: "https://a/x.xlsx", name: "Draft", academicYear: "AY25" }, { url: "https://b/y.xlsx" }]);
    expect(r.academicYear).toBeUndefined();
  });
  it("takes a year before the first url as the default", () => {
    const r = linkRequests(new URLSearchParams("year=AY24&url=a&url=b&year=AY25"));
    expect(r.academicYear).toBe("AY24");
    expect(r.files).toEqual([{ url: "a" }, { url: "b", academicYear: "AY25" }]);
  });
  it("has no files without a url", () => {
    expect(linkRequests(new URLSearchParams("name=x")).files).toEqual([]);
  });
  it("reads the address box in its three forms", () => {
    expect(parseAddress("https://x.org/a.xlsx?v=1&url=2").files).toEqual([{ url: "https://x.org/a.xlsx?v=1&url=2" }]);
    expect(parseAddress("url=ex/a.xlsx&name=A%20b&url=ex/b.xlsx").files).toEqual([{ url: "ex/a.xlsx", name: "A b" }, { url: "ex/b.xlsx" }]);
    expect(parseAddress("https://app/#/import?url=https%3A%2F%2Fx%2Fa.xlsx&year=AY25").files).toEqual([{ url: "https://x/a.xlsx", academicYear: "AY25" }]);
    expect(parseAddress("   ").files).toEqual([]);
  });
  it("builds a link that reads back the same", () => {
    const files = [{ url: "https://a/x y.xlsx?v=1&w=2", name: "Draft", academicYear: "AY25" }, { url: "https://b/z.xlsx" }];
    const link = shareLink("https://app.example/#/old", files);
    expect(link.startsWith("https://app.example/#/import?")).toBe(true);
    expect(parseAddress(link).files).toEqual(files);
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
