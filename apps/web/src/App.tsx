import { useState } from "react";
import { HashRouter, NavLink, Route, Routes } from "react-router-dom";
import type { Issue } from "@schedulizer/core";
import { ImportReport, OpenBar, Toolbar } from "./components";
import { ConflictsPage } from "./pages/ConflictsPage";
import { LoadsPage } from "./pages/LoadsPage";
import { Placeholder } from "./pages/Placeholder";
import { SchedulePage } from "./pages/SchedulePage";
import { ScheduleProvider, useSchedule } from "./state";

const TABS: { to: string; label: string; element: JSX.Element }[] = [
  { to: "/", label: "Schedule", element: <SchedulePage /> },
  { to: "/loads", label: "Teaching loads", element: <LoadsPage /> },
  { to: "/conflicts", label: "Conflicts", element: <ConflictsPage /> },
  { to: "/dept", label: "Dept week", element: <Placeholder title="Department week" what="A weekly grid of every section; click a block to edit it." /> },
  { to: "/faculty", label: "Faculty week", element: <Placeholder title="Faculty week" what="A weekly grid for one or more instructors, with conflicts highlighted." /> },
  { to: "/rooms", label: "Room week", element: <Placeholder title="Room week" what="A weekly grid for each room." /> },
  { to: "/compare", label: "Compare", element: <Placeholder title="Compare schedules" what="Two schedules side by side: sections added, removed and changed." /> },
];

function Shell() {
  const { fileName, saveError } = useSchedule();
  const [issues, setIssues] = useState<Issue[] | undefined>();
  return (
    <div className="app">
      <header>
        <h1>Course Schedulizer</h1>
        <span className="muted file">{fileName}</span>
      </header>
      <OpenBar onIssues={setIssues} />
      {issues && <ImportReport issues={issues} onDismiss={() => setIssues(undefined)} />}
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
  );
}

export function App() {
  return (
    <HashRouter>
      <ScheduleProvider>
        <Shell />
      </ScheduleProvider>
    </HashRouter>
  );
}
