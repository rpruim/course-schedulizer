import { useEffect, useRef, useState } from "react";

export interface MultiChoice {
  value: string;
  label: string;
  /** Drawn in the muted style (for entries such as "missing"). */
  muted?: boolean;
}

/** A drop-down with a check box for each choice. Nothing checked means "all"; the button says what is checked. */
export function MultiSelect({ choices, selected, onChange, allLabel = "All" }: { choices: MultiChoice[]; selected: string[]; onChange: (values: string[]) => void; allLabel?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const labelOf = (v: string) => choices.find((c) => c.value === v)?.label ?? v;
  const summary = selected.length === 0 ? allLabel : selected.length <= 2 ? selected.map(labelOf).join(", ") : `${selected.length} selected`;
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="multi" ref={box}>
      <button type="button" className="multi-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} title={selected.map(labelOf).join(", ")}>
        <span className="multi-summary">{summary}</span> <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="multi-list" role="listbox" aria-multiselectable="true">
          <button type="button" className="link multi-clear" onClick={() => onChange([])} disabled={selected.length === 0}>Show all</button>
          {choices.length === 0 && <p className="muted small">Nothing to choose from.</p>}
          {choices.map((c) => (
            <label key={c.value || "(missing)"} className={`multi-item${c.muted ? " muted" : ""}`}>
              <input type="checkbox" checked={selected.includes(c.value)} onChange={() => toggle(c.value)} /> {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
