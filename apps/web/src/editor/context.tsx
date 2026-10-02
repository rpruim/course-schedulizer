import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { newNonTeachingDraft, newSectionDraft, nonTeachingToDraft, sectionToDraft, type NonTeachingDraft, type SectionDraft } from "@schedulizer/core";
import { useSchedule } from "../state";
import { NonTeachingEditor } from "./NonTeachingEditor";
import { SectionEditor } from "./SectionEditor";

interface EditorApi {
  /** Open an existing section for editing. */
  openSection(sectionId: string): void;
  /** Open a new section, with whatever the caller knows (year, term, course…) filled in. */
  openNew(defaults?: Partial<SectionDraft>): void;
  /** Open a non-teaching load row for editing (by its position), or a new one when no index is given. */
  openNonTeaching(index?: number, defaults?: Partial<NonTeachingDraft>): void;
}

const Ctx = createContext<EditorApi | undefined>(undefined);

export function EditorProvider({ children, onNotice }: { children: ReactNode; onNotice: (message: string) => void }) {
  const { schedule } = useSchedule();
  const [active, setActive] = useState<{ draft: SectionDraft; key: number } | undefined>();
  const [activeNt, setActiveNt] = useState<{ draft: NonTeachingDraft; index: number | undefined; key: number } | undefined>();

  const openSection = useCallback(
    (id: string) => {
      const draft = sectionToDraft(schedule, id);
      if (draft) setActive((a) => ({ draft, key: (a?.key ?? 0) + 1 }));
    },
    [schedule],
  );
  const openNew = useCallback(
    (defaults: Partial<SectionDraft> = {}) => setActive((a) => ({ draft: newSectionDraft(schedule, defaults), key: (a?.key ?? 0) + 1 })),
    [schedule],
  );
  const openNonTeaching = useCallback(
    (index?: number, defaults: Partial<NonTeachingDraft> = {}) => {
      const draft = index === undefined ? newNonTeachingDraft(schedule, defaults) : nonTeachingToDraft(schedule, index);
      if (draft) setActiveNt((a) => ({ draft, index, key: (a?.key ?? 0) + 1 }));
    },
    [schedule],
  );
  const api = useMemo(() => ({ openSection, openNew, openNonTeaching }), [openSection, openNew, openNonTeaching]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {active && (
        <SectionEditor
          key={active.key}
          initial={active.draft}
          onClose={() => setActive(undefined)}
          onNotice={onNotice}
          onCopy={(draft) => setActive((a) => ({ draft, key: (a?.key ?? 0) + 1 }))}
        />
      )}
      {activeNt && <NonTeachingEditor key={activeNt.key} initial={activeNt.draft} index={activeNt.index} onClose={() => setActiveNt(undefined)} onNotice={onNotice} />}
    </Ctx.Provider>
  );
}

export function useEditor(): EditorApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useEditor must be used inside <EditorProvider>");
  return api;
}
