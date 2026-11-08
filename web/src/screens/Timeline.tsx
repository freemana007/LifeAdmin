import { useCallback, useEffect, useMemo, useState } from "react";
import { track } from "../analytics";
import { api, DEMO, type Deadline, type Doc, type DraftKind, type Me, type Timeline } from "../api";
import type { View } from "../App";
import { daysUntil, KIND_LABEL, longDate, relative, totals } from "../format";
import { CaughtUpArt, EmptyArt } from "../illustrations";
import { DateStamp, EmptyState, Money } from "../ui/bits";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { useToast } from "../ui/Toast";

const CHECKLIST_KEY = "lifeadmin.checklist.hidden";

/** The one verb that moves each kind of deadline forward (one primary action per card). */
function primaryAction(d: Deadline): { label: string; draft?: DraftKind; done?: boolean } {
  switch (d.kind) {
    case "payment":
      return { label: "Mark as paid", done: true };
    case "cancellation_window":
      return { label: "Cancel it", draft: "cancel" };
    case "renewal":
      return { label: "Ask for a better price", draft: "negotiate" };
    case "response":
      return { label: "Draft a reply", draft: "reply" };
    default:
      return { label: "Open letter" };
  }
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function TimelineScreen({ me, go, hidden }: { me: Me; go: (v: View) => void; hidden: Set<string> }) {
  const [data, setData] = useState<Timeline | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [checklistHidden, setChecklistHidden] = useState(() => {
    try {
      return localStorage.getItem(CHECKLIST_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toast = useToast();

  const load = useCallback(() => {
    Promise.all([api.timeline(), api.documents()]).then(
      ([t, d]) => {
        setData(t);
        setDocs(d);
      },
      (e) => setError(e.message),
    );
  }, []);
  useEffect(load, [load]);

  const patchLocal = (id: string, patch: Partial<Deadline>) =>
    setData((t) => t && { ...t, items: t.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

  async function setDone(d: Deadline, done: boolean) {
    patchLocal(d.id, { done });
    try {
      await api.updateDeadline(d.id, { done });
      if (done) {
        track("deadline_done", { kind: d.kind });
        toast({
          message: `Done: ${d.title}`,
          undo: () => {
            patchLocal(d.id, { done: false });
            void api.updateDeadline(d.id, { done: false });
          },
        });
      }
    } catch (e) {
      patchLocal(d.id, { done: !done });
      setError((e as Error).message);
    }
  }

  async function confirm(d: Deadline) {
    patchLocal(d.id, { date: { ...d.date, confirmed: true }, amount: { ...d.amount, confirmed: true } });
    track("fact_confirmed", { kind: d.kind, where: "timeline" });
    await api.updateDeadline(d.id, { confirm: true }).catch((e) => setError(e.message));
  }

  const view = useMemo(() => {
    if (!data) return null;
    const visible = data.items.filter((d) => !d.document || !hidden.has(d.document.id));
    const mine = mineOnly ? visible.filter((d) => d.ownerId === me.user.id) : visible;
    const open = mine.filter((d) => !d.done);
    const done = mine.filter((d) => d.done);
    const overdue = open.filter((d) => d.date.value < data.today);
    const upcoming = open.filter((d) => d.date.value >= data.today);
    const next = overdue[0] ?? upcoming[0] ?? null;
    const rest = open.filter((d) => d !== next);
    const groups = [
      { key: "overdue", label: "Past due", note: "Here's what to do now", items: rest.filter((d) => d.date.value < data.today) },
      { key: "week", label: "This week", items: rest.filter((d) => d.date.value >= data.today && daysUntil(d.date.value, data.today) <= 7) },
      { key: "month", label: "Next 30 days", items: rest.filter((d) => daysUntil(d.date.value, data.today) > 7 && daysUntil(d.date.value, data.today) <= 30) },
      { key: "later", label: "Later", items: rest.filter((d) => daysUntil(d.date.value, data.today) > 30) },
    ].filter((g) => g.items.length);
    const toCheck = open.filter((d) => !d.date.confirmed);
    return { visible, open, done, next, groups, toCheck };
  }, [data, hidden, mineOnly, me.user.id]);

  if (error) return <p className="error">{error}</p>;
  if (!data || !view) return <p className="muted">Loading your timeline…</p>;

  const first = me.user.name.split(" ")[0];
  const due = data.stats.dueNext30Days;
  const ownDocs = docs.filter((d) => !d.example && !hidden.has(d.id));
  const checklist = [
    { label: `Add 3 of your own documents (${Math.min(ownDocs.length, 3)} of 3)`, done: ownDocs.length >= 3 },
    { label: "Check a date we found", done: data.items.some((d) => d.date.confirmed) },
    DEMO
      ? { label: "Read a letter from a photo", done: docs.some((d) => d.source === "photo") }
      : { label: "Forward one email to your Life Admin address", done: docs.some((d) => d.source === "email") },
  ];
  const showChecklist = !checklistHidden && !checklist.every((c) => c.done);
  const priceFlags = docs.filter((d) => d.analysis.flags.some((f) => /price|increase|rise/i.test(f))).length;

  return (
    <section className="stack">
      <div>
        <p className="greeting">
          {greeting()}, {first}
        </p>
        <h1 className="headline">
          {view.open.length === 0 ? (
            "Nothing needs you right now"
          ) : Object.keys(due).length ? (
            <>
              <span className="money">{totals(due)}</span> due in the next 30 days
            </>
          ) : (
            `${view.open.length} ${view.open.length === 1 ? "thing" : "things"} coming up`
          )}
        </h1>
      </div>

      {view.visible.length === 0 ? (
        <div className="card">
          <EmptyState
            art={<EmptyArt />}
            title="Your letterbox is empty"
            action={
              <Button variant="primary" icon="plus" onClick={() => go({ name: "capture" })}>
                Add a document
              </Button>
            }
          >
            <p>Add a bill, renewal or official letter and we'll pull out what's due and when.</p>
          </EmptyState>
        </div>
      ) : view.next ? (
        <NextUp d={view.next} today={data.today} go={go} onDone={() => setDone(view.next!, true)} />
      ) : (
        <div className="card caught-up">
          <CaughtUpArt />
          <h2>You're all caught up</h2>
          <p className="muted">Nothing needs you right now. We'll send one reminder when something's coming up.</p>
          <div className="reflect" aria-label="What you've handled">
            <div>
              <strong>{view.done.length}</strong>
              <span>{view.done.length === 1 ? "deadline handled" : "deadlines handled"}</span>
            </div>
            <div>
              <strong>{priceFlags}</strong>
              <span>{priceFlags === 1 ? "price rise spotted" : "price rises spotted"}</span>
            </div>
          </div>
        </div>
      )}

      {view.toCheck.length > 0 && (
        <button className="check-row" onClick={() => setReviewOpen(true)}>
          <span className="count">{view.toCheck.length}</span>
          <span className="grow">
            <strong>{view.toCheck.length === 1 ? "1 date to check" : `${view.toCheck.length} dates to check`}</strong>
            <br />
            <span className="small muted">We read these automatically. It takes a minute.</span>
          </span>
          <Icon name="chevron" />
        </button>
      )}

      {showChecklist && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="card-title">Your first week</h2>
            <button
              className="link small"
              onClick={() => {
                setChecklistHidden(true);
                try {
                  localStorage.setItem(CHECKLIST_KEY, "1");
                } catch {
                  /* fine for this visit */
                }
              }}
            >
              Hide
            </button>
          </div>
          <ul className="checklist">
            {checklist.map((c) => (
              <li key={c.label} className={c.done ? "done" : ""}>
                <span className="dot">{c.done && <Icon name="check" size={16} />}</span>
                <span>{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {me.household.members.length > 1 && view.visible.length > 0 && (
        <div className="segmented" role="group" aria-label="Show">
          <button className={!mineOnly ? "on" : ""} aria-pressed={!mineOnly} onClick={() => setMineOnly(false)}>
            Everyone
          </button>
          <button className={mineOnly ? "on" : ""} aria-pressed={mineOnly} onClick={() => setMineOnly(true)}>
            Assigned to me
          </button>
        </div>
      )}

      {view.groups.map((g) => (
        <section key={g.key} aria-labelledby={`g-${g.key}`}>
          <div className="group-title">
            <h3 id={`g-${g.key}`}>{g.label}</h3>
            {g.note && <span className="group-note">{g.note}</span>}
          </div>
          <ul className="tl">
            {g.items.map((d) => (
              <Row key={d.id} d={d} today={data.today} go={go} onToggle={() => setDone(d, !d.done)} />
            ))}
          </ul>
        </section>
      ))}

      {view.done.length > 0 && (
        <section>
          <button className="disclosure" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>
            <Icon name="chevron" size={18} className={showDone ? "rot90" : ""} />
            Done ({view.done.length})
          </button>
          {showDone && (
            <ul className="tl">
              {view.done.map((d) => (
                <Row key={d.id} d={d} today={data.today} go={go} onToggle={() => setDone(d, !d.done)} />
              ))}
            </ul>
          )}
        </section>
      )}

      <Sheet open={reviewOpen} title="Check these dates" onClose={() => setReviewOpen(false)}>
        {view.toCheck.length === 0 ? (
          <div className="notice ok">
            <Icon name="check" />
            <span>All checked. Your reminders are set.</span>
          </div>
        ) : (
          <>
            <p className="small muted">Compare each one with the line we read it from. If it's wrong, open the letter to fix it.</p>
            <ul className="facts">
              {view.toCheck.map((d) => (
                <li key={d.id} className="fact" style={{ cursor: "default" }}>
                  <DateStamp iso={d.date.value} />
                  <div className="grow">
                    <span className="fact-title">{d.title}</span>
                    {d.amount.value != null && <Money value={d.amount.value} currency={d.currency} />}
                    {d.evidence && (
                      <span className="evidence">
                        <Icon name="quote" size={16} />
                        <span>{d.evidence}</span>
                      </span>
                    )}
                    <div className="row">
                      <Button size="sm" variant="primary" icon="check" onClick={() => confirm(d)}>
                        Looks right
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => (setReviewOpen(false), go({ name: "document", id: d.documentId }))}>
                        Fix it
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Sheet>
    </section>
  );
}

function NextUp({ d, today, go, onDone }: { d: Deadline; today: string; go: (v: View) => void; onDone: () => void }) {
  const action = primaryAction(d);
  const past = d.date.value < today;
  return (
    <article className="next-up" aria-labelledby="next-title">
      <div className="next-up-body">
        <span className="row">
          <span className="eyebrow">{past ? "Past due: here's what to do now" : "Next up"}</span>
          {d.document?.example && <span className="badge badge-example">Example</span>}
        </span>
        <h2 id="next-title">{d.title}</h2>
        <p className="when">
          {relative(d.date.value, today)} · {longDate(d.date.value)}
        </p>
        {d.amount.value != null && (
          <p className="next-amount">
            <Money value={d.amount.value} currency={d.currency} />
          </p>
        )}
      </div>
      <div className="next-up-actions">
        <Button
          variant="primary"
          onClick={() => (action.done ? onDone() : go({ name: "document", id: d.documentId, draft: action.draft }))}
          icon={action.done ? "check" : action.draft ? "edit" : undefined}
        >
          {action.label}
        </Button>
        {action.done ? (
          <Button variant="ghost" onClick={() => go({ name: "document", id: d.documentId })}>
            Open letter
          </Button>
        ) : (
          <Button variant="ghost" icon="check" onClick={onDone}>
            Mark done
          </Button>
        )}
      </div>
    </article>
  );
}

function Row({ d, today, go, onToggle }: { d: Deadline; today: string; go: (v: View) => void; onToggle: () => void }) {
  return (
    <li className={`tl-item ${d.done ? "is-done" : ""}`}>
      <DateStamp iso={d.date.value} tone={d.done ? "muted" : d.date.value < today ? "past" : "default"} />
      <button className="tl-main" onClick={() => go({ name: "document", id: d.documentId })}>
        <span className={`kind kind-${d.kind}`}>
          <Icon name={d.kind} size={14} />
          {KIND_LABEL[d.kind]}
        </span>
        <span className="tl-title">{d.title}</span>
        <span className="tl-meta">
          <span>{relative(d.date.value, today)}</span>
          {d.amount.value != null && <Money value={d.amount.value} currency={d.currency} />}
          {d.ownerName && <span>{d.ownerName}</span>}
          {d.document?.example && <span className="badge badge-example">Example</span>}
        </span>
      </button>
      <button className="tick" onClick={onToggle} aria-pressed={d.done} aria-label={d.done ? `Mark “${d.title}” as not done` : `Mark “${d.title}” as done`}>
        <span className="tick-ring">
          <Icon name="check" size={18} />
        </span>
      </button>
    </li>
  );
}
