import { normCourse } from "@schedulizer/core";
import { Trash } from "../icons";

/** A group of students of a cohort planning rule, as typed. */
export interface ElementForm {
  students: string;
  courses: string[];
}
/** The seats in each section of a course, as typed. */
export interface CapacityForm {
  course: string;
  seats: string;
}

/**
 * The two parts of a cohort planning rule in the rule editor: the groups of students with the courses each must be able to take, and
 * the seats in each section of every course the groups use. Seats given for a course that no group uses any more are kept (and come
 * back if the course does).
 */
export function CohortFields({ elements, capacities, onElements, onCapacities, problems, attempted }: {
  elements: ElementForm[];
  capacities: CapacityForm[];
  onElements: (v: ElementForm[]) => void;
  onCapacities: (v: CapacityForm[]) => void;
  problems: { field: string; message: string }[];
  attempted: boolean;
}) {
  const has = (field: string) => problems.filter((p) => p.field === field || p.field.startsWith(`${field}.`));
  const err = (field: string) => (attempted ? has(field).map((p, i) => <span key={i} className="err">{p.message}</span>) : null);
  const setElement = (i: number, patch: Partial<ElementForm>) => onElements(elements.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const usedCourses: string[] = [];
  const seen = new Set<string>();
  for (const e of elements) for (const c of e.courses) if (c.trim() && !seen.has(normCourse(c))) { seen.add(normCourse(c)); usedCourses.push(c.trim()); }
  const seatsOf = (course: string) => capacities.find((c) => normCourse(c.course) === normCourse(course))?.seats ?? "";
  const setSeats = (course: string, seats: string) => {
    const at = capacities.findIndex((c) => normCourse(c.course) === normCourse(course));
    onCapacities(at >= 0 ? capacities.map((c, j) => (j === at ? { ...c, seats } : c)) : [...capacities, { course, seats }]);
  };

  return (
    <>
      <fieldset>
        <legend>Groups of students</legend>
        <p className="muted small">Each group is a number of students who must be able to take all of a list of courses, one section of each, with no two overlapping in time. The rule is met when all the students of all the groups can be seated at once.</p>
        {elements.map((e, i) => (
          <div className="cohort-element" key={i}>
            <div className="cohort-head">
              <input value={e.students} size={4} inputMode="numeric" aria-label="Number of students" onChange={(ev) => setElement(i, { students: ev.target.value })} aria-invalid={attempted && has(`elements.${i}`).length > 0 ? true : undefined} />
              <span className="cohort-must">students must be able to take all of the following courses:</span>
              <button type="button" className="link icon-only" title="Remove this group" aria-label="Remove this group" onClick={() => onElements(elements.filter((_, j) => j !== i))} disabled={elements.length <= 1}><Trash /></button>
            </div>
            <div className="cohort-courses">
              {e.courses.map((c, k) => (
                <span className="cohort-course" key={k}>
                  <input value={c} size={10} list="rule-courses" placeholder="MATH 161" aria-label="Course" onChange={(ev) => setElement(i, { courses: e.courses.map((x, m) => (m === k ? ev.target.value : x)) })} />
                  <button type="button" className="link icon-only" title="Remove this course" aria-label="Remove this course" onClick={() => setElement(i, { courses: e.courses.filter((_, m) => m !== k) })} disabled={e.courses.length <= 1}><Trash /></button>
                </span>
              ))}
              <button type="button" onClick={() => setElement(i, { courses: [...e.courses, ""] })}>+ Add course</button>
            </div>
            {err(`elements.${i}`)}
          </div>
        ))}
        <button type="button" onClick={() => onElements([...elements, { students: "", courses: [""] }])}>+ Add group of students</button>
        {attempted ? has("elements").filter((p) => p.field === "elements").map((p, i) => <span key={i} className="err">{p.message}</span>) : null}
      </fieldset>
      <fieldset>
        <legend>Seats in each section</legend>
        <p className="muted small">Every section of a course is taken to have this many seats. Provide them for every course mentioned in the rule. A course you take out of every group keeps the seats you gave it, in case you put it back.</p>
        <p className="muted small">Courses that are colocated (same instructor) share their seats: mention only one of them in the rule, and give the number of students across the whole set of colocated courses.</p>
        {usedCourses.length === 0 ? <p className="muted small">The courses of the groups above will be listed here.</p> : (
          <table className="seats-table">
            <thead><tr><th>Course</th><th>Seats per section</th></tr></thead>
            <tbody>
              {usedCourses.map((c) => (
                <tr key={normCourse(c)}>
                  <td className="seat-course">{c}</td>
                  <td><input value={seatsOf(c)} size={5} inputMode="numeric" aria-label={`Seats in each section of ${c}`} onChange={(ev) => setSeats(c, ev.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </fieldset>
    </>
  );
}
