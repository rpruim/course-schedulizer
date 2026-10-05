/** Reading and writing Excel files on OneDrive / SharePoint through Microsoft Graph. */

/** Where a schedule came from, so saving can write back to the same file. */
export interface OneDriveSource {
  driveId: string;
  itemId: string;
  /** Changes whenever the file does; saving checks it so someone else's edit is not overwritten. */
  eTag: string;
  name: string;
  webUrl: string;
}

const GRAPH = "https://graph.microsoft.com/v1.0";

/** True for the addresses OneDrive and SharePoint sharing links have. */
export function isOneDriveUrl(raw: string): boolean {
  try {
    const h = new URL(raw.trim()).hostname.toLowerCase();
    return h === "1drv.ms" || h === "onedrive.live.com" || h === "sharepoint.com" || h.endsWith(".sharepoint.com") || h.endsWith(".sharepoint.us") || h.endsWith(".sharepoint.cn");
  } catch {
    return false;
  }
}

/** Graph's encoding of a sharing link: `u!` + the address in unpadded, URL-safe base64. */
export function encodeSharingUrl(url: string): string {
  const bytes = new TextEncoder().encode(url.trim());
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return "u!" + btoa(bin).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
}

export type GraphErrorKind = "signin" | "auth" | "notfound" | "conflict" | "blocked" | "other";

export class GraphError extends Error {
  constructor(readonly kind: GraphErrorKind, message: string, readonly status?: number) {
    super(message);
    this.name = "GraphError";
  }
}

const explain = (status: number, detail: string): GraphError => {
  const more = detail ? ` (${detail})` : "";
  if (status === 401) return new GraphError("auth", `Microsoft did not accept the sign-in${more}. Sign in again.`, status);
  if (status === 403) return new GraphError("blocked", `You do not have access to this file${more}. Ask its owner to share it with you, with permission to edit if you want to save back.`, status);
  if (status === 404) return new GraphError("notfound", `OneDrive could not find this file${more}. The link may have been removed or may need sign-in with another account.`, status);
  if (status === 409 || status === 412) return new GraphError("conflict", `The file on OneDrive has changed since it was opened${more}.`, status);
  return new GraphError("other", `OneDrive answered ${status}${more}.`, status);
};

interface DriveItem {
  id: string;
  name: string;
  eTag?: string;
  webUrl?: string;
  size?: number;
  lastModifiedDateTime?: string;
  folder?: { childCount?: number };
  /** In "recent" lists, a file that lives in someone else's drive appears as a pointer to it. */
  remoteItem?: DriveItem;
  parentReference?: { driveId?: string; path?: string };
  "@microsoft.graph.downloadUrl"?: string;
}

/** One line of a list of files: a folder to go into or a workbook to open. */
export interface DriveEntry {
  driveId: string;
  itemId: string;
  name: string;
  folder: boolean;
  size?: number;
  /** ISO date of the last change. */
  modified?: string;
  /** The folder it is in, as a path (when OneDrive says), to tell files with the same name apart. */
  where?: string;
}

/** Folders, and the Excel workbooks (`.xlsx`) the app can open; nothing else is listed. */
const isWorkbook = (name: string) => /\.xlsx$/i.test(name);

