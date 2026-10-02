import { formatNumber, type DraftError, type NonTeachingDraft } from "@schedulizer/core";

/** The non-teaching dialog's inputs, as strings. */
export interface NtForm {
  academicYear: string;
  faculty: string;
  activity: string;
  term: string;
  load: string;
  comment: string;
  extra: Record<string, string>;
}

export const draftToNtForm = (d: NonTeachingDraft): NtForm => ({
  academicYear: d.academicYear,
  faculty: d.faculty,
  activity: d.activity,
  term: d.term,
  load: formatNumber(d.load),
  comment: d.comment,
  extra: { ...d.extra },
});

/** The form as a draft, plus a problem if the load is not a number (everything else is the core's `validateNonTeaching`). */
export function ntFormToDraft(f: NtForm): { draft: NonTeachingDraft; errors: DraftError[] } {
  const errors: DraftError[] = [];
  let load: number | undefined;
  if (f.load.trim() !== "") {
    const n = Number(f.load);
    if (Number.isFinite(n)) load = n;
    else errors.push({ field: "load", message: "Load is not a number" });
  }
  return {
    draft: {
      academicYear: f.academicYear,
      faculty: f.faculty,
      activity: f.activity,
      term: f.term,
      ...(load !== undefined ? { load } : {}),
      comment: f.comment,
      extra: { ...f.extra },
    },
    errors,
  };
}
