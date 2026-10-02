import { Link } from "react-router-dom";
import { APP_VERSION, BUILD_DATE } from "../version";

/** What this is and which version is running. */
export function AboutPage() {
  return (
    <div className="help">
      <h2>About Course Schedulizer</h2>
      <dl className="facts">
        <dt>Version</dt><dd>{APP_VERSION}</dd>
        {BUILD_DATE && (<><dt>Built</dt><dd>{BUILD_DATE}</dd></>)}
      </dl>
      <p>
        Course Schedulizer helps a department build and check its course schedule: sections, meeting times, rooms, instructors, load (including non-teaching load), conflicts and constraint rules,
        and comparisons between drafts. It is a rewrite of the earlier Course Schedulizer, and it opens files from that version.
      </p>
      <p>
        Your schedules are kept in this browser while you work and are never sent anywhere; use <Link to="/export">Export</Link> to save them as Excel files. See the <Link to="/help">Help</Link> tab for how to do things.
      </p>
    </div>
  );
}
