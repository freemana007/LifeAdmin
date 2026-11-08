import { useEffect, useState } from "react";
import { api, type Deadline, type Me, type Timeline } from "../api";
import type { View } from "../App";
import { daysUntil, KIND_LABEL, longDate, money, relative, totals } from "../format";

function group(items: Deadline[], today: string) {
  const groups: { key: string; label: string; items: Deadline[] }[] = [
    { key: "overdue", label: "Overdue", items: [] },
    { key: "week", label: "This week", items: [] },
    { key: "month", label: "Next 30 days", items: [] },
    { key: "later", label: "Later", items: [] },
    { key: "done", label: "Done", items: [] },
  ];
  for (const d of items) {
    const days = daysUntil(d.date.value, today);
    const g = d.done ? 4 : days < 0 ? 0 : days <= 7 ? 1 : days <= 30 ? 2 : 3;
    groups[g].items.push(d);
  }
  return groups.filter((g) => g.items.length);
}

export function TimelineScreen({ me, go }: { me: Me; go: (v: View) => void }) {
  const [data, setData] = useState<Timeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

  const load = () => api.timeline().then(setData, (e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  async function toggleDone(d: Deadline) {
    setData((t) => t && { ...t, items: t.items.map((x) => (x.id === d.id ? { ...x, done: !d.done } : x)) });
    await api.updateDeadline(d.id, { done: !d.done }).catch((e) => setError(e.message));
    void load();
  }

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading your timeline…</p>;

  const items = mineOnly ? data.items.filter((d) => d.ownerId === me.user.id) : data.items;
  const first = me.user.name.split(" ")[0];

  return (
    <section>
      <h1 className="page-title">Hi {first}</h1>
      <div className="stats">
        <div className={`stat ${data.stats.overdue ? "stat-alert" : ""}`}>
          <strong>{data.stats.overdue}</strong>
          <span>overdue</span>
        </div>
        <div className="stat">
          <strong>{data.stats.next30Days}</strong>
          <span>due in 30 days</span>
        </div>
        <div className="stat">
          <strong>{totals(data.stats.dueNext30Days)}</strong>
          <span>to pay in 30 days</span>
        </div>
      </div>
      {data.stats.needsReview > 0 && (
        <p className="notice">
          {data.stats.needsReview} {data.stats.needsReview === 1 ? "date was" : "dates were"} read automatically. Open them to check before
          you rely on the reminders.
        </p>
      )}

      {data.items.length === 0 ? (
        <div className="empty card">
          <h2>Nothing on your timeline yet</h2>
          <p>Add your first bill, renewal or letter and we'll pull out what's due and when.</p>
          <button className="btn primary" onClick={() => go({ name: "capture" })}>
            Add a document
          </button>
        </div>
      ) : (
        <>
          {me.household.members.length > 1 && (
            <div className="segmented" role="group" aria-label="Filter">
              <button className={!mineOnly ? "on" : ""} onClick={() => setMineOnly(false)}>
                Everyone
              </button>
              <button className={mineOnly ? "on" : ""} onClick={() => setMineOnly(true)}>
                Assigned to me
              </button>
            </div>
          )}
          {group(items, data.today).map((g) => (
            <div key={g.key} className="group">
              <h2 className={`group-title ${g.key === "overdue" ? "alert" : ""}`}>{g.label}</h2>
              <ul className="timeline">
                {g.items.map((d) => (
                  <li key={d.id} className={`tl-item kind-${d.kind} ${d.done ? "done" : ""}`}>
                    <button className="tick" aria-label={d.done ? "Mark as not done" : "Mark as done"} onClick={() => toggleDone(d)}>
                      {d.done ? "✓" : ""}
                    </button>
                    <button className="tl-body" onClick={() => go({ name: "document", id: d.documentId })}>
                      <span className="tl-top">
                        <span className="kind">{KIND_LABEL[d.kind]}</span>
                        <span className="when">{relative(d.date.value, data.today)}</span>
                      </span>
                      <span className="tl-title">{d.title}</span>
                      <span className="tl-meta">
                        {longDate(d.date.value)}
                        {d.amount.value != null && <> · {money(d.amount.value, d.currency ?? "EUR")}</>}
                        {d.ownerName && <> · {d.ownerName}</>}
                        {d.document?.example && <span className="badge example">Example</span>}
                        {!d.date.confirmed && <span className="badge warn">Check</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
