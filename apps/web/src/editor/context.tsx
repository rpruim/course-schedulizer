import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { newSectionDraft, sectionToDraft, type SectionDraft } from "@schedulizer/core";
import { useSchedule } from "../state";
import { SectionEditor } from "./SectionEditor";

interface EditorApi {
  /** Open an existing section for editing. */
  openSection(sectionId: string): void;
  /** Open a new section, with whatever the caller knows (year, term, course…) filled in. */
  openNew(defaults?: Partial<SectionDraft>): void;
}

const Ctx = createContext<EditorApi | undefined>(undefined);

export function EditorProvider({ children, onNotice }: { children: ReactNode; onNotice: (message: string) => void }) {
  const { schedule } = useSchedule();
  const [active, setActive] = useState<{ draft: SectionDraft; key: number } | undefined>();

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
  const api = useMemo(() => ({ openSection, openNew }), [openSection, openNew]);

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
    </Ctx.Provider>
  );
}

export function useEditor(): EditorApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useEditor must be used inside <EditorProvider>");
  return api;
}
