import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { emptySchedule, mergeSchedules, type MergeOrigin, type Schedule } from "@schedulizer/core";
import type { OneDriveSource } from "./onedrive/graph";
import { LocalWorkspaceStore, type WorkspaceEntry, type WorkspaceSnapshot, type WorkspaceStore } from "./store";

const MAX_HISTORY = 100;

export type Entry = WorkspaceEntry;

/** How the views show several schedules: laid over one another as one, or each on its own. */
export type ViewAs = "merged" | "separate";
/** Id of the stand-in entry that stands for several merged schedules. */
export const MERGED_ID = "merged";
const VIEW_AS_KEY = "schedulizer:viewAs";

function loadViewAs(): ViewAs {
  try {
    return window.localStorage.getItem(VIEW_AS_KEY) === "separate" ? "separate" : "merged";
  } catch {
    return "merged";
  }
}

/**
 * The workspace: schedules that are open side by side. History is a stack of
 * snapshots of the list of schedules, so adding, replacing, renaming, removing and
 * editing are all undoable in one stroke; which schedule is current and which are
 * included in the views is not part of history.
 */
export interface State {
  past: Entry[][];
  present: Entry[];
  future: Entry[][];
  currentId: string;
  included: string[];
}

export type Action =
  | { type: "load"; snapshot: WorkspaceSnapshot }
  | { type: "add"; entry: Entry }
  | { type: "replace"; id: string; name: string; schedule: Schedule; source?: OneDriveSource }
  | { type: "setSource"; id: string; source: OneDriveSource | undefined }
  | { type: "remove"; id: string }
  | { type: "rename"; id: string; name: string }
  | { type: "edit"; id: string; fn: (s: Schedule) => Schedule }
  | { type: "move"; id: string; before: string | undefined }
  | { type: "setCurrent"; id: string }
  | { type: "setIncluded"; ids: string[] }
  | { type: "undo" }
  | { type: "redo" };

export const initialState = (): State => ({ past: [], present: [], future: [], currentId: "", included: [] });

const withSource = (entry: Entry, source: OneDriveSource | undefined): Entry => {
  const { source: _old, ...rest } = entry;
  return source ? { ...rest, source } : rest;
};

const cleanName = (name: string) => name.trim() || "Schedule";

/**
 * Entries as the views show them: a schedule is shown under its nickname when it has one, else its file name; when
 * several are shown under the same name (case-insensitively), each gets a number in workspace order —
 * `My Schedule (1)`, `My Schedule (2)` — so they can be told apart. A name used once is left as it is.
 */
export function displayEntries(entries: Entry[]): Entry[] {
  const shown = entries.map((e) => {
    const nick = e.schedule.meta.nickname?.trim();
    return nick ? { ...e, name: nick } : e;
  });
  const total = new Map<string, number>();
  for (const e of shown) total.set(e.name.toLowerCase(), (total.get(e.name.toLowerCase()) ?? 0) + 1);
  const seen = new Map<string, number>();
  return shown.map((e) => {
    const key = e.name.toLowerCase();
    if ((total.get(key) ?? 0) < 2) return e;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return { ...e, name: `${e.name} (${n})` };
  });
}

/** Make `currentId` and `included` refer to schedules that exist. */
function sanitize(s: State): State {
  const ids = new Set(s.present.map((e) => e.id));
  const currentId = ids.has(s.currentId) ? s.currentId : (s.present[0]?.id ?? "");
  // `included` always follows workspace order.
  const included = s.present.map((e) => e.id).filter((id) => s.included.includes(id));
  const same = included.length === s.included.length && included.every((id, i) => id === s.included[i]);
  return currentId === s.currentId && same ? s : { ...s, currentId, included };
}

const change = (state: State, present: Entry[]): State =>
  present === state.present ? state : sanitize({ ...state, past: [...state.past, state.present].slice(-MAX_HISTORY), present, future: [] });

