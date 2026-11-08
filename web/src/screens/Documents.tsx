import { useEffect, useState } from "react";
import { api, type Doc, type DocType } from "../api";
import type { View } from "../App";
import { DOC_TYPE_LABEL } from "../format";

export function Documents({ go }: { go: (v: View) => void }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [filter, setFilter] = useState<DocType | "all">("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.documents().then(setDocs, (e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!docs) return <p className="muted">Loading…</p>;

  const types = Array.from(new Set(docs.map((d) => d.analysis.docType)));
  const q = query.trim().toLowerCase();
  const shown = docs.filter(
    (d) =>
      (filter === "all" || d.analysis.docType === filter) &&
      (!q || `${d.analysis.title} ${d.analysis.provider ?? ""} ${d.analysis.summary}`.toLowerCase().includes(q)),
  );

  return (
    <section>
      <h1 className="page-title">Documents</h1>
      {docs.length === 0 ? (
        <div className="empty card">
          <p>No documents yet.</p>
          <button className="btn primary" onClick={() => go({ name: "capture" })}>
            Add one
          </button>
        </div>
      ) : (
        <>
          <input id="search" className="search" type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="chips">
            <button className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>
              All
            </button>
            {types.map((t) => (
              <button key={t} className={`chip ${filter === t ? "on" : ""}`} onClick={() => setFilter(t)}>
                {DOC_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <ul className="doc-list">
            {shown.map((d) => (
              <li key={d.id}>
                <button onClick={() => go({ name: "document", id: d.id })}>
                  <span className={`type type-${d.analysis.docType}`}>{DOC_TYPE_LABEL[d.analysis.docType]}</span>
                  <span className="doc-title">{d.analysis.title}</span>
                  <span className="doc-summary">{d.analysis.summary}</span>
                  <span className="muted small">
                    {new Date(d.createdAt).toLocaleDateString("en-IE")}
                    {d.example && <span className="badge example">Example</span>}
                    {d.status === "needs_review" && <span className="badge warn">Check</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
