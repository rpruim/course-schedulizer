import { useCallback, useEffect, useRef, useState } from "react";
import { graphClient, oneDriveConfigured, signedInAccount, signIn } from "./auth";
import { GraphError, type DriveEntry } from "./graph";

type View = "recent" | "browse" | "search";
interface Step {
  driveId?: string;
  itemId?: string;
  name: string;
}

const size = (bytes: number | undefined) => (bytes === undefined ? "" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const when = (iso: string | undefined) => {
  const d = iso ? new Date(iso) : undefined;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
};

/**
 * Pick a workbook from the signed-in person's OneDrive: recent files, a search, or folder by folder. Choosing a file hands it to
 * `onOpen`. Hidden when this site has no app registration.
 */
export function OneDrivePicker({ onOpen, busy }: { onOpen: (entry: DriveEntry) => Promise<void>; busy: boolean }) {
  const [shown, setShown] = useState(false);
  const [account, setAccount] = useState<string | undefined>();
  const [view, setView] = useState<View>("recent");
  const [path, setPath] = useState<Step[]>([]);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<DriveEntry[] | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef(0);

  useEffect(() => {
    if (oneDriveConfigured) void signedInAccount().then((a) => setAccount(a?.username)).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    setLoading(true);
    setError("");
    try {
      const client = graphClient(false);
      const here = path[path.length - 1];
      const got = view === "recent" ? await client.recent() : view === "search" ? await client.search(query) : await client.folder(here?.driveId && here.itemId ? { driveId: here.driveId, itemId: here.itemId } : undefined);
      if (mine === latest.current) setEntries(got);
    } catch (e) {
      if (mine !== latest.current) return;
      setEntries(undefined);
      if (e instanceof GraphError && (e.kind === "signin" || e.kind === "auth")) setAccount(undefined);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mine === latest.current) setLoading(false);
    }
  }, [view, path, query]);

  useEffect(() => {
    if (shown && account && (view !== "search" || query.trim())) void load();
  }, [shown, account, load, view, query]);

  if (!oneDriveConfigured) return null;

  async function logIn() {
    setError("");
    try {
      const a = await signIn("read");
      setAccount(a.username);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  const show = (v: View) => {
    setView(v);
    if (v === "browse") setPath([]);
  };
  const search = () => {
    if (!text.trim()) return;
    setQuery(text.trim());
    setView("search");
  };
  async function choose(entry: DriveEntry) {
    if (entry.folder) {
      setView("browse");
      setPath((p) => [...p, { driveId: entry.driveId, itemId: entry.itemId, name: entry.name }]);
      return;
    }
    await onOpen(entry);
  }

  return (
    <div className="od-picker">
      <button type="button" aria-expanded={shown} onClick={() => setShown(!shown)} disabled={busy}>{shown ? "Hide OneDrive files" : "Open from OneDrive…"}</button>
      {shown && (
        <div className="od-panel">
          {!account ? (
            <p>
              <button type="button" className="primary" onClick={() => void logIn()}>Sign in with Microsoft</button>{" "}
              <span className="muted small">to see the Excel files in your OneDrive. Files open in this browser; nothing is sent anywhere else.</span>
            </p>
          ) : (
            <>
              <div className="bar">
                <span className="od-tabs" role="tablist" aria-label="Where to look">
                  <button type="button" role="tab" aria-selected={view === "recent"} className={view === "recent" ? "on" : ""} onClick={() => show("recent")}>Recent</button>
                  <button type="button" role="tab" aria-selected={view === "browse"} className={view === "browse" ? "on" : ""} onClick={() => show("browse")}>Browse</button>
                </span>
                <label className="field grow">
                  Search your OneDrive
                  <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="a name or a word in the file" />
                </label>
                <button type="button" onClick={search} disabled={!text.trim()}>Search</button>
                <span className="muted small">{account}</span>
              </div>
              {view === "browse" && (
                <nav className="od-path" aria-label="Folder">
                  <button type="button" className="link" onClick={() => setPath([])} disabled={path.length === 0}>OneDrive</button>
                  {path.map((s, i) => (
                    <span key={`${s.itemId}-${i}`}>
                      {" › "}
                      <button type="button" className="link" onClick={() => setPath(path.slice(0, i + 1))} disabled={i === path.length - 1}>{s.name}</button>
                    </span>
                  ))}
                </nav>
              )}
              {view === "search" && <p className="muted small">Excel files matching “{query}”. <button type="button" className="link" onClick={() => show("recent")}>Back to recent files</button></p>}
              {loading && <p className="muted">Looking…</p>}
              {!loading && entries && entries.length === 0 && (
                <p className="muted">{view === "recent" ? "No recent Excel files." : view === "search" ? "No Excel files match." : "This folder has no Excel files or folders."}</p>
              )}
              {entries && entries.length > 0 && (
                <ul className="od-list">
                  {entries.map((e) => (
                    <li key={`${e.driveId}/${e.itemId}`}>
                      <button type="button" disabled={busy} onClick={() => void choose(e)} title={e.folder ? "Open this folder" : "Open this file in the app"}>
                        <span className="od-name">{e.folder ? "📁 " : ""}{e.name}</span>
                        {e.where !== undefined && view !== "browse" && <span className="muted small od-where">{e.where || "OneDrive"}</span>}
                        <span className="muted small od-meta">{e.folder ? "" : size(e.size)}{e.modified ? `${e.folder ? "" : " · "}${when(e.modified)}` : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {error && <p className="note warn" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