/** Pure: exported for tests. */
export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "load":
      return sanitize({ past: [], present: action.snapshot.entries, future: [], currentId: action.snapshot.currentId, included: action.snapshot.included });
    case "add": {
      const entry = { ...action.entry, name: cleanName(action.entry.name) };
      const next = change(state, [...state.present, entry]);
      return { ...next, currentId: entry.id, included: [...state.included, entry.id] };
    }
    case "replace": {
      if (!state.present.some((e) => e.id === action.id)) return state;
      // New contents come from wherever they came from: a file opened over a schedule is no longer the OneDrive file it was.
      const next = change(state, state.present.map((e) => (e.id === action.id ? withSource({ ...e, name: cleanName(action.name), schedule: action.schedule }, action.source) : e)));
      return state.included.includes(action.id) ? next : sanitize({ ...next, included: [...state.included, action.id] });
    }
    case "setSource": {
      // Remembering where a schedule is saved is bookkeeping, not an edit: not in the undo history.
      if (!state.present.some((e) => e.id === action.id)) return state;
      return { ...state, present: state.present.map((e) => (e.id === action.id ? withSource(e, action.source) : e)) };
    }
    case "remove":
      return change(state, state.present.filter((e) => e.id !== action.id));
    case "rename":
      return change(state, state.present.map((e) => (e.id === action.id ? { ...e, name: cleanName(action.name) } : e)));
    case "edit": {
      const target = state.present.find((e) => e.id === action.id);
      if (!target) return state;
      const schedule = action.fn(target.schedule);
      return schedule === target.schedule ? state : change(state, state.present.map((e) => (e.id === action.id ? { ...e, schedule } : e)));
    }
    case "move": {
      // Put a schedule just before another one (undefined: last). Views and `included` follow workspace order.
      const moving = state.present.find((e) => e.id === action.id);
      if (!moving || action.before === action.id) return state;
      const rest = state.present.filter((e) => e.id !== action.id);
      const at = action.before === undefined ? rest.length : rest.findIndex((e) => e.id === action.before);
      if (at < 0) return state;
      const next = [...rest.slice(0, at), moving, ...rest.slice(at)];
      return next.every((e, i) => e === state.present[i]) ? state : change(state, next);
    }
    case "setCurrent":
      return state.present.some((e) => e.id === action.id) ? { ...state, currentId: action.id } : state;
    case "setIncluded":
      return { ...state, included: state.present.map((e) => e.id).filter((id) => action.ids.includes(id)) };
    case "undo":
    case "redo": {
      const from = action.type === "undo" ? state.past : state.future;
      const target = from[action.type === "undo" ? from.length - 1 : 0];
      if (!target) return state;
      const rest = action.type === "undo" ? from.slice(0, -1) : from.slice(1);
      const before = new Set(state.present.map((e) => e.id));
      // A schedule brought back by undo/redo comes back included, so the user sees what changed.
      const returned = target.map((e) => e.id).filter((id) => !before.has(id));
      const next: State =
        action.type === "undo"
          ? { ...state, past: rest, present: target, future: [state.present, ...state.future] }
          : { ...state, past: [...state.past, state.present], present: target, future: rest };
      return sanitize({ ...next, included: [...state.included, ...returned] });
    }
  }
}

export interface Workspace {
  /** Every open schedule; `name` is the nickname when the schedule has one, else the file name. */
  entries: Entry[];
  /** The stored file name of a schedule (what `name` is when there is no nickname). */
  fileNameOf(id: string): string;
  currentId: string;
  /** Ids of the schedules shown in the views. */
  included: string[];
  /** The schedules shown in the views, in workspace order. */
  includedEntries: Entry[];
  /** Several included schedules are shown merged into one, or each on its own. */
  viewAs: ViewAs;
  setViewAs(v: ViewAs): void;
  /**
   * What every view but Compare shows: the included schedules, or when several are included
   * and `viewAs` is "merged", one stand-in entry (id `MERGED_ID`) holding all of them.
   */
  viewEntries: Entry[];
  /** For the merged entry: where its sections and non-teaching rows came from. */
  mergedOrigin: MergeOrigin | undefined;
  current: Entry | undefined;
  get(id: string): Entry | undefined;
  canUndo: boolean;
  canRedo: boolean;
  undo(): void;
  redo(): void;
  /** Open a schedule as a new one; it becomes current and is included. Returns its id. */
  addSchedule(name: string, schedule: Schedule, source?: OneDriveSource): string;
  /** Replace a schedule's contents (opening a file over it). */
  replaceSchedule(id: string, name: string, schedule: Schedule, source?: OneDriveSource): void;
  /** Note (or forget, with undefined) the OneDrive file a schedule is saved in. */
  setSource(id: string, source: OneDriveSource | undefined): void;
  removeSchedule(id: string): void;
  renameSchedule(id: string, name: string): void;
  /** Edit one schedule; undoable. */
  applyTo(id: string, fn: (s: Schedule) => Schedule): void;
  /** Put a schedule just before another one, or last when `before` is undefined; undoable. */
  moveSchedule(id: string, before: string | undefined): void;
  setCurrent(id: string): void;
  setIncluded(ids: string[]): void;
  toggleIncluded(id: string): void;
  /** False until the saved workspace has been read back (so "no schedules" is not yet known to be true). */
  restored: boolean;
  /** Set when the browser refused to store the working copy (e.g. storage full or disabled). */
  saveError: string;
}

