import { describe, expect, it } from "vitest";
import { emptySchedule, writeWorkbook } from "@schedulizer/core";
import { fetchSchedule } from "./remoteOpen";

const reply = (body: Uint8Array | string, status = 200) => (async () => new Response(body as BodyInit, { status })) as unknown as typeof fetch;

describe("fetchSchedule", () => {
  it("downloads and reads a workbook, naming it after the file", async () => {
    const bytes = await writeWorkbook(emptySchedule());
    const got = await fetchSchedule({ url: "https://x.org/files/Draft%201.xlsx" }, undefined, reply(bytes));
    expect(got.schedule).toBeDefined();
    expect(got.name).toBe("Draft 1");
  });
  it("uses a name from the link when there is one", async () => {
    const bytes = await writeWorkbook(emptySchedule());
    expect((await fetchSchedule({ url: "https://x.org/a.xlsx", name: "Mine" }, undefined, reply(bytes))).name).toBe("Mine");
  });
  it("reports a missing file", async () => {
    const got = await fetchSchedule({ url: "https://x.org/a.xlsx" }, undefined, reply("no", 404));
    expect(got.schedule).toBeUndefined();
    expect(got.report.issues[0]!.message).toContain("not found");
  });
  it("reports a blocked download", async () => {
    const blocked = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    expect((await fetchSchedule({ url: "https://x.org/a.xlsx" }, undefined, blocked)).report.issues[0]!.message).toContain("does not allow");
  });
  it("reports a page that is not a workbook", async () => {
    const got = await fetchSchedule({ url: "https://x.org/a" }, undefined, reply("<html>sign in</html>"));
    expect(got.schedule).toBeUndefined();
    expect(got.report.issues[0]!.message).toContain("sharing page");
  });
  it("refuses a non-address", async () => {
    expect((await fetchSchedule({ url: "javascript:1" }, undefined, reply(""))).schedule).toBeUndefined();
  });
});
