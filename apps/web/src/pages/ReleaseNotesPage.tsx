import news from "../../../../NEWS.md?raw";
import { inlineRuns, parseNews, type NewsItem } from "../news";
import { APP_VERSION } from "../version";

const ENTRIES = parseNews(news);

function Items({ items }: { items: NewsItem[] }) {
  return (
    <ul>
      {items.map((it, i) => (
        <li key={i}>
          {inlineRuns(it.text).map((r, k) => (r.kind === "code" ? <code key={k}>{r.text}</code> : r.kind === "em" ? <em key={k}>{r.text}</em> : <span key={k}>{r.text}</span>))}
          {it.items.length > 0 && <Items items={it.items} />}
        </li>
      ))}
    </ul>
  );
}

/** What changed in each version (the repository's NEWS.md). */
export function ReleaseNotesPage() {
  return (
    <div className="help">
      <h1>Release notes</h1>
      {ENTRIES.map((e) => (
        <section key={e.heading} className="help-section">
          <h2>{e.heading}{e.version === APP_VERSION && <span className="badge release-badge">this version</span>}</h2>
          <Items items={e.items} />
        </section>
      ))}
    </div>
  );
}