/** `/drive/root:/Documents/Schedules` → `Documents/Schedules` (blank for the top). */
const whereOf = (path: string | undefined) => {
  const at = path?.indexOf("root:");
  if (path === undefined || at === undefined || at < 0) return undefined;
  try {
    return decodeURIComponent(path.slice(at + 5)).replace(/^\//, "");
  } catch {
    return path.slice(at + 5).replace(/^\//, "");
  }
};

const toEntry = (raw: DriveItem): DriveEntry | undefined => {
  const item = raw.remoteItem ?? raw;
  const driveId = item.parentReference?.driveId ?? raw.parentReference?.driveId;
  const folder = item.folder !== undefined;
  if (!driveId || (!folder && !isWorkbook(item.name))) return undefined;
  const where = whereOf(item.parentReference?.path ?? raw.parentReference?.path);
  return {
    driveId,
    itemId: item.id,
    name: item.name,
    folder,
    ...(item.size !== undefined ? { size: item.size } : {}),
    ...((item.lastModifiedDateTime ?? raw.lastModifiedDateTime) ? { modified: (item.lastModifiedDateTime ?? raw.lastModifiedDateTime)! } : {}),
    ...(where !== undefined ? { where } : {}),
  };
};

/** Every page is at most this many entries; a longer folder is cut off (the person can search instead). */
const MAX_LISTED = 1000;

const toSource = (item: DriveItem): OneDriveSource => ({
  driveId: item.parentReference?.driveId ?? "",
  itemId: item.id,
  eTag: item.eTag ?? "",
  name: item.name,
  webUrl: item.webUrl ?? "",
});

/** Which access a call needs; reading asks for less than writing. */
export type Access = "read" | "write";

export class GraphClient {
  constructor(
    private readonly token: (access: Access) => Promise<string>,
    private readonly fetcher: typeof fetch = (...a) => fetch(...a),
  ) {}

  private async call(access: Access, path: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetcher(path.startsWith("http") ? path : GRAPH + path, { ...init, headers: { Authorization: `Bearer ${await this.token(access)}`, ...init.headers } });
    } catch (e) {
      if (e instanceof GraphError) throw e;
      throw new GraphError("other", `could not reach OneDrive (${e instanceof Error ? e.message : String(e)})`);
    }
    if (!res.ok) {
      let detail = "";
      try {
        detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
      } catch {
        /* no detail */
      }
      throw explain(res.status, detail);
    }
    return res;
  }

  /** The file a sharing link points to, and its bytes. */
  async openShared(link: string): Promise<{ source: OneDriveSource; bytes: Uint8Array }> {
    const res = await this.call("read", `/shares/${encodeSharingUrl(link)}/driveItem`, { headers: { Prefer: "redeemSharingLinkIfNecessary" } });
    const item = (await res.json()) as DriveItem;
    return { source: toSource(item), bytes: await this.download(item) };
  }

  private async download(item: DriveItem): Promise<Uint8Array> {
    const url = item["@microsoft.graph.downloadUrl"];
    // The download address is pre-authorised; it must be fetched without the Authorization header.
    const res = url ? await this.fetcher(url) : await this.call("read", `/drives/${item.parentReference?.driveId}/items/${item.id}/content`);
    if (!res.ok) throw explain(res.status, "");
    return new Uint8Array(await res.arrayBuffer());
  }

  /** The pages of a list of items, as entries (folders first, then workbooks by name unless `keepOrder`). */
  private async list(path: string, keepOrder = false): Promise<DriveEntry[]> {
    const out: DriveEntry[] = [];
    let next: string | undefined = path;
    while (next && out.length < MAX_LISTED) {
      const res: Response = await this.call("read", next);
      const page = (await res.json()) as { value?: DriveItem[]; "@odata.nextLink"?: string };
      for (const raw of page.value ?? []) {
        const e = toEntry(raw);
        if (e) out.push(e);
      }
      next = page["@odata.nextLink"];
    }
    if (keepOrder) return out;
    return out.sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  }

  /** What is in a folder of the signed-in person's OneDrive (the top level when no folder is given). */
  folder(folder?: { driveId: string; itemId: string }): Promise<DriveEntry[]> {
    const base = folder ? `/drives/${folder.driveId}/items/${folder.itemId}/children` : "/me/drive/root/children";
    return this.list(`${base}?$top=200&$select=id,name,size,folder,lastModifiedDateTime,parentReference,webUrl`);
  }

  /** The workbooks the person used lately, most recent first. */
  recent(): Promise<DriveEntry[]> {
    return this.list("/me/drive/recent?$top=100", true).then((all) => all.filter((e) => !e.folder));
  }

  /** Workbooks whose name or contents match `text`. */
  search(text: string): Promise<DriveEntry[]> {
    const q = encodeURIComponent(text.trim().replace(/'/g, "''"));
    return this.list(`/me/drive/root/search(q='${q}')?$top=100&$select=id,name,size,folder,lastModifiedDateTime,parentReference,webUrl`, true).then((all) => all.filter((e) => !e.folder));
  }

  /** A file chosen from a list, and its bytes. */
  async openEntry(entry: Pick<DriveEntry, "driveId" | "itemId">): Promise<{ source: OneDriveSource; bytes: Uint8Array }> {
    const res = await this.call("read", `/drives/${entry.driveId}/items/${entry.itemId}`);
    const item = (await res.json()) as DriveItem;
    const withDrive = { ...item, parentReference: { ...item.parentReference, driveId: item.parentReference?.driveId ?? entry.driveId } };
    return { source: toSource(withDrive), bytes: await this.download(withDrive) };
  }

  /** Replace the contents of the file this schedule came from. Unless `force`, refuses if the file changed meanwhile. */
  async saveBack(source: OneDriveSource, bytes: Uint8Array, force = false): Promise<OneDriveSource> {
    const headers: Record<string, string> = { "Content-Type": XLSX };
    if (!force && source.eTag) headers["If-Match"] = source.eTag;
    const res = await this.call("write", `/drives/${source.driveId}/items/${source.itemId}/content`, { method: "PUT", headers, body: bytes as BodyInit });
    return { ...source, ...toSource((await res.json()) as DriveItem), name: source.name };
  }

  /** Put a new file in the Schedulizer folder of the signed-in user's OneDrive (renamed if the name is taken). */
  async saveNew(fileName: string, bytes: Uint8Array): Promise<OneDriveSource> {
    const path = `Schedulizer/${fileName}`.split("/").map(encodeURIComponent).join("/");
    const res = await this.call("write", `/me/drive/root:/${path}:/content?@microsoft.graph.conflictBehavior=rename`, { method: "PUT", headers: { "Content-Type": XLSX }, body: bytes as BodyInit });
    return toSource((await res.json()) as DriveItem);
  }

  /** A link that lets people in the organization open (or edit) the file. */
  async shareLink(source: OneDriveSource, type: "view" | "edit"): Promise<string> {
    const res = await this.call("write", `/drives/${source.driveId}/items/${source.itemId}/createLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, scope: "organization" }),
    });
    const link = ((await res.json()) as { link?: { webUrl?: string } }).link?.webUrl;
    if (!link) throw new GraphError("other", "OneDrive did not return a link");
    return link;
  }
}

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
