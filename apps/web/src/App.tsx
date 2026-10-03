import { useEffect, useRef, useState } from "react";
import { HashRouter, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { Toolbar, type OpenReport } from "./components";
import { EditorProvider } from "./editor/context";
import { AboutPage } from "./pages/AboutPage";
import { ComparePage } from "./pages/ComparePage";
import { ConstraintsPage } from "./pages/ConstraintsPage";
import { ConflictsPage } from "./pages/ConflictsPage";
import { MetaPage } from "./pages/MetaPage";
import { ExportPage } from "./pages/ExportPage";
import { ImportPage } from "./pages/ImportPage";
import { HelpPage } from "./pages/HelpPage";
import { LoadsPage } from "./pages/LoadsPage";
import { NonTeachingPage } from "./pages/NonTeachingPage";
import { ReleaseNotesPage } from "./pages/ReleaseNotesPage";
import { SchedulePage } from "./pages/SchedulePage";
import { WeekPage } from "./pages/WeekPage";
import { SchedulePicker } from "./schedules";
import { MenuBar, type MenuGroup } from "./MenuBar";
import { sharedOpener } from "./onedrive/auth";
import { ColorKeyWindow } from "./colorKey";
import { metaOpen } from "./metaOpen";
import { linkRequests, type LinkRequest } from "./remote";
import { fetchSchedule } from "./remoteOpen";
import { useWorkspace, WorkspaceProvider } from "./state";
import { emptySchedule } from "@schedulizer/core";

const NEW_SCHEDULE = "New schedule";

const tabs = (reports: OpenReport[] | undefined, setReports: (r: OpenReport[] | undefined) => void): { to: string; label: string; element: JSX.Element }[] => [
  { to: "/", label: "Schedule", element: <SchedulePage /> },
  { to: "/loads", label: "Teaching loads", element: <LoadsPage /> },
  { to: "/nonteaching", label: "Non-teaching", element: <NonTeachingPage /> },
  { to: "/conflicts", label: "Conflicts", element: <ConflictsPage /> },
  { to: "/constraints", label: "Constraints", element: <ConstraintsPage /> },
  { to: "/dept", label: "Dept week", element: <WeekPage kind="dept" /> },
  { to: "/faculty", label: "Faculty week", element: <WeekPage kind="faculty" /> },
  { to: "/rooms", label: "Room week", element: <WeekPage kind="room" /> },
  { to: "/compare", label: "Compare", element: <ComparePage /> },
  { to: "/massedit", label: "Mass edit", element: <WeekPage kind="dept" mass /> },
  { to: "/meta", label: "Meta", element: <MetaPage /> },
  { to: "/import", label: "Import", element: <ImportPage reports={reports} onReports={setReports} onDismiss={() => setReports(undefined)} /> },
  { to: "/export", label: "Export", element: <ExportPage /> },
  { to: "/help", label: "User guide", element: <HelpPage /> },
  { to: "/news", label: "Release notes", element: <ReleaseNotesPage /> },
  { to: "/about", label: "About", element: <AboutPage /> },
];

/** How the pages are grouped in the menu bar. */
const groups = (newBlank: () => void): MenuGroup[] => [
  { label: "Schedule", direct: true, items: [{ to: "/", label: "Schedule" }] },
  { label: "Loads", items: [{ to: "/loads", label: "Teaching loads" }, { to: "/nonteaching", label: "Non-teaching load" }] },
  { label: "View", items: [{ to: "/dept", label: "Dept week" }, { to: "/faculty", label: "Faculty week" }, { to: "/rooms", label: "Room week" }] },
  { label: "Check", items: [{ to: "/conflicts", label: "Conflicts" }, { to: "/constraints", label: "Constraints" }, { to: "/compare", label: "Compare" }] },
  { label: "Mass edit", direct: true, items: [{ to: "/massedit", label: "Mass edit" }] },
  { label: "File", items: [{ label: "+ New blank schedule", onSelect: newBlank }, { to: "/meta", label: "Meta" }, { to: "/import", label: "Import" }, { to: "/export", label: "Export" }] },
  { label: "Help", items: [{ to: "/help", label: "User guide" }, { to: "/news", label: "Release notes" }, { to: "/about", label: "About" }] },
];

function Shell() {
  const { saveError, restored, entries, addSchedule, currentId } = useWorkspace();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Whenever a different schedule becomes current, the Meta tab opens just that one (toggles are remembered until then).
  useEffect(() => metaOpen.only(currentId), [currentId]);
  const none = entries.length === 0;
  const [reports, setReports] = useState<OpenReport[] | undefined>();
  const [notice, setNotice] = useState("");
  const [opening, setOpening] = useState(false);
  const wanted = linkRequests(params);
  const opened = useRef("");
  // Files from a link that sit on OneDrive and wait for a click, because Microsoft's sign-in window needs one.
  const [waiting, setWaiting] = useState<{ files: LinkRequest[]; academicYear?: string } | undefined>();
  async function openFiles(files: LinkRequest[], academicYear: string | undefined, interactive: boolean) {
    setOpening(true);
    const shared = sharedOpener(interactive);
    const results = [];
    for (const f of files) results.push(await fetchSchedule(f, academicYear, undefined, undefined, shared));
    for (const r of results) if (r.schedule) addSchedule(r.name, r.schedule, r.source);
    const signIn = results.flatMap((r, i) => (r.needsSignIn ? [files[i]!] : []));
    setWaiting(signIn.length ? { files: signIn, ...(academicYear ? { academicYear } : {}) } : undefined);
    const count = results.filter((r) => r.schedule).length;
    const problems = results.filter((r) => !r.needsSignIn).some((r) => r.report.issues.length > 0);
    const done = results.filter((r) => !r.needsSignIn).map((r) => r.report);
    setReports(done.length ? done : undefined);
    setOpening(false);
    // The address is spent: drop it so reloading the page does not open the files again.
    navigate(count > 0 && !problems && signIn.length === 0 ? "/" : "/import", { replace: true });
    if (count > 0 && !problems) setNotice(count === 1 ? `Opened “${results.find((r) => r.schedule)!.name}” from the link.` : `Opened ${count} schedules from the link.`);
  }
  // A link that names files (`#/import?url=…`) opens them as new schedules once the saved workspace is back.
  useEffect(() => {
    if (!restored || wanted.files.length === 0 || opened.current === params.toString()) return;
    opened.current = params.toString();
    void openFiles(wanted.files, wanted.academicYear, false);
  });
  // With nothing open, the first thing to do is open something: go to Import (at start-up, and when the last schedule is removed).
  useEffect(() => {
    if (restored && none && wanted.files.length === 0 && !opening) navigate("/import", { replace: true });
  }, [restored, none, navigate, wanted.files.length, opening]);
  // A notice describes what just happened; let it go on its own (an undo can make it untrue).
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  const TABS = tabs(reports, setReports);
  // A new empty schedule becomes the current one, and its Meta tab opens so it can be named.
  const newBlankSchedule = () => {
    const blank = emptySchedule();
    addSchedule(NEW_SCHEDULE, { ...blank, meta: { ...blank.meta, nickname: NEW_SCHEDULE } });
    navigate("/meta");
  };
  return (
    <EditorProvider onNotice={setNotice}>
      <div className="app">
        <header>
          <h1>Course Schedulizer</h1>
          <Toolbar />
        </header>
        <SchedulePicker />
        {notice && (
          <p className="note ok" role="status">{notice} <button className="link" onClick={() => setNotice("")}>Dismiss</button></p>
        )}
        {saveError && <p className="note warn">Your browser would not keep a working copy ({saveError}). Export to Excel to keep your changes.</p>}
        {opening && <p className="note" role="status">Opening the file from the link…</p>}
        {waiting && !opening && (
          <p className="note" role="status">
            {waiting.files.length === 1 ? "This file is on OneDrive." : `${waiting.files.length} files are on OneDrive.`} Sign in with Microsoft to open {waiting.files.length === 1 ? "it" : "them"}.{" "}
            <button className="primary" onClick={() => void openFiles(waiting.files, waiting.academicYear, true)}>Sign in and open</button>{" "}
            <button className="link" onClick={() => setWaiting(undefined)}>Dismiss</button>
          </p>
        )}
        <ColorKeyWindow />
        <MenuBar groups={groups(newBlankSchedule)} />
        <main>
          <Routes>
            {TABS.map((t) => <Route key={t.to} path={t.to} element={t.element} />)}
          </Routes>
        </main>
      </div>
    </EditorProvider>
  );
}

export function App() {
  return (
    <HashRouter>
      <WorkspaceProvider>
        <Shell />
      </WorkspaceProvider>
    </HashRouter>
  );
}
