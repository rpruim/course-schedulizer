import { ExportPanel } from "../components";
import { useWorkspace } from "../state";
import { Empty } from "./SchedulePage";

export function ExportPage() {
  const ws = useWorkspace();
  if (ws.entries.length === 0) return <Empty />;
  return (
    <>
      <p className="muted small">The first sheet is the registrar’s format; the other sheets let this app read the file back in full.</p>
      <ExportPanel />
    </>
  );
}
