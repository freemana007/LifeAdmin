import { useEffect, useState } from "react";
import { api, type Confidence, type Deadline, type Doc, type Draft, type DraftKind, type Me } from "../api";
import type { View } from "../App";
import { DOC_TYPE_LABEL, KIND_LABEL, money } from "../format";

const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "Sure", medium: "Fairly sure", low: "Please check" };

const DRAFTS: { kind: DraftKind; label: string; hint: string }[] = [
  { kind: "cancel", label: "Cancel it", hint: "Ask to end the contract or policy" },
  { kind: "negotiate", label: "Ask for a better price", hint: "Push back on a renewal" },
  { kind: "reply", label: "Reply", hint: "Answer or acknowledge" },
  { kind: "complaint", label: "Complain", hint: "Formal complaint with a deadline" },
];

function ConfidenceBadge({ c, confirmed }: { c: Confidence; confirmed: boolean }) {
  if (confirmed) return <span className="badge ok">Confirmed</span>;
  return <span className={`badge conf-${c}`}>{CONFIDENCE_LABEL[c]}</span>;
}

function DeadlineEditor({ d, me, onSaved }: { d: Deadline; me: Me; onSaved: (d: Deadline) => void }) {
  const [date, setDate] = useState(d.date.value);
  const [amount, setAmount] = useState(d.amount.value?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = date !== d.date.value || amount !== (d.amount.value?.toString() ?? "");

  async function save(extra: Parameters<typeof api.updateDeadline>[1] = {}) {
    setSaving(true);
    try {
      const patch: Parameters<typeof api.updateDeadline>[1] = { ...extra };
      if (date !== d.date.value) patch.date = date;
      if (amount !== (d.amount.value?.toString() ?? "")) patch.amount = amount === "" ? null : Number(amount);
      onSaved(await api.updateDeadline(d.id, patch));
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className={`deadline-edit ${d.done ? "done" : ""}`}>
      <div className="de-head">
        <span className="kind">{KIND_LABEL[d.kind]}</span>
        <ConfidenceBadge c={d.date.confidence} confirmed={d.date.confirmed} />
      </div>
      <p className="de-title">{d.title}</p>
      <div className="de-fields">
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Amount ({d.currency ?? "EUR"})
          <input type="number" inputMode="decimal" step="0.01" min="0" value={amount} placeholder="—" onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Owner
          <select value={d.ownerId ?? ""} onChange={(e) => void api.updateDeadline(d.id, { ownerId: e.target.value || null }).then(onSaved)}>
            <option value="">Anyone</option>
            {me.household.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === me.user.id ? "Me" : m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="de-actions">
        {(dirty || !d.date.confirmed) && (
          <button className="btn small primary" disabled={saving} onClick={() => save({ confirm: true })}>
            {dirty ? "Save" : "Looks right"}
          </button>
        )}
        <button className="btn small" onClick={() => void api.updateDeadline(d.id, { done: !d.done }).then(onSaved)}>
          {d.done ? "Mark not done" : "Mark done"}
        </button>
      </div>
    </li>
  );
}

export function DocumentDetail({ id, justCaptured, me, go }: { id: string; justCaptured?: boolean; me: Me; go: (v: View) => void }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drafting, setDrafting] = useState<DraftKind | null>(null);
  const [note, setNote] = useState("");
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    api.document(id).then(
      (r) => {
        setDoc(r.document);
        setDeadlines(r.deadlines);
      },
      (e) => setError(e.message),
    );
  }, [id]);

  async function makeDraft(kind: DraftKind) {
    setDrafting(kind);
    setDraft(null);
    try {
      setDraft(await api.draft(id, kind, note || undefined));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDrafting(null);
    }
  }

  async function remove() {
    if (!confirm("Delete this document and its deadlines?")) return;
    await api.deleteDocument(id);
    go({ name: "documents" });
  }

  if (error) return <p className="error">{error}</p>;
  if (!doc) return <p className="muted">Loading…</p>;
  const a = doc.analysis;
  const relevantDrafts = DRAFTS.filter((x) => x.kind !== "negotiate" || a.docType === "renewal" || a.docType === "bill" || a.docType === "contract");

  return (
    <section>
      <button className="back" onClick={() => go({ name: "documents" })}>
        ‹ Documents
      </button>
      {justCaptured && <p className="notice ok">Done. Here's what we found — check the dates and amounts below.</p>}

      <div className="doc-head">
        <span className={`type type-${a.docType}`}>{DOC_TYPE_LABEL[a.docType]}</span>
        {a.docTypeConfidence === "low" && <span className="badge conf-low">Unsure of type</span>}
        <h1 className="page-title">{a.title}</h1>
        <p className="muted small">
          Added {new Date(doc.createdAt).toLocaleDateString("en-IE")} {doc.uploadedByName && `by ${doc.uploadedByName}`} · via {doc.source}
          {a.engine === "heuristic" && " · basic reader"}
        </p>
      </div>

      <div className="card summary">
        <h2 className="card-title">In plain English</h2>
        <p>{a.summary}</p>
        {a.actions.length > 0 && (
          <>
            <h3>What to do</h3>
            <ul className="actions">
              {a.actions.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </>
        )}
        {a.flags.map((f, i) => (
          <p key={i} className="flag">
            {f}
          </p>
        ))}
      </div>

      <div className="card">
        <h2 className="card-title">Dates and money</h2>
        {deadlines.length === 0 ? (
          <p className="muted small">No deadlines found in this document.</p>
        ) : (
          <ul className="deadline-list">
            {deadlines.map((d) => (
              <DeadlineEditor key={d.id} d={d} me={me} onSaved={(nd) => setDeadlines((xs) => xs.map((x) => (x.id === nd.id ? nd : x)))} />
            ))}
          </ul>
        )}
        {a.amountDue && (
          <p className="small">
            Amount mentioned: <strong>{money(a.amountDue.value, a.amountDue.currency)}</strong>{" "}
            <ConfidenceBadge c={a.amountDue.confidence} confirmed={doc.status === "confirmed"} />
          </p>
        )}
      </div>

      {(a.referenceNumbers.length > 0 || a.provider || a.renewalTerms) && (
        <div className="card">
          <h2 className="card-title">Details</h2>
          <dl className="details">
            {a.provider && (
              <>
                <dt>Provider</dt>
                <dd>{a.provider}</dd>
              </>
            )}
            {a.referenceNumbers.map((r) => (
              <div key={r.label + r.value} className="dl-row">
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
      )}

      <div className="card">
        <h2 className="card-title">Act on it</h2>
        <p className="small muted">
          {me.household.plan === "premium" ? "We'll draft an email you can edit and send." : "Templates on the free plan. Premium writes tailored drafts with AI."}
        </p>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to add? e.g. “I'm moving house on 1 March”" />
        <div className="draft-buttons">
          {relevantDrafts.map((x) => (
            <button key={x.kind} className="draft-btn" disabled={drafting !== null} onClick={() => makeDraft(x.kind)}>
              <strong>{drafting === x.kind ? "Drafting…" : x.label}</strong>
              <span>{x.hint}</span>
            </button>
          ))}
        </div>
        {draft && <DraftView draft={draft} />}
      </div>

      <div className="card">
        <button className="link" onClick={() => setShowText((s) => !s)}>
          {showText ? "Hide" : "Show"} original text
        </button>
        {showText && <pre className="original">{doc.text || "(no text)"}</pre>}
      </div>

      <div className="row-end">
        {doc.status !== "confirmed" && (
          <button
            className="btn primary"
            onClick={async () => {
              setDoc(await api.updateDocument(id, { status: "confirmed" }));
              setDeadlines((xs) => xs.map((x) => ({ ...x, date: { ...x.date, confirmed: true }, amount: { ...x.amount, confirmed: true } })));
            }}
          >
            Everything looks right
          </button>
        )}
        <button className="btn danger" onClick={remove}>
          Delete
        </button>
      </div>
    </section>
  );
}

function DraftView({ draft }: { draft: Draft }) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setSubject(draft.subject);
    setBody(draft.body);
  }, [draft]);

  const mailto = `mailto:${draft.to ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <div className="draft">
      <label>
        Subject
        <input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label>
        Message
        <textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className="row-end">
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${subject}\n\n${body}`);
              setCopied(true);
            } catch {
              /* ignore */
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <a className="btn primary" href={mailto}>
          Open in email
        </a>
      </div>
      <p className="fine">{draft.engine === "claude" ? "Drafted by AI — read it before sending." : "Template — fill in anything in [brackets]."}</p>
    </div>
  );
}

