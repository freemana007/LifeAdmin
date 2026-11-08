import { useEffect, useState } from "react";
import { api, type Doc } from "../api";
import type { View } from "../App";
import { categoryOf, DOC_TYPE_LABEL } from "../format";
import { EmptyArt } from "../illustrations";
import { EmptyState, ProviderBadge } from "../ui/bits";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

/** Library: one search box covers provider, type and content, instead of separate filters (fewer controls). */
export function Documents({ go, hidden }: { go: (v: View) => void; hidden: Set<string> }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.documents().then(setDocs, (e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!docs) return <p className="muted">Loading…</p>;

  const visible = docs.filter((d) => !hidden.has(d.id));
  const q = query.trim().toLowerCase();
  const shown = visible.filter(
    (d) => !q || `${d.analysis.title} ${d.analysis.provider ?? ""} ${DOC_TYPE_LABEL[d.analysis.docType]} ${d.analysis.summary}`.toLowerCase().includes(q),
  );

  return (
    <section className="stack">
      <h1 className="headline">Library</h1>
      {visible.length === 0 ? (
        <div className="card">
          <EmptyState
            art={<EmptyArt />}
            title="No documents yet"
            action={
              <Button variant="primary" icon="plus" onClick={() => go({ name: "capture" })}>
                Add a document
              </Button>
            }
          >
            <p>Everything you add is kept here, searchable, with the original text.</p>
          </EmptyState>
        </div>
      ) : (
        <>
          <label className="search">
            <span className="sr-only">Search your documents</span>
            <Icon name="search" size={20} />
            <input id="search" type="search" placeholder="Search: “insurance”, “Revenue”, “bill”…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {shown.length === 0 && <p className="muted">Nothing matches “{query}”.</p>}
          <ul className="doc-list">
            {shown.map((d) => (
              <li key={d.id}>
                <button className={`doc-row cat-${categoryOf(d.analysis.docType)}`} onClick={() => go({ name: "document", id: d.id })}>
                  <ProviderBadge name={d.analysis.provider ?? d.analysis.title} cat={categoryOf(d.analysis.docType)} />
                  <span className="row">
                    <span className="type">{DOC_TYPE_LABEL[d.analysis.docType]}</span>
                    {d.example && <span className="badge badge-example">Example</span>}
                  </span>
                  <span className="doc-title">{d.analysis.title}</span>
                  <span className="doc-summary">{d.analysis.summary}</span>
                  <span className="small muted">Added {new Date(d.createdAt).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
