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
import { SchedulePage } from "./pages/SchedulePage";
import { WeekPage } from "./pages/WeekPage";
import { SchedulePicker } from "./schedules";
import { MenuBar, type MenuGroup } from "./MenuBar";
import { linkRequests } from "./remote";
import { fetchSchedule } from "./remoteOpen";
import { useWorkspace, WorkspaceProvider } from "./state";

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
  { to: "/meta", label: "Meta", element: <MetaPage /> },
  { to: "/import", label: "Import", element: <ImportPage reports={reports} onReports={setReports} onDismiss={() => setReports(undefined)} /> },
  { to: "/export", label: "Export", element: <ExportPage /> },
  { to: "/help", label: "User guide", element: <HelpPage /> },
  { to: "/about", label: "About", element: <AboutPage /> },
];

/** How the pages are grouped in the menu bar. */
const GROUPS: MenuGroup[] = [
  { label: "Schedule", direct: true, items: [{ to: "/", label: "Schedule" }] },
  { label: "Loads", items: [{ to: "/loads", label: "Teaching loads" }, { to: "/nonteaching", label: "Non-teaching load" }] },
  { label: "View", items: [{ to: "/dept", label: "Dept week" }, { to: "/faculty", label: "Faculty week" }, { to: "/rooms", label: "Room week" }] },
  { label: "Check", items: [{ to: "/conflicts", label: "Conflicts" }, { to: "/constraints", label: "Constraints" }, { to: "/compare", label: "Compare" }] },
  { label: "File", items: [{ to: "/meta", label: "Meta" }, { to: "/import", label: "Import" }, { to: "/export", label: "Export" }] },
  { label: "Help", items: [{ to: "/help", label: "User guide" }, { to: "/about", label: "About" }] },
];

function Shell() {
  const { saveError, restored, entries, addSchedule } = useWorkspace();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const none = entries.length === 0;
  const [reports, setReports] = useState<OpenReport[] | undefined>();
  const [notice, setNotice] = useState("");
  const [opening, setOpening] = useState(false);
  const wanted = linkRequests(params);
  const opened = useRef("");
  // A link that names files (`#/import?url=…`) opens them as new schedules once the saved workspace is back.
  useEffect(() => {
    if (!restored || wanted.files.length === 0 || opened.current === params.toString()) return;
    opened.current = params.toString();
    setOpening(true);
    void (async () => {
      const results = [];
      for (const f of wanted.files) results.push(await fetchSchedule(f, wanted.academicYear));
      for (const r of results) if (r.schedule) addSchedule(r.name, r.schedule);
      const count = results.filter((r) => r.schedule).length;
      const problems = results.some((r) => r.report.issues.length > 0);
      setReports(results.map((r) => r.report));
      setOpening(false);
      // The address is spent: drop it so reloading the page does not open the files again.
      navigate(count > 0 && !problems ? "/" : "/import", { replace: true });
      if (count > 0 && !problems) setNotice(count === 1 ? `Opened “${results[0]!.name}” from the link.` : `Opened ${count} schedules from the link.`);
    })();
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
        <MenuBar groups={GROUPS} />
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
