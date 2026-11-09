import { useCallback, useEffect, useMemo, useState } from "react";
import { track } from "../analytics";
import { api, DEMO, type Deadline, type Doc, type DraftKind, type Me, type Timeline } from "../api";
import type { View } from "../App";
import { categoryOf, DATE_VERB, daysUntil, KIND_LABEL, monthLabel, relative, shortDate, totals } from "../format";
import { CaughtUpArt, EmptyArt } from "../illustrations";
import { DateStamp, EmptyState, Money, Progress, ProviderBadge } from "../ui/bits";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { AboutCard, aboutHidden, hideAbout } from "../ui/About";
import { Sheet } from "../ui/Sheet";
import { useToast } from "../ui/Toast";
import { useAction } from "../ui/useAction";

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

const hasPriceRise = (doc?: Doc) => Boolean(doc?.analysis.flags.some((f) => /price|increase|rise|goes up/i.test(f)));

export function TimelineScreen({ me, go, hidden, onAbout }: { me: Me; go: (v: View) => void; hidden: Set<string>; onAbout: () => void }) {
  const [showAbout, setShowAbout] = useState(() => !aboutHidden());
  const [data, setData] = useState<Timeline | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const act = useAction();

  const load = useCallback(() => {
    setLoadError(null);
    Promise.all([api.timeline(), api.documents()]).then(
      ([t, d]) => {
        setData(t);
        setDocs(d);
      },
      (e) => setLoadError(e.message),
    );
  }, []);
  useEffect(load, [load]);

  const patchLocal = (id: string, patch: Partial<Deadline>) =>
    setData((t) => t && { ...t, items: t.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

  async function setDone(d: Deadline, done: boolean) {
    patchLocal(d.id, { done });
    const ok = await act(() => api.updateDeadline(d.id, { done }), { rollback: () => patchLocal(d.id, { done: !done }), retry: () => void setDone(d, done) });
    if (ok && done) {
      track("deadline_done", { kind: d.kind });
      toast({
        message: d.kind === "payment" ? `Marked as paid: ${d.title}` : `Done: ${d.title}`,
        undo: () => {
          patchLocal(d.id, { done: false });
          void act(() => api.updateDeadline(d.id, { done: false }), { rollback: () => patchLocal(d.id, { done: true }) });
        },
      });
    }
  }

  async function confirm(d: Deadline) {
    patchLocal(d.id, { date: { ...d.date, confirmed: true }, amount: { ...d.amount, confirmed: true } });
    const ok = await act(() => api.updateDeadline(d.id, { confirm: true }), {
      rollback: () => patchLocal(d.id, { date: d.date, amount: d.amount }),
      retry: () => void confirm(d),
    });
    if (ok) track("fact_confirmed", { kind: d.kind, where: "timeline" });
  }

  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);

  const view = useMemo(() => {
    if (!data) return null;
    const today = data.today;
    const visible = data.items.filter((d) => !d.document || !hidden.has(d.document.id));
    const mine = mineOnly ? visible.filter((d) => d.ownerId === me.user.id) : visible;
    const open = mine.filter((d) => !d.done);
    const done = mine.filter((d) => d.done);
    const overdue = open.filter((d) => d.date.value < today);
    const upcoming = open.filter((d) => d.date.value >= today);
    const next = overdue[0] ?? upcoming[0] ?? null;
    const rest = open.filter((d) => d !== next);

    // Spine groups: past due first, then one group per calendar month.
    const groups: { key: string; label: string; note?: string; items: Deadline[] }[] = [];
    const past = rest.filter((d) => d.date.value < today);
    if (past.length) groups.push({ key: "past", label: "Past due", note: "Here's what to do now", items: past });
    for (const d of rest.filter((x) => x.date.value >= today)) {
      const key = d.date.value.slice(0, 7);
      let g = groups.find((x) => x.key === key);
      if (!g) groups.push((g = { key, label: monthLabel(d.date.value), items: [] }));
      g.items.push(d);
    }

    // Totals are worked out from what's on screen, so they change the moment something is marked paid.
    const in30 = open.filter((d) => d.date.value >= today && daysUntil(d.date.value, today) <= 30);
    const due: Record<string, number> = {};
    for (const d of in30) {
      if ((d.kind === "payment" || d.kind === "renewal") && d.amount.value != null) {
        const c = d.currency ?? "EUR";
        due[c] = Math.round(((due[c] ?? 0) + d.amount.value) * 100) / 100;
      }
    }
    const month = today.slice(0, 7);
    const thisMonth = mine.filter((d) => d.date.value.slice(0, 7) === month);
    const toCheck = open.filter((d) => !d.date.confirmed);
    return { visible, open, done, next, groups, toCheck, due, thisMonth, today };
  }, [data, hidden, mineOnly, me.user.id]);

  if (loadError)
    return (
      <div className="card stack" role="alert">
        <h2>We couldn't load your timeline</h2>
        <p className="muted">{loadError}</p>
        <Button variant="primary" icon="retry" onClick={load}>
          Try again
        </Button>
      </div>
    );
  if (!data || !view) return <p className="muted">Loading your timeline…</p>;

  const first = me.user.name.trim().split(" ")[0];
  const ownDocs = docs.filter((d) => !d.example && !hidden.has(d.id));
  const checklist = [
    { label: `Add 3 of your own documents (${Math.min(ownDocs.length, 3)} of 3)`, done: ownDocs.length >= 3 },
    { label: "Check a date we found", done: data.items.some((d) => d.date.confirmed) },
    DEMO
      ? { label: "Read a letter from a photo", done: docs.some((d) => d.source === "photo") }
      : { label: "Forward one email to your Life Admin address", done: docs.some((d) => d.source === "email") },
  ];
  const showChecklist = !checklistHidden && !checklist.every((c) => c.done);
  const priceFlags = docs.filter((d) => !hidden.has(d.id) && hasPriceRise(d)).length;
  const monthDone = view.thisMonth.filter((d) => d.done).length;

  return (
    <section className="stack">
      <header className="summary-head">
        <p className="greeting">
          {greeting()}, {first}
        </p>
        {view.open.length === 0 ? (
          <h1 className="headline">Nothing needs you right now</h1>
        ) : Object.keys(view.due).length ? (
          <h1 className="headline">
            <span className="big-money">{totals(view.due)}</span>
            <span className="headline-sub">due in the next 30 days</span>
          </h1>
        ) : (
          <h1 className="headline">
            {view.open.length} {view.open.length === 1 ? "thing" : "things"} coming up
          </h1>
        )}
        {view.thisMonth.length > 0 && <Progress done={monthDone} total={view.thisMonth.length} label="sorted this month" />}
      </header>

      {showAbout ? (
        <AboutCard onAdd={() => go({ name: "capture" })} onDismiss={() => (hideAbout(), setShowAbout(false))} />
      ) : (
        <button className="link small about-link" onClick={onAbout}>
          <Icon name="info" size={18} />
          What is Life Admin?
        </button>
      )}

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
        <NextUp d={view.next} doc={docById.get(view.next.documentId)} today={view.today} go={go} onDone={() => setDone(view.next!, true)} />
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
            <span className="small muted">We read these automatically. It takes a minute.</span>
          </span>
          <Icon name="chevron" />
        </button>
      )}

      {showChecklist && (
        <div className="card checklist-card">
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
            {checklist.map((c, i) => (
              <li key={c.label} className={c.done ? "done" : ""}>
                <span className={`dot cat-${["bill", "official", "renewal"][i]}`}>{c.done && <Icon name="check" size={16} />}</span>
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

      {view.groups.length > 0 && (
        <div className="spine">
          {view.groups.map((g) => (
            <section key={g.key} className={`spine-group ${g.key === "past" ? "is-past" : ""}`} aria-labelledby={`g-${g.key}`}>
              <div className="month">
                <h3 id={`g-${g.key}`}>{g.label}</h3>
                {g.note ? <span className="group-note">{g.note}</span> : <span className="group-note">{g.items.length === 1 ? "1 item" : `${g.items.length} items`}</span>}
              </div>
              <ul className="tl">
                {g.items.map((d) => (
                  <Row key={d.id} d={d} doc={docById.get(d.documentId)} today={view.today} go={go} onToggle={() => setDone(d, !d.done)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {view.done.length > 0 && (
        <section>
          <button className="disclosure" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>
            <Icon name="chevron" size={18} className={showDone ? "rot90" : ""} />
            Done ({view.done.length})
          </button>
          {showDone && (
            <ul className="tl tl-done">
              {view.done.map((d) => (
                <Row key={d.id} d={d} doc={docById.get(d.documentId)} today={view.today} go={go} onToggle={() => setDone(d, !d.done)} />
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
                <li key={d.id} className={`fact cat-${categoryOf(d.document?.docType, d.kind)}`} style={{ cursor: "default" }}>
                  <DateStamp iso={d.date.value} />
                  <div className="grow">
                    <span className="fact-title">{d.title}</span>
                    {d.amount.value != null && <Money value={d.amount.value} currency={d.currency} />}
                    {d.evidence ? (
                      <span className="evidence">
                        <Icon name="quote" size={16} />
                        <span>{d.evidence}</span>
                      </span>
                    ) : (
                      <span className="small muted">Open the letter to compare it with the original.</span>
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

function NextUp({ d, doc, today, go, onDone }: { d: Deadline; doc?: Doc; today: string; go: (v: View) => void; onDone: () => void }) {
  const action = primaryAction(d);
  const past = d.date.value < today;
  const cat = categoryOf(d.document?.docType, d.kind);
  const date = new Date(`${d.date.value}T00:00:00Z`);
  return (
    <article className={`next-up cat-${cat}`} aria-labelledby="next-title">
      <div className="next-up-top">
        <div className="big-date" aria-hidden="true">
          <span className="big-date-day">{date.getUTCDate()}</span>
          <span className="big-date-month">{date.toLocaleDateString("en-IE", { month: "short", timeZone: "UTC" })}</span>
        </div>
        <div className="next-up-body">
          <span className="row next-eyebrow">
            <span className="eyebrow">{past ? "Past due · here's what to do" : `Next up · ${KIND_LABEL[d.kind]}`}</span>
            {d.document?.example && <span className="badge badge-on">Example</span>}
          </span>
          <h2 id="next-title">{d.title}</h2>
          <p className="when">
            {relative(d.date.value, today)} · {shortDate(d.date.value)}
            {d.amount.value != null && (
              <>
                {" · "}
                <Money value={d.amount.value} currency={d.currency} />
              </>
            )}
          </p>
          {hasPriceRise(doc) && (
            <span className="chip-rise on-colour">
              <Icon name="trendUp" size={14} />
              Price rise
            </span>
          )}
        </div>
      </div>
      <div className="next-up-actions">
        <Button
          variant="primary"
          className="btn-on-colour"
          onClick={() => (action.done ? onDone() : go({ name: "document", id: d.documentId, draft: action.draft }))}
          icon={action.done ? "check" : action.draft ? "edit" : undefined}
        >
          {action.label}
        </Button>
        {action.done ? (
          <Button variant="ghost" className="btn-ghost-on-colour" onClick={() => go({ name: "document", id: d.documentId })}>
            Open letter
          </Button>
        ) : (
          <Button variant="ghost" className="btn-ghost-on-colour" icon="check" onClick={onDone}>
            Mark done
          </Button>
        )}
      </div>
    </article>
  );
}

function Row({ d, doc, today, go, onToggle }: { d: Deadline; doc?: Doc; today: string; go: (v: View) => void; onToggle: () => void }) {
  const cat = categoryOf(d.document?.docType, d.kind);
  return (
    <li className={`tl-item cat-${cat} ${d.done ? "is-done" : ""}`}>
      <span className="spine-dot" aria-hidden="true" />
      <ProviderBadge name={d.document?.provider ?? d.title} cat={cat} />
      <button className="tl-main" onClick={() => go({ name: "document", id: d.documentId })}>
        <span className="tl-title">{d.document?.provider ?? d.title}</span>
        <span className="tl-meta">
          <span className="tl-verb">
            {DATE_VERB[d.kind]} {shortDate(d.date.value)}
          </span>
          <span>· {relative(d.date.value, today)}</span>
        </span>
        <span className="tl-tags">
          <span className="kind">{KIND_LABEL[d.kind]}</span>
          {hasPriceRise(doc) && (
            <span className="chip-rise">
              <Icon name="trendUp" size={12} />
              Price rise
            </span>
          )}
          {d.ownerName && <span className="small muted">{d.ownerName}</span>}
          {d.document?.example && <span className="badge badge-example">Example</span>}
        </span>
      </button>
      <span className="tl-right">
        {d.amount.value != null && <Money value={d.amount.value} currency={d.currency} />}
        <button className="tick" onClick={onToggle} aria-pressed={d.done} aria-label={d.done ? `Mark “${d.title}” as not done` : `Mark “${d.title}” as done`}>
          <span className="tick-ring">
            <Icon name="check" size={18} />
          </span>
        </button>
      </span>
    </li>
  );
}