const Ctx = createContext<Workspace | undefined>(undefined);

let counter = 0;
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s${Date.now().toString(36)}${(counter++).toString(36)}`);

export function WorkspaceProvider({ children, store }: { children: ReactNode; store?: WorkspaceStore }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [saveError, setSaveError] = useState("");
  const backing = useMemo(() => store ?? new LocalWorkspaceStore(window.localStorage), [store]);
  const loaded = useRef(false);
  const [restored, setRestored] = useState(false);
  const [viewAs, setViewAsState] = useState<ViewAs>(loadViewAs);
  const setViewAs = useCallback((v: ViewAs) => {
    setViewAsState(v);
    try {
      window.localStorage.setItem(VIEW_AS_KEY, v);
    } catch {
      /* a preference only */
    }
  }, []);

  // Restore the workspace once, then autosave every change. Never save before the restore finishes.
  useEffect(() => {
    let live = true;
    backing
      .load()
      .then((rec) => {
        if (live && rec) dispatch({ type: "load", snapshot: rec });
      })
      .catch(() => undefined)
      .finally(() => {
        loaded.current = true;
        if (live) setRestored(true);
      });
    return () => {
      live = false;
    };
  }, [backing]);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      backing
        .save({ entries: state.present, currentId: state.currentId, included: state.included })
        .then(() => setSaveError(""))
        .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)));
    }, 400);
    return () => clearTimeout(t);
  }, [backing, state.present, state.currentId, state.included]);

  const addSchedule = useCallback((name: string, schedule: Schedule, source?: OneDriveSource) => {
    const id = newId();
    dispatch({ type: "add", entry: { id, name, schedule, ...(source ? { source } : {}) } });
    return id;
  }, []);

  const api: Workspace = useMemo(() => {
    // Views see a schedule under its nickname when it has one, else its file name; same names get numbers.
    const entries = displayEntries(state.present);
    const byId = (id: string) => entries.find((e) => e.id === id);
    const includedEntries = entries.filter((e) => state.included.includes(e.id));
    const merged = viewAs === "merged" && includedEntries.length > 1 ? mergeSchedules(includedEntries) : undefined;
    return {
      entries,
      fileNameOf: (id) => state.present.find((e) => e.id === id)?.name ?? "",
      currentId: state.currentId,
      included: state.included,
      includedEntries,
      viewAs,
      setViewAs,
      viewEntries: merged ? [{ id: MERGED_ID, name: merged.schedule.meta.name, schedule: merged.schedule }] : includedEntries,
      mergedOrigin: merged?.origin,
      current: byId(state.currentId),
      get: byId,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
      addSchedule,
      replaceSchedule: (id, name, schedule, source) => dispatch({ type: "replace", id, name, schedule, ...(source ? { source } : {}) }),
      setSource: (id, source) => dispatch({ type: "setSource", id, source }),
      removeSchedule: (id) => dispatch({ type: "remove", id }),
      renameSchedule: (id, name) => dispatch({ type: "rename", id, name }),
      applyTo: (id, fn) => dispatch({ type: "edit", id, fn }),
      moveSchedule: (id, before) => dispatch({ type: "move", id, before }),
      setCurrent: (id) => dispatch({ type: "setCurrent", id }),
      setIncluded: (ids) => dispatch({ type: "setIncluded", ids }),
      toggleIncluded: (id) => dispatch({ type: "setIncluded", ids: state.included.includes(id) ? state.included.filter((x) => x !== id) : [...state.included, id] }),
      restored,
      saveError,
    };
  }, [state, addSchedule, saveError, restored, viewAs, setViewAs]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useWorkspace(): Workspace {
  const api = useContext(Ctx);
  if (!api) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return api;
}

const EMPTY = emptySchedule();

/** The current schedule on its own, for components that only ever work on that one (Add, Re-letter, Export). */
export function useSchedule() {
  const ws = useWorkspace();
  return {
    schedule: ws.current?.schedule ?? EMPTY,
    name: ws.current?.name ?? "",
    hasCurrent: !!ws.current,
    apply: (fn: (s: Schedule) => Schedule) => ws.current && ws.applyTo(ws.current.id, fn),
  };
}
