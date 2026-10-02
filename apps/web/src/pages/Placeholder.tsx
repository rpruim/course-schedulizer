export function Placeholder({ title, what }: { title: string; what: string }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{what}</p>
      <p className="muted">Not built yet.</p>
    </div>
  );
}
