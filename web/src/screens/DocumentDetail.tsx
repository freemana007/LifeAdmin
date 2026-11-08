import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { track } from "../analytics";
import { api, type Deadline, type Doc, type Draft, type DraftKind, type Me } from "../api";
import type { View } from "../App";
import { categoryOf, DOC_TYPE_LABEL, KIND_LABEL } from "../format";
import { ConfidenceChip, DateStamp, Money, ProviderBadge } from "../ui/bits";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { useAction } from "../ui/useAction";

const DRAFTS: { kind: DraftKind; label: string; hint: string }[] = [
  { kind: "cancel", label: "Cancel it", hint: "End the contract or policy" },
  { kind: "negotiate", label: "Ask for a better price", hint: "Push back on a renewal" },
  { kind: "reply", label: "Reply", hint: "Answer or acknowledge" },
  { kind: "complaint", label: "Complain", hint: "Formal, with a deadline" },
];
const ACT_CAT = { cancel: "receipt", negotiate: "renewal", reply: "bill", complaint: "official" } as const;

const BACK_LABEL: Partial<Record<View["name"], string>> = { timeline: "Timeline", documents: "Library", capture: "Add", household: "Household" };

/** Accepts "84.20", "84,20", "1,250.00", "1.250,00" and "€ 1 250". */
export function parseMoney(raw: string): number | null {
  let t = raw.replace(/[€£\s]/g, "");
  if (!t) return null;
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    t = lastComma > lastDot ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (lastComma > -1) {
    t = /,\d{1,2}$/.test(t) && t.split(",").length === 2 ? t.replace(",", ".") : t.replace(/,/g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}

const DRAFT_TITLE: Record<DraftKind, string> = { cancel: "Cancellation email", negotiate: "Better-price request", reply: "Reply", complaint: "Complaint" };

/** Wrap every evidence quote found in the text in <mark>, so people can see exactly what was read. */
function highlight(text: string, quotes: string[]): ReactNode[] {
  const clean = quotes.map((q) => q.replace(/^…|…$/g, "").trim()).filter((q) => q.length > 3);
  if (!clean.length) return [text];
  const out: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest) {
    let best: { i: number; q: string } | null = null;
    for (const q of clean) {
      const i = rest.indexOf(q);
      if (i !== -1 && (!best || i < best.i)) best = { i, q };
    }
    if (!best) {
      out.push(rest);
      break;
    }
    out.push(rest.slice(0, best.i), <mark key={key++}>{best.q}</mark>);
    rest = rest.slice(best.i + best.q.length);
  }
  return out;
}

export function DocumentDetail({
  id,
  justCaptured,
  openDraft,
  me,
  go,
  back,
  onDelete,
}: {
  id: string;
  justCaptured?: boolean;
  openDraft?: DraftKind;
  me: Me;
  go: (v: View) => void;
  back: View["name"];
  onDelete: (id: string, title: string) => void;
}) {
  const act = useAction();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Deadline | null>(null);
  const [draftKind, setDraftKind] = useState<DraftKind | null>(openDraft ?? null);

  useEffect(() => {
    api.document(id).then(
      (r) => {
        setDoc(r.document);
        setDeadlines(r.deadlines);
      },
      (e) => setError(e.message),
    );
  }, [id]);

  const replace = (nd: Deadline) => setDeadlines((xs) => xs.map((x) => (x.id === nd.id ? nd : x)));

  async function confirmAll() {
    const pending = deadlines.filter((d) => !d.date.confirmed).length;
    const before = deadlines;
    setDeadlines((xs) => xs.map((x) => ({ ...x, date: { ...x.date, confirmed: true }, amount: { ...x.amount, confirmed: true } })));
    await act(
      async () => {
        const updated = await api.updateDocument(id, { status: "confirmed" });
        setDoc((d) => (d ? { ...d, status: updated.status } : d));
        track("fact_confirmed", { count: pending, where: "document" });
      },
      { rollback: () => setDeadlines(before) },
    );
  }

  if (error) return <p className="error">{error}</p>;
  if (!doc) return <p className="muted">Loading…</p>;
  const a = doc.analysis;
  const unconfirmed = deadlines.filter((d) => !d.date.confirmed);
  const amountCovered = a.amountDue && deadlines.some((d) => d.amount.value === a.amountDue!.value);
  const drafts = DRAFTS.filter((x) => x.kind !== "negotiate" || ["renewal", "bill", "contract"].includes(a.docType));
  const quotes = [...deadlines.map((d) => d.evidence ?? ""), a.amountDue?.evidence ?? ""];

  return (
    <section className="stack">
      <button className="back" onClick={() => go({ name: back } as View)}>
        <Icon name="back" size={20} />
        {BACK_LABEL[back] ?? "Back"}
      </button>

      <header className={`doc-band cat-${categoryOf(a.docType)}`}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <ProviderBadge name={a.provider ?? a.title} cat={categoryOf(a.docType)} size="lg" />
          <span className="row">
            <span className="type-on">{DOC_TYPE_LABEL[a.docType]}</span>
            {doc.example && <span className="badge badge-on">Example</span>}
          </span>
        </div>
        <h1>{a.title}</h1>
        <p className="meta">
          Added {new Date(doc.createdAt).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}
          {doc.uploadedByName && ` by ${doc.uploadedByName.trim()}`} · from{" "}
          {doc.source === "email" ? "an email" : doc.source === "photo" ? "a photo" : doc.source === "pdf" ? "a PDF" : "pasted text"}
        </p>
      </header>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Here's what we found</h2>
          <span className="ai-label">
            <Icon name="sparkle" size={16} />
            {a.engine === "claude" ? "Read by Claude" : "Read by the basic reader"}
          </span>
        </div>
        {justCaptured && unconfirmed.length > 0 && <p className="small muted" style={{ marginTop: 6 }}>Compare each item with the line it came from. Tap one to change it.</p>}

        {deadlines.length === 0 && !a.amountDue ? (
          <p className="muted" style={{ marginTop: 12 }}>
            No dates or amounts in this one. Nothing to add to your timeline.
          </p>
        ) : (
          <ul className="facts">
            {deadlines.map((d) => (
              <li key={d.id}>
                <button className={`fact cat-${categoryOf(a.docType, d.kind)}`} onClick={() => setEditing(d)} aria-label={`${d.title}. Tap to check or change.`}>
                  <DateStamp iso={d.date.value} tone={d.done ? "muted" : "default"} />
                  <span className="grow">
                    <span className="fact-top">
                      <span className={`kind kind-${d.kind}`}>
                        <Icon name={d.kind} size={14} />
                        {KIND_LABEL[d.kind]}
                      </span>
                      <ConfidenceChip confidence={d.date.confidence} confirmed={d.date.confirmed} />
                    </span>
                    <span className="fact-title">{d.title}</span>
                    {d.amount.value != null && <Money value={d.amount.value} currency={d.currency} />}
                    {d.evidence && (
                      <span className="evidence">
                        <Icon name="quote" size={16} />
                        <span>
                          <span className="sr-only">From the letter: </span>
                          {d.evidence}
                        </span>
                      </span>
                    )}
                  </span>
                  <Icon name="chevron" size={18} />
                </button>
              </li>
            ))}
            {a.amountDue && !amountCovered && (
              <li className="fact" style={{ cursor: "default" }}>
                <span className="stamp" aria-hidden="true">
                  <Icon name="payment" />
                </span>
                <span className="grow">
                  <span className="fact-top">
                    <span className="kind">Amount mentioned</span>
                    <ConfidenceChip confidence={a.amountDue.confidence} confirmed={doc.status === "confirmed"} />
                  </span>
                  <Money value={a.amountDue.value} currency={a.amountDue.currency} />
                  {a.amountDue.evidence && (
                    <span className="evidence">
                      <Icon name="quote" size={16} />
                      <span>{a.amountDue.evidence}</span>
                    </span>
                  )}
                </span>
              </li>
            )}
          </ul>
        )}

        {deadlines.length > 0 &&
          (unconfirmed.length > 0 ? (
            <Button variant="primary" block icon="check" onClick={confirmAll}>
              {unconfirmed.length === 1 ? "Confirm" : `Confirm all ${unconfirmed.length}`}
            </Button>
          ) : (
            <p className="notice ok">
              <Icon name="check" />
              <span>All confirmed. We'll remind you before each date.</span>
            </p>
          ))}
      </div>

      <div className="card stack">
        <h2>What it means</h2>
        <p className="summary-text">{a.summary}</p>
        {a.actions.length > 0 && (
          <div className="stack-sm">
            <h3 className="eyebrow">What to do</h3>
            <ol className="actions-list">
              {a.actions.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ol>
          </div>
        )}
        {a.flags.map((f, i) => (
          <p key={i} className="flag">
            <Icon name="sparkle" size={18} />
            <span>{f}</span>
          </p>
        ))}
      </div>

      <div className="card stack">
        <div>
          <h2>Act on it</h2>
          <p className="small muted">
            {me.household.plan === "premium" ? "We'll write an email you can edit and send." : "Ready-made templates on the free plan. Premium writes each one for your letter."}
          </p>
        </div>
        <div className="act-grid">
          {drafts.map((x) => (
            <button key={x.kind} className={`act cat-${ACT_CAT[x.kind]}`} onClick={() => setDraftKind(x.kind)}>
              <strong>{x.label}</strong>
              <span>{x.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {(a.referenceNumbers.length > 0 || a.provider || a.renewalTerms) && (
        <details className="more">
          <summary>
            Details and reference numbers
            <Icon name="chevron" size={18} />
          </summary>
          <div className="more-body">
            <dl className="details">
              {a.provider && (
                <>
                  <dt>From</dt>
                  <dd>{a.provider}</dd>
                </>
              )}
              {a.referenceNumbers.map((r) => (
                <div key={r.label + r.value} style={{ display: "contents" }}>
                  <dt>{r.label}</dt>
                  <dd>
                    <code>{r.value}</code>
                  </dd>
                </div>
              ))}
              {a.renewalTerms && (
                <>
                  <dt>Renewal terms</dt>
                  <dd>{a.renewalTerms}</dd>
                </>
              )}
            </dl>
          </div>
        </details>
      )}

      <details className="more">
        <summary>
          Original text
          <Icon name="chevron" size={18} />
        </summary>
        <div className="more-body">
          <p className="hint" style={{ marginBottom: 8 }}>
            Highlighted: the lines we read dates and amounts from.
          </p>
          <pre className="original">{doc.text ? highlight(doc.text, quotes) : "(no text)"}</pre>
        </div>
      </details>

      <div className="row-end">
        <Button variant="danger" icon="trash" onClick={() => onDelete(doc.id, a.title)}>
          Delete this document
        </Button>
      </div>

      <FactSheet d={editing} me={me} onClose={() => setEditing(null)} onSaved={(nd) => (replace(nd), setEditing(null))} />
      <DraftSheet docId={id} kind={draftKind} onClose={() => setDraftKind(null)} />
    </section>
  );
}

function FactSheet({ d, me, onClose, onSaved }: { d: Deadline | null; me: Me; onClose: () => void; onSaved: (d: Deadline) => void }) {
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [owner, setOwner] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!d) return;
    setDate(d.date.value);
    setAmount(d.amount.value?.toString() ?? "");
    setOwner(d.ownerId ?? "");
    setError(null);
  }, [d]);

  if (!d) return null;
  const parsed = parseMoney(amount);
  const amountValid = !Number.isNaN(parsed);
  const original = d.amount.value;

  async function save(extra: { done?: boolean } = {}) {
    if (!d) return;
    if (!date) return setError("Choose a date.");
    if (!amountValid) return setError("Enter the amount as a number, like 84.20.");
    setSaving(true);
    try {
      const patch: Parameters<typeof api.updateDeadline>[1] = { confirm: true, ...extra };
      const changed = date !== d.date.value || parsed !== original;
      if (date !== d.date.value) patch.date = date;
      if (parsed !== original) patch.amount = parsed;
      if (owner !== (d.ownerId ?? "")) patch.ownerId = owner || null;
      onSaved(await api.updateDeadline(d.id, patch));
      track(changed ? "fact_corrected" : "fact_confirmed", { kind: d.kind });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={Boolean(d)} title={d.title} onClose={onClose}>
      {d.evidence && (
        <p className="evidence">
          <Icon name="quote" size={16} />
          <span>
            <span className="sr-only">From the letter: </span>
            {d.evidence}
          </span>
        </p>
      )}
      <div className="two-col">
        <label className="field">
          Date
          <input id="fact-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          Amount ({d.currency ?? "EUR"})
          <input
            id="fact-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            placeholder="None"
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!amountValid}
          />
        </label>
      </div>
      {me.household.members.length > 1 && (
        <label className="field">
          Who's dealing with it
          <select id="fact-owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Anyone</option>
            {me.household.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === me.user.id ? "Me" : m.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <Button variant="primary" size="lg" block icon="check" disabled={saving} onClick={() => save()}>
        {date !== d.date.value || parsed !== original ? "Save changes" : "Looks right"}
      </Button>
      <Button variant="secondary" block disabled={saving} onClick={() => save({ done: !d.done })}>
        {d.done ? "Mark as not done" : "Mark as done"}
      </Button>
    </Sheet>
  );
}

function DraftSheet({ docId, kind, onClose }: { docId: string; kind: DraftKind | null; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const write = useCallback(
    async (k: DraftKind, extra?: string) => {
      setBusy(true);
      setError(null);
      setCopied(false);
      try {
        const d = await api.draft(docId, k, extra || undefined);
        setDraft(d);
        setSubject(d.subject);
        setBody(d.body);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [docId],
  );

  useEffect(() => {
    if (kind) {
      setNote("");
      setDraft(null);
      void write(kind);
    }
  }, [kind, write]);

  if (!kind) return null;
  const mailto = `mailto:${draft?.to ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <Sheet open title={DRAFT_TITLE[kind]} onClose={onClose}>
      {error && <p className="error">{error}</p>}
      {busy && !draft ? (
        <p className="muted" role="status">
          Writing your email…
        </p>
      ) : draft ? (
        <>
          <p className="draft-label">
            <Icon name={draft.engine === "claude" ? "sparkle" : "edit"} size={16} />
            {draft.engine === "claude" ? "Written by AI for this letter. Read it before you send it." : "Template. Fill in anything in [square brackets]."}
          </p>
          {draft.to && (
            <p className="small">
              To: <code>{draft.to}</code>
            </p>
          )}
          <label className="field">
            Subject
            <input id="draft-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="field">
            Message
            <textarea id="draft-body" ref={bodyRef} rows={11} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <Button
            variant="primary"
            size="lg"
            block
            icon={copied ? "check" : "copy"}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${subject}\n\n${body}`);
                setCopied(true);
                track("draft_copied", { kind });
              } catch {
                bodyRef.current?.select();
              }
            }}
          >
            {copied ? "Copied. Paste it into your email." : "Copy email"}
          </Button>
          <a className="btn btn-secondary btn-block" href={mailto} target="_blank" rel="noreferrer">
            <Icon name="mail" size={20} />
            Open in my email app
          </a>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void write(kind, note);
            }}
          >
            <label className="field">
              Anything to add?
              <textarea id="draft-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I'm moving house on 1 March" />
            </label>
            <Button variant="ghost" disabled={busy || !note.trim()}>
              {busy ? "Rewriting…" : "Rewrite with this"}
            </Button>
          </form>
        </>
      ) : null}
    </Sheet>
  );
}
