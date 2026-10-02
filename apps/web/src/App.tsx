import { useEffect, useState } from "react";
import { HashRouter, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { Toolbar, type OpenReport } from "./components";
import { EditorProvider } from "./editor/context";
import { ComparePage } from "./pages/ComparePage";
import { ConflictsPage } from "./pages/ConflictsPage";
import { MetaPage } from "./pages/MetaPage";
import { ExportPage } from "./pages/ExportPage";
import { ImportPage } from "./pages/ImportPage";
import { LoadsPage } from "./pages/LoadsPage";
import { NonTeachingPage } from "./pages/NonTeachingPage";
import { SchedulePage } from "./pages/SchedulePage";
import { WeekPage } from "./pages/WeekPage";
import { SchedulePicker } from "./schedules";
import { useWorkspace, WorkspaceProvider } from "./state";

const tabs = (reports: OpenReport[] | undefined, setReports: (r: OpenReport[] | undefined) => void): { to: string; label: string; element: JSX.Element }[] => [
  { to: "/", label: "Schedule", element: <SchedulePage /> },
  { to: "/loads", label: "Teaching loads", element: <LoadsPage /> },
  { to: "/nonteaching", label: "Non-teaching", element: <NonTeachingPage /> },
  { to: "/conflicts", label: "Conflicts", element: <ConflictsPage /> },
  { to: "/dept", label: "Dept week", element: <WeekPage kind="dept" /> },
  { to: "/faculty", label: "Faculty week", element: <WeekPage kind="faculty" /> },
  { to: "/rooms", label: "Room week", element: <WeekPage kind="room" /> },
  { to: "/compare", label: "Compare", element: <ComparePage /> },
  { to: "/meta", label: "Meta", element: <MetaPage /> },
  { to: "/import", label: "Import", element: <ImportPage reports={reports} onReports={setReports} onDismiss={() => setReports(undefined)} /> },
  { to: "/export", label: "Export", element: <ExportPage /> },
];

function Shell() {
  const { saveError, restored, entries } = useWorkspace();
  const navigate = useNavigate();
  const none = entries.length === 0;
  // With nothing open, the first thing to do is open something: go to Import (at start-up, and when the last schedule is removed).
  useEffect(() => {
    if (restored && none) navigate("/import", { replace: true });
  }, [restored, none, navigate]);
  const [reports, setReports] = useState<OpenReport[] | undefined>();
  const [notice, setNotice] = useState("");
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
        <nav>
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.to === "/"}>{t.label}</NavLink>
          ))}
        </nav>
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
