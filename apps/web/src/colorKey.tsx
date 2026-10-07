import { useCallback, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { COLOR_BY, type Block, type ColorBy } from "./week";

/** One line of the key: what a color stands for. `hue` undefined is the gray of "missing". */
export interface KeyEntry {
  label: string;
  hue: number | undefined;
  /** Lightness step (0 lightest … 2 darkest in a light theme). */
  tone?: number;
}
export interface KeyInfo {
  /** For example "Color by Prefix". */
  title: string;
  entries: KeyEntry[];
}

const MISSING = "(none given)";

/** The key for the blocks on screen: each distinct value once, in natural order, gray "none given" last. */
export function keyFor(colorBy: ColorBy, blocks: (Pick<Block, "colorValue" | "hue"> & { tone?: number })[]): KeyInfo {
  const seen = new Map<string, number | undefined>();
  const tones = new Map<string, number | undefined>();
  for (const b of blocks) if (!seen.has(b.colorValue)) { seen.set(b.colorValue, b.hue); tones.set(b.colorValue, b.tone); }
  const named = [...seen].filter(([v]) => v !== "").sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  const entries: KeyEntry[] = named.map(([label, hue]) => (tones.get(label) === undefined ? { label, hue } : { label, hue, tone: tones.get(label) }));
  const cohort = colorBy.startsWith("cohort:");
  if (seen.has("")) entries.push({ label: cohort ? "(not in the rule)" : MISSING, hue: undefined });
  return { title: `Color by ${cohort ? `cohort ${colorBy.slice(7)}` : (COLOR_BY.find((c) => c.value === colorBy)?.label ?? colorBy)}`, entries };
}

// ---- the choice of what to color by: shared by the three week tabs and remembered

const COLOR_KEY = "schedulizer:colorBy";
const isColorBy = (v: unknown): v is ColorBy => COLOR_BY.some((c) => c.value === v) || (typeof v === "string" && v.startsWith("cohort:"));
let colorBy: ColorBy = (() => {
  try {
    const v = window.localStorage.getItem(COLOR_KEY);
    return isColorBy(v) ? v : "prefix";
  } catch {
    return "prefix";
  }
})();
const colorListeners = new Set<() => void>();

export function useColorBy(): [ColorBy, (c: ColorBy) => void] {
  const value = useSyncExternalStore((l) => (colorListeners.add(l), () => void colorListeners.delete(l)), () => colorBy);
  const set = useCallback((c: ColorBy) => {
    colorBy = c;
    try {
      window.localStorage.setItem(COLOR_KEY, c);
    } catch {
      /* a preference only */
    }
    colorListeners.forEach((l) => l());
  }, []);
  return [value, set];
}

// ---- the key window: one small browser window with a fixed name, so there is never more than one

/** Opening a window with this name again reuses the one that is open. */
const WINDOW_NAME = "schedulizer-color-key";

interface Snapshot {
  info: KeyInfo | undefined;
  /** Where the key is drawn: a node in the pop-up's document; undefined while no pop-up is open. */
  container: HTMLElement | undefined;
}
let snapshot: Snapshot = { info: undefined, container: undefined };
let popup: Window | null = null;
const listeners = new Set<() => void>();
const publish = (next: Partial<Snapshot>) => {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
};

/** Say what the key should show now (undefined: nothing to show, as when no week view is open). */
export const setColorKey = (info: KeyInfo | undefined) => publish({ info });

const POPUP_CSS = `
  :root { --bg: #fff; --fg: #1c2024; --muted: #667085; --line: #d9dde3; --bl: 86%; --bb: 68%; --bl0: 91%; --lstep: -9%; color-scheme: light dark; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #14171a; --fg: #e8eaed; --muted: #9aa3ad; --line: #2e343b; --bl: 28%; --bb: 45%; --bl0: 22%; --lstep: 8%; } }
  :root[data-theme="dark"] { --bg: #14171a; --fg: #e8eaed; --muted: #9aa3ad; --line: #2e343b; --bl: 28%; --bb: 45%; --bl0: 22%; --lstep: 8%; }
  body { margin: 0; padding: 10px 12px; background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
  h1 { font-size: 1rem; margin: 0 0 8px; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
  .sw { flex: none; width: 22px; height: 14px; border-radius: 3px; background: hsl(var(--hue) var(--sat) calc(var(--bl0) + var(--tone, 0) * var(--lstep))); border: 1px solid hsl(var(--hue) var(--bsat) calc(var(--bb) + var(--tone, 0) * var(--lstep))); }
  .muted { color: var(--muted); }
  .sw.none { background: repeating-linear-gradient(135deg, hsl(0 0% var(--bl)) 0 4px, hsl(0 0% calc(var(--bl) - 10%)) 4px 6px); border-color: hsl(0 0% var(--bb)); }
`;

/**
 * Open the key window, or bring the one that is open to the front (it may have drifted behind other windows).
 * Returns false when the browser blocked the pop-up.
 */
export function openColorKey(): boolean {
  const w = window.open("", WINDOW_NAME, "popup=yes,width=300,height=420,left=80,top=80");
  if (!w) return false;
  if (w !== popup || !snapshot.container || !w.document.body.contains(snapshot.container)) {
    // A new window, or one left from before this page was reloaded: set it up afresh.
    const doc = w.document;
    doc.title = "Color key";
    doc.head.innerHTML = `<meta charset="utf-8"><style>${POPUP_CSS}</style>`;
    const theme = document.documentElement.getAttribute("data-theme");
    if (theme) doc.documentElement.setAttribute("data-theme", theme);
    doc.body.innerHTML = "";
    const container = doc.createElement("div");
    doc.body.append(container);
    popup = w;
    w.addEventListener("pagehide", () => {
      if (popup === w) {
        popup = null;
        publish({ container: undefined });
      }
    });
    publish({ container });
  }
  w.focus();
  return true;
}

// The key window goes when this page does.
if (typeof window !== "undefined") window.addEventListener("pagehide", () => popup?.close());

/** Draws the key into the pop-up whenever it is open. Mount once, near the top of the app. */
export function ColorKeyWindow() {
  const { info, container } = useSyncExternalStore((l) => (listeners.add(l), () => void listeners.delete(l)), () => snapshot);
  if (!container) return null;
  return createPortal(
    info ? (
      <>
        <h1>{info.title}</h1>
        {info.entries.length === 0 ? (
          <p className="muted">Nothing is shown in this view.</p>
        ) : (
          <ul>
            {info.entries.map((e) => (
              <li key={e.label}>
                <span className={`sw${e.hue === undefined ? " none" : ""}`} style={{ ["--hue" as string]: e.hue ?? 0, ["--tone" as string]: e.tone ?? 0, ["--sat" as string]: e.hue === undefined ? "0%" : "60%", ["--bsat" as string]: e.hue === undefined ? "0%" : "45%" }} />
                <span className={e.hue === undefined ? "muted" : ""}>{e.label}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    ) : (
      <p className="muted">Open a week view (Dept week, Faculty week or Room week) to see its colors here.</p>
    ),
    container,
  );
}
