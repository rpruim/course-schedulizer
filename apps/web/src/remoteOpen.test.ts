import { describe, expect, it } from "vitest";
import { emptySchedule, writeWorkbook } from "@schedulizer/core";
import { fetchSchedule, type SharedOpener } from "./remoteOpen";
import { GraphError } from "./onedrive/graph";

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

  describe("OneDrive links", () => {
    const link = "https://calvin-my.sharepoint.com/:x:/g/personal/a/b";
    const source = { driveId: "d", itemId: "i", eTag: "e", name: "AY25 draft.xlsx", webUrl: "https://w" };
    it("opens through the signed-in opener and remembers where the file is", async () => {
      const bytes = await writeWorkbook(emptySchedule());
      const shared: SharedOpener = async (l) => { expect(l).toBe(link); return { source, bytes }; };
      const got = await fetchSchedule({ url: link }, undefined, reply(""), undefined, shared);
      expect(got.schedule).toBeDefined();
      expect(got.source).toEqual(source);
      expect(got.name).toBe("AY25 draft");
    });
    it("asks for a click when sign-in is needed", async () => {
      const shared: SharedOpener = async () => { throw new GraphError("signin", "Sign in with Microsoft to open this file."); };
      const got = await fetchSchedule({ url: link }, undefined, reply(""), undefined, shared);
      expect(got.needsSignIn).toBe(true);
      expect(got.schedule).toBeUndefined();
    });
    it("explains when the site has no sign-in set up", async () => {
      const got = await fetchSchedule({ url: link }, undefined, reply(""));
      expect(got.report.issues[0]!.message).toContain("not set up");
    });
    it("reports access problems", async () => {
      const shared: SharedOpener = async () => { throw new GraphError("blocked", "You do not have access"); };
      expect((await fetchSchedule({ url: link }, undefined, reply(""), undefined, shared)).report.issues[0]!.message).toContain("do not have access");
    });
  });
});
