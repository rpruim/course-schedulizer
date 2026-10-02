import { useEffect, useState } from "react";
import { HashRouter, NavLink, Route, Routes } from "react-router-dom";
import { ImportReport, OpenBar, Toolbar, type OpenReport } from "./components";
import { EditorProvider } from "./editor/context";
import { ComparePage } from "./pages/ComparePage";
import { ConflictsPage } from "./pages/ConflictsPage";
import { LoadsPage } from "./pages/LoadsPage";
import { NonTeachingPage } from "./pages/NonTeachingPage";
import { SchedulePage } from "./pages/SchedulePage";
import { WeekPage } from "./pages/WeekPage";
import { SchedulePicker } from "./schedules";
import { useWorkspace, WorkspaceProvider } from "./state";

const TABS: { to: string; label: string; element: JSX.Element }[] = [
  { to: "/", label: "Schedule", element: <SchedulePage /> },
  { to: "/loads", label: "Teaching loads", element: <LoadsPage /> },
  { to: "/nonteaching", label: "Non-teaching", element: <NonTeachingPage /> },
  { to: "/conflicts", label: "Conflicts", element: <ConflictsPage /> },
  { to: "/dept", label: "Dept week", element: <WeekPage kind="dept" /> },
  { to: "/faculty", label: "Faculty week", element: <WeekPage kind="faculty" /> },
  { to: "/rooms", label: "Room week", element: <WeekPage kind="room" /> },
  { to: "/compare", label: "Compare", element: <ComparePage /> },
];

function Shell() {
  const { saveError } = useWorkspace();
  const [reports, setReports] = useState<OpenReport[] | undefined>();
  const [notice, setNotice] = useState("");
  // A notice describes what just happened; let it go on its own (an undo can make it untrue).
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  return (
    <EditorProvider onNotice={setNotice}>
      <div className="app">
        <header>
          <h1>Course Schedulizer</h1>
        </header>
        <OpenBar onReports={setReports} />
        {reports && <ImportReport reports={reports} onDismiss={() => setReports(undefined)} />}
        <SchedulePicker />
        {notice && (
          <p className="note ok" role="status">{notice} <button className="link" onClick={() => setNotice("")}>Dismiss</button></p>
        )}
        {saveError && <p className="note warn">Your browser would not keep a working copy ({saveError}). Export to Excel to keep your changes.</p>}
        <Toolbar />
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
