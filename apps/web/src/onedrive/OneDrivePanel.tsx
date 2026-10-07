import { useEffect, useState } from "react";
import { shareLink } from "../remote";
import { useWorkspace, type Entry } from "../state";
import { graphClient, oneDriveConfigured, signedInAccount, signIn, signOut } from "./auth";
import { GraphError } from "./graph";

type Message = { kind: "ok" | "error"; text: string };

/** Save the current schedule to OneDrive and get a link that opens it in the app. Hidden when the site has no app registration. */
export function OneDrivePanel({ entry, build, fileNames, disabled }: { entry: Entry; build: () => Promise<Uint8Array>; fileNames: { current: string; archive?: string }; disabled: boolean }) {
  const ws = useWorkspace();
  const [account, setAccount] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | undefined>();
  const [conflict, setConflict] = useState(false);
  const [link, setLink] = useState("");
  const [access, setAccess] = useState<"edit" | "view">("edit");
  const [linkAccess, setLinkAccess] = useState<"edit" | "view">("edit");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (oneDriveConfigured) void signedInAccount().then((a) => setAccount(a?.username)).catch(() => undefined);
  }, []);
  // What was said about one schedule does not apply to another.
  useEffect(() => {
    setMessage(undefined);
    setConflict(false);
    setLink("");
  }, [entry.id]);
  if (!oneDriveConfigured) return null;

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage(undefined);
    try {
      await work();
    } catch (e) {
      if (e instanceof GraphError && e.kind === "conflict") setConflict(true);
      setMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const save = (force: boolean) =>
    run(async () => {
      const client = graphClient(true);
      const bytes = await build();
      if (fileNames.archive) {
        // Both names: the file with the fixed name is the current version (overwritten each time, so a link to it always shows the latest);
        // the dated copy is a new file each time. The current version goes first, so a conflict stops the save before any dated copy is made.
        const sameFile = entry.source && entry.source.name.toLowerCase() === fileNames.current.toLowerCase();
        const current = sameFile ? await client.saveBack(entry.source!, bytes, force) : await client.saveNamed(fileNames.current, bytes);
        const copy = await client.saveNew(fileNames.archive, bytes);
        ws.setSource(entry.id, { ...current, name: fileNames.current });
        setConflict(false);
        setLink("");
        setAccount((await signedInAccount())?.username);
        setMessage({ kind: "ok", text: `Saved the current version as “${fileNames.current}” and a dated copy as “${copy.name}” in the Schedulizer folder of your OneDrive. A link to “${fileNames.current}” always shows the latest save.` });
        return;
      }
      const source = entry.source ? await client.saveBack(entry.source, bytes, force) : await client.saveNew(fileNames.current, bytes);
      ws.setSource(entry.id, source);
      setConflict(false);
      setLink("");
      setAccount((await signedInAccount())?.username);
      setMessage({ kind: "ok", text: entry.source ? `Saved to “${source.name}” on OneDrive.` : `Saved as “${source.name}” in the Schedulizer folder of your OneDrive.` });
    });

  const makeLink = () =>
    run(async () => {
      if (!entry.source) return;
      const url = await graphClient(true).shareLink(entry.source, access);
      setLink(shareLink(window.location.href, [{ url }]));
      setLinkAccess(access);
      setCopied(false);
    });

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      /* the link is shown in full to copy by hand */
    }
  }

  return (
    <div className="onedrive">
      <div className="bar">
        <strong>OneDrive</strong>
        <button className="primary" onClick={() => void save(false)} disabled={busy || disabled}>
          {fileNames.archive ? "Save to OneDrive: current version and dated copy" : entry.source ? "Save to OneDrive" : "Save a copy to OneDrive"}
        </button>
        {entry.source && (
          <>
            <button onClick={() => void makeLink()} disabled={busy}>Get link to share</button>
            <label className="field">Link lets people
              <select value={access} onChange={(e) => { setAccess(e.target.value as "edit" | "view"); setLink(""); }}>
                <option value="edit">edit and save back</option>
                <option value="view">only view (a copy)</option>
              </select>
            </label>
          </>
        )}
        <span className="spacer" />
        {account ? (
          <span className="muted small">
            Signed in as {account}{" "}
            <button className="link" onClick={() => void run(async () => { await signOut(); setAccount(undefined); })}>Sign out</button>
          </span>
        ) : (
          <button onClick={() => void run(async () => { setAccount((await signIn("write")).username); })} disabled={busy}>Sign in with Microsoft</button>
        )}
      </div>
      {fileNames.archive && (
        <p className="muted small">
          With <em>Both</em> chosen, each save writes the current version as <code>{fileNames.current}</code> (replaced each time, so a link to it always shows the latest save) and adds a dated copy, <code>{fileNames.archive}</code>, to keep earlier versions.
        </p>
      )}
      {entry.source ? (
        <p className="muted small">
          Opened from or saved to <a href={entry.source.webUrl} target="_blank" rel="noreferrer">{entry.source.name}</a> on OneDrive; <em>Save to OneDrive</em> writes back to it.{" "}
          <button className="link" onClick={() => ws.setSource(entry.id, undefined)}>Disconnect</button>
        </p>
      ) : (
        <p className="muted small">Saves the whole schedule (including non-teaching load) as an Excel file in a <em>Schedulizer</em> folder on your OneDrive. After that, <em>Save to OneDrive</em> keeps that file up to date and you can get a link to share.</p>
      )}
      {message && <p className={`note ${message.kind === "ok" ? "ok" : "warn"}`} role="status">{message.text}</p>}
      {conflict && <p className="small">Someone changed the file on OneDrive after you opened it. <button onClick={() => void save(true)} disabled={busy}>Overwrite it anyway</button></p>}
      {link && (
        <p className="small">
          <span className="muted">Anyone at your organization who opens this link gets the app with the schedule loaded{linkAccess === "edit" ? ", and can save changes back to your file" : "; they can change their copy but not your file"}: </span>
          <code className="breakable">{link}</code> <button onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</button>
        </p>
      )}
    </div>
  );
}
