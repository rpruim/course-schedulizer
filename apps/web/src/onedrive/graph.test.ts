import { describe, expect, it } from "vitest";
import { encodeSharingUrl, GraphClient, GraphError, isOneDriveUrl, type OneDriveSource } from "./graph";

interface Call { url: string; init?: RequestInit }
const fake = (...replies: (Response | Error)[]) => {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init ? { init } : {}) });
    const r = replies.shift()!;
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  return { calls, client: new GraphClient(async (a) => `token-${a}`, fetcher) };
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const source: OneDriveSource = { driveId: "d1", itemId: "i1", eTag: "e1", name: "AY25.xlsx", webUrl: "https://x/w" };

describe("addresses", () => {
  it("recognises OneDrive and SharePoint links", () => {
    expect(isOneDriveUrl("https://1drv.ms/x/s!abc")).toBe(true);
    expect(isOneDriveUrl("https://calvin-my.sharepoint.com/:x:/g/personal/a/b")).toBe(true);
    expect(isOneDriveUrl("https://example.org/a.xlsx")).toBe(false);
    expect(isOneDriveUrl("not a url")).toBe(false);
  });
  it("encodes a sharing link the way Graph expects", () => {
    const url = "https://1drv.ms/x/s!AbC?e=ü";
    expect(encodeSharingUrl(url)).toBe("u!" + Buffer.from(url, "utf8").toString("base64url"));
  });
  it("uses URL-safe characters without padding", () => {
    const e = encodeSharingUrl("https://a.example/?q=>>>???");
    expect(e).toMatch(/^u![A-Za-z0-9_-]+$/);
  });
});

describe("GraphClient", () => {
  it("opens a shared file: resolves the link, then downloads without the auth header", async () => {
    const { calls, client } = fake(
      json({ id: "i1", name: "AY25.xlsx", eTag: "e1", webUrl: "https://x/w", parentReference: { driveId: "d1" }, "@microsoft.graph.downloadUrl": "https://dl.example/file" }),
      new Response(new Uint8Array([1, 2, 3])),
    );
    const got = await client.openShared("https://1drv.ms/x/s!abc");
    expect(got.source).toEqual(source);
    expect([...got.bytes]).toEqual([1, 2, 3]);
    expect(calls[0]!.url).toContain("/shares/u!");
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe("Bearer token-read");
    expect(calls[1]!.init).toBeUndefined();
  });
  it("saves back with If-Match and returns the new eTag", async () => {
    const { calls, client } = fake(json({ id: "i1", name: "AY25.xlsx", eTag: "e2", parentReference: { driveId: "d1" } }));
    const next = await client.saveBack(source, new Uint8Array([9]));
    expect(next.eTag).toBe("e2");
    expect(calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/drives/d1/items/i1/content");
    const h = calls[0]!.init!.headers as Record<string, string>;
    expect(h["If-Match"]).toBe("e1");
    expect(h.Authorization).toBe("Bearer token-write");
  });
  it("can overwrite without the check", async () => {
    const { calls, client } = fake(json({ id: "i1", name: "x", eTag: "e3" }));
    await client.saveBack(source, new Uint8Array(), true);
    expect((calls[0]!.init!.headers as Record<string, string>)["If-Match"]).toBeUndefined();
  });
  it("reports a changed file as a conflict", async () => {
    const { client } = fake(json({ error: { message: "etag mismatch" } }, 412));
    await expect(client.saveBack(source, new Uint8Array())).rejects.toMatchObject({ kind: "conflict", status: 412 });
  });
  it("explains access and missing-file errors", async () => {
    await expect(fake(json({}, 403)).client.openShared("https://1drv.ms/x")).rejects.toMatchObject({ kind: "blocked" });
    await expect(fake(json({}, 404)).client.openShared("https://1drv.ms/x")).rejects.toMatchObject({ kind: "notfound" });
  });
  it("saves a new file in the Schedulizer folder", async () => {
    const { calls, client } = fake(json({ id: "n1", name: "My file.xlsx", eTag: "n", parentReference: { driveId: "d9" }, webUrl: "https://w" }));
    const s = await client.saveNew("My file.xlsx", new Uint8Array([1]));
    expect(calls[0]!.url).toContain("/me/drive/root:/Schedulizer/My%20file.xlsx:/content");
    expect(s.driveId).toBe("d9");
  });
  it("asks for an organization link", async () => {
    const { calls, client } = fake(json({ link: { webUrl: "https://share/it" } }));
    expect(await client.shareLink(source, "edit")).toBe("https://share/it");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ type: "edit", scope: "organization" });
  });
  it("turns a network failure into a readable error", async () => {
    const { client } = fake(new TypeError("Failed to fetch"));
    await expect(client.openShared("https://1drv.ms/x")).rejects.toBeInstanceOf(GraphError);
  });
});
