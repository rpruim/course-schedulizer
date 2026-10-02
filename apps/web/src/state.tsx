import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { emptySchedule, type Schedule } from "@schedulizer/core";
import { LocalWorkspaceStore, type WorkspaceEntry, type WorkspaceSnapshot, type WorkspaceStore } from "./store";

const MAX_HISTORY = 100;

export type Entry = WorkspaceEntry;

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
  | { type: "replace"; id: string; name: string; schedule: Schedule }
  | { type: "remove"; id: string }
  | { type: "rename"; id: string; name: string }
  | { type: "edit"; id: string; fn: (s: Schedule) => Schedule }
  | { type: "setCurrent"; id: string }
  | { type: "setIncluded"; ids: string[] }
  | { type: "undo" }
  | { type: "redo" };

export const initialState = (): State => ({ past: [], present: [], future: [], currentId: "", included: [] });

/** `base`, or `base (2)`, `base (3)`, … — the first name no other schedule uses (case-insensitively). */
export function uniqueName(entries: Entry[], base: string, exceptId?: string): string {
  const clean = base.trim() || "Schedule";
  const taken = new Set(entries.filter((e) => e.id !== exceptId).map((e) => e.name.toLowerCase()));
  if (!taken.has(clean.toLowerCase())) return clean;
  for (let n = 2; ; n++) if (!taken.has(`${clean} (${n})`.toLowerCase())) return `${clean} (${n})`;
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
      const entry = { ...action.entry, name: uniqueName(state.present, action.entry.name) };
      const next = change(state, [...state.present, entry]);
      return { ...next, currentId: entry.id, included: [...state.included, entry.id] };
    }
    case "replace": {
      if (!state.present.some((e) => e.id === action.id)) return state;
      const next = change(state, state.present.map((e) => (e.id === action.id ? { ...e, name: uniqueName(state.present, action.name, e.id), schedule: action.schedule } : e)));
      return state.included.includes(action.id) ? next : sanitize({ ...next, included: [...state.included, action.id] });
    }
    case "remove":
      return change(state, state.present.filter((e) => e.id !== action.id));
    case "rename":
      return change(state, state.present.map((e) => (e.id === action.id ? { ...e, name: uniqueName(state.present, action.name, e.id) } : e)));
    case "edit": {
      const target = state.present.find((e) => e.id === action.id);
      if (!target) return state;
      const schedule = action.fn(target.schedule);
      return schedule === target.schedule ? state : change(state, state.present.map((e) => (e.id === action.id ? { ...e, schedule } : e)));
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
  entries: Entry[];
  currentId: string;
  /** Ids of the schedules shown in the views. */
  included: string[];
  /** The schedules shown in the views, in workspace order. */
  includedEntries: Entry[];
  current: Entry | undefined;
  get(id: string): Entry | undefined;
  canUndo: boolean;
  canRedo: boolean;
  undo(): void;
  redo(): void;
  /** Open a schedule as a new one; it becomes current and is included. Returns its id. */
  addSchedule(name: string, schedule: Schedule): string;
  /** Replace a schedule's contents (opening a file over it). */
  replaceSchedule(id: string, name: string, schedule: Schedule): void;
  removeSchedule(id: string): void;
  renameSchedule(id: string, name: string): void;
  /** Edit one schedule; undoable. */
  applyTo(id: string, fn: (s: Schedule) => Schedule): void;
  setCurrent(id: string): void;
  setIncluded(ids: string[]): void;
  toggleIncluded(id: string): void;
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

  const addSchedule = useCallback((name: string, schedule: Schedule) => {
    const id = newId();
    dispatch({ type: "add", entry: { id, name, schedule } });
    return id;
  }, []);

  const api: Workspace = useMemo(() => {
    const byId = (id: string) => state.present.find((e) => e.id === id);
    return {
      entries: state.present,
      currentId: state.currentId,
      included: state.included,
      includedEntries: state.present.filter((e) => state.included.includes(e.id)),
      current: byId(state.currentId),
      get: byId,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
      addSchedule,
      replaceSchedule: (id, name, schedule) => dispatch({ type: "replace", id, name, schedule }),
      removeSchedule: (id) => dispatch({ type: "remove", id }),
      renameSchedule: (id, name) => dispatch({ type: "rename", id, name }),
      applyTo: (id, fn) => dispatch({ type: "edit", id, fn }),
      setCurrent: (id) => dispatch({ type: "setCurrent", id }),
      setIncluded: (ids) => dispatch({ type: "setIncluded", ids }),
      toggleIncluded: (id) => dispatch({ type: "setIncluded", ids: state.included.includes(id) ? state.included.filter((x) => x !== id) : [...state.included, id] }),
      saveError,
    };
  }, [state, addSchedule, saveError]);

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
