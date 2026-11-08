import { useRef, useState } from "react";
import { api, type Me } from "../api";
import type { View } from "../App";
import { SAMPLES } from "../samples";

export function Capture({ me, go, onCaptured }: { me: Me; go: (v: View) => void; onCaptured: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const h = me.household;
  const remaining = h.plan === "premium" ? null : Math.max(0, h.freeLimit - h.docsThisMonth);

  async function send(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const { document } = await api.capture(form);
      onCaptured();
      go({ name: "document", id: document.id, justCaptured: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function sendFile(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    void send(form);
  }

  function sendText(t: string) {
    const form = new FormData();
    form.append("text", t);
    void send(form);
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(me.user.inboxAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; address is selectable */
    }
  }

  if (busy) {
    return (
      <div className="reading">
        <div className="spinner" aria-hidden="true" />
        <h2>Reading your document…</h2>
        <p className="muted">Working out what it is, what you need to do, and by when.</p>
      </div>
    );
  }

  return (
    <section>
      <h1 className="page-title">Add a document</h1>
      {remaining !== null && (
        <p className="muted small">
          {remaining} of {h.freeLimit} free documents left this month.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <div className="capture-grid">
        <button className="capture-option" onClick={() => photoRef.current?.click()}>
          <span className="co-icon" aria-hidden="true">📷</span>
          <strong>Take a photo</strong>
          <span>Letters and paper bills</span>
        </button>
        <button className="capture-option" onClick={() => fileRef.current?.click()}>
          <span className="co-icon" aria-hidden="true">📄</span>
          <strong>Upload a file</strong>
          <span>PDF or image</span>
        </button>
      </div>
      <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => sendFile(e.target.files?.[0])} />
      <input ref={fileRef} type="file" accept="application/pdf,image/*,text/plain" hidden onChange={(e) => sendFile(e.target.files?.[0])} />

      <div className="card">
        <h2 className="card-title">Forward emails</h2>
        <p className="small">Forward bills and renewal emails to your personal address and they'll appear here automatically.</p>
        <div className="inbox">
          <code>{me.user.inboxAddress}</code>
          <button className="btn small" onClick={copyAddress}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) sendText(text);
        }}
      >
        <h2 className="card-title">Or paste the text</h2>
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste an email or the text of a letter…" />
        <button className="btn primary" disabled={!text.trim()}>
          Understand this
        </button>
      </form>

      <div className="card">
        <h2 className="card-title">Try a sample</h2>
        <div className="chips">
          {SAMPLES.map((s) => (
            <button key={s.label} className="chip" onClick={() => sendText(s.text)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
