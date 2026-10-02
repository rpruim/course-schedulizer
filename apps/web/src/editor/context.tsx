import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { newNonTeachingDraft, newSectionDraft, nonTeachingToDraft, sectionToDraft, emptySchedule, type NonTeachingDraft, type SectionDraft } from "@schedulizer/core";
import { useWorkspace } from "../state";
import { NonTeachingEditor } from "./NonTeachingEditor";
import { SectionEditor } from "./SectionEditor";

interface EditorApi {
  /** Open an existing section for editing, in the schedule it belongs to (default: the current one). */
  openSection(sectionId: string, scheduleId?: string): void;
  /** Open a new section in a schedule (default: the current one), with whatever the caller knows filled in. */
  openNew(defaults?: Partial<SectionDraft>, scheduleId?: string): void;
  /** Open a non-teaching load row for editing (by its position), or a new one when no index is given. */
  openNonTeaching(index?: number, defaults?: Partial<NonTeachingDraft>, scheduleId?: string): void;
}

const Ctx = createContext<EditorApi | undefined>(undefined);
const EMPTY = emptySchedule();

export function EditorProvider({ children, onNotice }: { children: ReactNode; onNotice: (message: string) => void }) {
  const ws = useWorkspace();
  const [active, setActive] = useState<{ draft: SectionDraft; scheduleId: string | undefined; key: number } | undefined>();
  const [activeNt, setActiveNt] = useState<{ draft: NonTeachingDraft; index: number | undefined; scheduleId: string | undefined; key: number } | undefined>();

  /** The schedule an action targets: the one asked for, else the current one (there may be none yet). */
  const target = useCallback((scheduleId?: string) => (scheduleId && ws.get(scheduleId) ? scheduleId : ws.current?.id), [ws]);

  const openSection = useCallback(
    (id: string, scheduleId?: string) => {
      const sid = target(scheduleId);
      const draft = sid ? sectionToDraft(ws.get(sid)!.schedule, id) : undefined;
      if (draft) setActive((a) => ({ draft, scheduleId: sid, key: (a?.key ?? 0) + 1 }));
    },
    [ws, target],
  );
  const openNew = useCallback(
    (defaults: Partial<SectionDraft> = {}, scheduleId?: string) => {
      const sid = target(scheduleId);
      const draft = newSectionDraft(sid ? ws.get(sid)!.schedule : EMPTY, defaults);
      setActive((a) => ({ draft, scheduleId: sid, key: (a?.key ?? 0) + 1 }));
    },
    [ws, target],
  );
  const openNonTeaching = useCallback(
    (index?: number, defaults: Partial<NonTeachingDraft> = {}, scheduleId?: string) => {
      const sid = target(scheduleId);
      const schedule = sid ? ws.get(sid)!.schedule : EMPTY;
      const draft = index === undefined ? newNonTeachingDraft(schedule, defaults) : nonTeachingToDraft(schedule, index);
      if (draft) setActiveNt((a) => ({ draft, index, scheduleId: sid, key: (a?.key ?? 0) + 1 }));
    },
    [ws, target],
  );
  const api = useMemo(() => ({ openSection, openNew, openNonTeaching }), [openSection, openNew, openNonTeaching]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {active && (
        <SectionEditor
          key={active.key}
          scheduleId={active.scheduleId}
          initial={active.draft}
          onClose={() => setActive(undefined)}
          onNotice={onNotice}
          onCopy={(draft) => setActive((a) => (a ? { ...a, draft, key: a.key + 1 } : a))}
        />
      )}
      {activeNt && <NonTeachingEditor key={activeNt.key} scheduleId={activeNt.scheduleId} initial={activeNt.draft} index={activeNt.index} onClose={() => setActiveNt(undefined)} onNotice={onNotice} />}
    </Ctx.Provider>
  );
}

export function useEditor(): EditorApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useEditor must be used inside <EditorProvider>");
  return api;
}
