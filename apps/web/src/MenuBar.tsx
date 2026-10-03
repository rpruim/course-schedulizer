import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

/** A page to go to (`to`), or an action to run (`onSelect`). */
export interface MenuItem {
  label: string;
  to?: string;
  onSelect?: () => void;
}
/** A top-level entry: a plain link (one item, no `label` of its own) or a menu of links. */
export interface MenuGroup {
  label: string;
  items: MenuItem[];
  /** Show the single item as a plain tab instead of a menu. */
  direct?: boolean;
}

/** The navigation bar: tabs that open dropdown menus of related pages. */
export function MenuBar({ groups }: { groups: MenuGroup[] }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState<string | undefined>();
  const bar = useRef<HTMLElement>(null);

  // Close on navigating, on a click elsewhere, and on Escape.
  useEffect(() => setOpen(undefined), [pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !bar.current?.contains(e.target as Node) && setOpen(undefined);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(undefined);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <nav className="menubar" ref={bar} aria-label="Pages">
      {groups.map((g) => {
        if (g.direct) {
          const it = g.items[0]!;
          return <NavLink key={it.label} to={it.to ?? "/"} end={it.to === "/"}>{g.label}</NavLink>;
        }
        const current = g.items.find((it) => it.to !== undefined && (it.to === "/" ? pathname === "/" : pathname === it.to || pathname.startsWith(`${it.to}/`)));
        const here = current !== undefined;
        const isOpen = open === g.label;
        return (
          <div className="menu" key={g.label}>
            <button
              type="button"
              className={`menu-button${here ? " active" : ""}`}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? undefined : g.label)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setOpen(g.label);
                  requestAnimationFrame(() => (e.currentTarget.nextElementSibling?.querySelector("a, button") as HTMLElement | null)?.focus());
                }
              }}
            >
              {current ? `${g.label}: ${current.label}` : g.label} <span aria-hidden="true">▾</span>
            </button>
            {isOpen && (
              <div className="menu-list" role="menu">
                {g.items.map((it) => {
                  const keys = (e: React.KeyboardEvent<HTMLElement>) => {
                    const items = [...(e.currentTarget.parentElement?.querySelectorAll("a, button") ?? [])] as HTMLElement[];
                    const i = items.indexOf(e.currentTarget);
                    if (e.key === "ArrowDown") (e.preventDefault(), items[(i + 1) % items.length]?.focus());
                    if (e.key === "ArrowUp") (e.preventDefault(), items[(i - 1 + items.length) % items.length]?.focus());
                  };
                  return it.to !== undefined ? (
                    <NavLink key={it.label} to={it.to} role="menuitem" onKeyDown={keys}>{it.label}</NavLink>
                  ) : (
                    <button key={it.label} type="button" role="menuitem" onKeyDown={keys} onClick={() => { setOpen(undefined); it.onSelect?.(); }}>{it.label}</button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
