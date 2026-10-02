import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { emptySchedule, type Schedule } from "@schedulizer/core";
import { LocalStore, type ScheduleStore } from "./store";

const MAX_HISTORY = 100;

interface State {
  past: Schedule[];
  present: Schedule;
  future: Schedule[];
  fileName: string;
}

type Action =
  | { type: "replace"; schedule: Schedule; fileName: string }
  | { type: "apply"; fn: (s: Schedule) => Schedule }
  | { type: "undo" }
  | { type: "redo" };

/** Pure: exported for tests. Edits are `(Schedule) → Schedule`, so history is a stack of values. */
export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "replace":
      return { past: [], present: action.schedule, future: [], fileName: action.fileName };
    case "apply": {
      const next = action.fn(state.present);
      if (next === state.present) return state;
      return { ...state, past: [...state.past, state.present].slice(-MAX_HISTORY), present: next, future: [] };
    }
    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return { ...state, past: state.past.slice(0, -1), present: prev, future: [state.present, ...state.future] };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return { ...state, past: [...state.past, state.present], present: next, future: state.future.slice(1) };
    }
  }
}

export const initialState = (): State => ({ past: [], present: emptySchedule(), future: [], fileName: "" });

interface Api {
  schedule: Schedule;
  fileName: string;
  canUndo: boolean;
  canRedo: boolean;
  /** Replace the whole schedule (opening a file); clears history. */
  replace(schedule: Schedule, fileName: string): void;
  /** Apply an edit; undoable. */
  apply(fn: (s: Schedule) => Schedule): void;
  undo(): void;
  redo(): void;
  /** Set when the browser refused to store the working copy (e.g. storage full or disabled). */
  saveError: string;
}

const Ctx = createContext<Api | undefined>(undefined);
const CURRENT = "current";

export function ScheduleProvider({ children, store }: { children: ReactNode; store?: ScheduleStore }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [saveError, setSaveError] = useState("");
  const backing = useMemo(() => store ?? new LocalStore(window.localStorage), [store]);
  const loaded = useRef(false);

  // Restore the working copy once, then autosave every change. Never save before the restore finishes.
  useEffect(() => {
    let live = true;
    backing
      .load(CURRENT)
      .then((rec) => {
        if (!live) return;
        if (rec) {
          dispatch({ type: "replace", schedule: rec.schedule, fileName: rec.name === CURRENT ? "" : rec.name });
        }
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
        .save(CURRENT, { ...state.present, meta: { ...state.present.meta, name: state.fileName || state.present.meta.name } })
        .then(() => setSaveError(""))
        .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)));
    }, 400);
    return () => clearTimeout(t);
  }, [backing, state.present, state.fileName]);

  const replace = useCallback((schedule: Schedule, fileName: string) => dispatch({ type: "replace", schedule, fileName }), []);
  const apply = useCallback((fn: (s: Schedule) => Schedule) => dispatch({ type: "apply", fn }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  const api: Api = {
    schedule: state.present,
    fileName: state.fileName,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    replace,
    apply,
    undo,
    redo,
    saveError,
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSchedule(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error("useSchedule must be used inside <ScheduleProvider>");
  return api;
}
