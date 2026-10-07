import { ImportReport, OpenBar, type OpenReport } from "../components";

/** Open Excel files or examples; shows how the last opening went. */
export function ImportPage({ reports, onReports, onDismiss }: { reports: OpenReport[] | undefined; onReports: (r: OpenReport[]) => void; onDismiss: () => void }) {
  return (
    <>
      <p className="muted small">Files from the old Course Schedulizer open too. Each file becomes its own schedule, or replaces one that is open.</p>
      <p className="muted small">Obtain official schedules from <a href="https://reports.calvin.edu/Reports/report/Departmental%20Reports/Schedulizer%20Course%20Sections" target="_blank" rel="noreferrer">reports.calvin.edu</a>.</p>
      <OpenBar onReports={onReports} />
      {reports && <ImportReport reports={reports} onDismiss={onDismiss} />}
    </>
  );
}
