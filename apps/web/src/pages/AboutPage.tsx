import { Link } from "react-router-dom";
import { APP_VERSION, BUILD_DATE } from "../version";

/** The student teams that built the earlier versions, as listed on the original Course Schedulizer's About page. */
const TEAMS: { year: string; students: string[] }[] = [
  { year: "2024", students: ["Noelle Haviland", "Yuese Li", "Edom Maru"] },
  { year: "2023", students: ["ZeAi Sun", "Faeren Madza"] },
  { year: "2022", students: ["John White", "Samuel Haileselassie", "Sharon Velpula", "Fitsum Maru"] },
  { year: "2021", students: ["David Sen", "Ryan Vreeke"] },
  { year: "2020", students: ["Jonathan Ellis", "Bryant George", "Charles Kornoelje"] },
];

const REPORTS: { label: string; href: string }[] = [
  { label: "Final report, April 2025", href: "https://calvincollege-my.sharepoint.com/:w:/g/personal/eam43_calvin_edu/EdiWjkO979tEggEuDAll8GsBKW7iTIgMcMRmjVwpDXYFCA?e=oZrgyb" },
  { label: "2024 project proposal, October 2024", href: "https://docs.google.com/document/d/e/2PACX-1vS3Tn3OXVt5XVv9jBAjcJO81BWtXvZreZDOkvkH5WCU7oUyhlqe2EWZ4S51RJ9sqTfKC1SjiECRuNr5/pub" },
  { label: "Final report, April 2024", href: "https://docs.google.com/document/d/1l0ChWMDnPiDJkvFFctdpIZUheSkJ3shouFSYFIIsNW0/edit?usp=sharing" },
  { label: "2023 project proposal, October 2023", href: "https://docs.google.com/document/d/16FBgWv1JVa3SDyDcNtiC_EZ3NYhkU7Y5tBEmhjGQftM/edit?usp=sharing" },
  { label: "2022 project proposal, October 2022", href: "https://docs.google.com/document/d/1MjXN3lbgYXInZyUk1V_sh4wVVs2ITd6rloYKjJW8W6c/edit?usp=sharing" },
  { label: "Final report, April 2022", href: "https://docs.google.com/document/d/e/2PACX-1vSL0Ezm-2XOCQWPv4R7J3MRZAn5PW46cayuKNxxElyVdl9W48ns2cRcd6xquoBc054_w2K_vsx2si7P/pub" },
  { label: "Project proposal, October 2021", href: "https://docs.google.com/document/d/e/2PACX-1vTBrCpNg8RfpGYG5-c4ZDzpADTPWUyfRhuUzgXTH19LPGs2ZPTZ5OjixdFz_zhYkPzdBkxCjWd46Klc/pub" },
  { label: "Final report, May 2021", href: "https://docs.google.com/document/d/e/2PACX-1vQcSDE6VMNl-wMHhECt3RbeA3WD-tiXersevVAMDXfgImq9HMFS5yQnLx8mZ4qZ4Q/pub" },
  { label: "Updated status report, December 2020", href: "https://docs.google.com/document/d/e/2PACX-1vQPQ1Qhu0jCVThVbNsUFxV8fB56fHgVf4Dnhfkf6EU_7627iMVuSHntW8VxF0j0Aw/pub" },
  { label: "Original proposal, October 2020", href: "https://docs.google.com/document/d/e/2PACX-1vQTy2A83LmPKrZhQ5_LCN6a3ow4UHxknIq4OjgimPU-Brfyl6fAhb9aQmxjNvg5tA/pub" },
];

const ext = { target: "_blank", rel: "noreferrer" } as const;

export function AboutPage() {
  return (
    <div className="help about">
      <h2>About Course Schedulizer</h2>
      <dl className="facts">
        <dt>Version</dt><dd>{APP_VERSION}</dd>
        {BUILD_DATE && (<><dt>Built</dt><dd>{BUILD_DATE}</dd></>)}
        <dt>Author</dt><dd>Randall Pruim</dd>
      </dl>
      <p>
        
        Course Schedulizer helps a department build and check its course schedule. 
        Meeting times, rooms, instructors, load, etc. can be entered and edited for each 
        course section.  Checks for conflicts, violations of custom constraints, and faculty load,
        and comparisons of multiple schedules help reduce the number of errors made while creating
        schedules. This version is a de novo rewrite but shares many features with an earlier 
        version, and it and it opens files from that version to make migration easy.
      </p>
      <p>
        Schedules are kept in this browser while you work and are never sent anywhere; 
        use <Link to="/export">Export</Link> to save them as Excel files. One of the sheets in
        the Excel file is customized for use by the registrar's office in preparing schedules.
        
        See the <Link to="/help">User guide</Link> for how to do things.
      </p>


      <section className="help-section">
        <h2>License</h2>
        <p>
          Course Schedulizer is open-source software released under the <a href="./LICENSE.txt" {...ext}>MIT license</a>. It is built with open-source libraries; their licenses are in the{" "}
          <a href="./THIRD-PARTY-NOTICES.txt" {...ext}>third-party notices</a>.
        </p>
      </section>

      <section className="help-section">
        <h2>Previous versions</h2>
        <p>
          Course Schedulizer began as a tool written by Professors Randall Pruim and Keith VanderLinden. From 2020 until 2026, 
          it was built up and maintained by teams of Calvin University computer science
          students, working as “Senior Knights” and advised by the two of them. That version is still online as the{" "}
          <a href="https://senior-knights.github.io/course-schedulizer/#/" {...ext}>original Course Schedulizer</a>, and its code is in the{" "}
          <a href="https://github.com/senior-knights/course-schedulizer" {...ext}>GitHub repository</a>. This version is a rewrite that keeps what that one did and adds to it.
        </p>
        <h3>The students</h3>
        <p>Teams are listed under the year the original project’s site gives them (“Team of 2024” and so on).</p>
        <dl className="teams">
          {TEAMS.map((t) => (
            <div key={t.year} className="team">
              <dt>{t.year}</dt>
              <dd>{t.students.join(", ")}</dd>
            </div>
          ))}
        </dl>
        <h3>Advisors</h3>
        <p>Professor Keith VanderLinden (Computer Science) and Professor Randall Pruim (Mathematics and Statistics), both of Calvin University.</p>
        <h3>Harmoniously</h3>
        <p>
          The first release also included <a href="https://github.com/charkour/harmoniously" {...ext}>Harmoniously</a>, an Honors project completed in 2020 by Charles Kornoelje. It took a list of classes,
          instructors, rooms and times and used constraint-satisfaction techniques (<a href="https://github.com/charkour/csps" {...ext}>CSPS</a>, a TypeScript port of the algorithm in Russell and Norvig’s
          textbook) to build a schedule with no conflicts. It was later removed from the application.
        </p>
        <h3>Project reports</h3>
        <ul>
          {REPORTS.map((r) => <li key={r.href}><a href={r.href} {...ext}>{r.label}</a></li>)}
        </ul>
      </section>
    </div>
  );
}
