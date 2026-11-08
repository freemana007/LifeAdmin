import { useRef, useState } from "react";
import { api, DEMO, type Me } from "../api";
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
  const photos = !DEMO || Boolean(me.demo?.photos);
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

      {photos ? (
        <div className="capture-grid">
          <button className="capture-option" onClick={() => photoRef.current?.click()}>
            <svg className="co-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
            <strong>Take a photo</strong>
            <span>Letters and paper bills</span>
          </button>
          <button className="capture-option" onClick={() => fileRef.current?.click()}>
            <svg className="co-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 3h7l5 5v13H7zM14 3v5h5M12 11v6M9 14l3-3 3 3" />
            </svg>
            <strong>Upload a file</strong>
            <span>{DEMO ? "Photo or text file" : "PDF or image"}</span>
          </button>
        </div>
      ) : (
        <p className="notice">Reading photos needs Claude, which isn't available in this view. Paste the text of a letter or email below instead.</p>
      )}
      <input id="photo" ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => sendFile(e.target.files?.[0])} />
      <input id="upload" ref={fileRef} type="file" accept={DEMO ? "image/*,text/plain" : "application/pdf,image/*,text/plain"} hidden onChange={(e) => sendFile(e.target.files?.[0])} />

      {!DEMO && <div className="card">
        <h2 className="card-title">Forward emails</h2>
        <p className="small">Forward bills and renewal emails to your personal address and they'll appear here automatically.</p>
        <div className="inbox">
          <code>{me.user.inboxAddress}</code>
          <button className="btn small" onClick={copyAddress}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>}

      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) sendText(text);
        }}
      >
        <h2 className="card-title">Or paste the text</h2>
        <textarea id="paste" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste an email or the text of a letter…" />
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
