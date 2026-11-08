import { useEffect, useRef, useState } from "react";
import { track } from "../analytics";
import { api, DEMO, type Deadline, type Doc, type Me } from "../api";
import type { View } from "../App";
import { money } from "../format";
import { ReadingArt } from "../illustrations";
import { SAMPLES } from "../samples";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

const STAGES = ["Reading the letter", "Finding dates and deadlines", "Finding amounts and reference numbers", "Writing a plain-English summary"];
const MAX_PAGES = 6;

type Phase = { kind: "idle" } | { kind: "reading"; stage: number } | { kind: "found"; doc: Doc; deadlines: Deadline[] };

export function Capture({ me, go, onCaptured }: { me: Me; go: (v: View) => void; onCaptured: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [pages, setPages] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const h = me.household;
  const photos = !DEMO || Boolean(me.demo?.photos);
  const remaining = h.plan === "premium" ? null : Math.max(0, h.freeLimit - h.docsThisMonth);

  async function send(form: FormData, example = false) {
    setError(null);
    setPhase({ kind: "reading", stage: 0 });
    // Honest progress: these are the steps the reader takes, paced so each one is readable.
    STAGES.forEach((_, i) => i && timers.current.push(window.setTimeout(() => setPhase((p) => (p.kind === "reading" ? { kind: "reading", stage: i } : p)), i * 900)));
    try {
      // Keep the reading screen up long enough to read, even when the offline reader answers instantly.
      const [{ document, deadlines }] = await Promise.all([api.capture(form), new Promise((r) => setTimeout(r, 1200))]);
      timers.current.forEach(clearTimeout);
      track(example ? "example_tried" : "doc_captured", { source: document.source, engine: document.analysis.engine });
      onCaptured();
      setPhase({ kind: "found", doc: document, deadlines });
      timers.current.push(window.setTimeout(() => go({ name: "document", id: document.id, justCaptured: true }), 1400));
    } catch (err) {
      timers.current.forEach(clearTimeout);
      setPhase({ kind: "idle" });
      setError((err as Error).message);
    }
  }

  function readPages() {
    const form = new FormData();
    for (const p of pages) form.append("file", p);
    void send(form);
    setPages([]);
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list);
    const nonImage = files.find((f) => !f.type.startsWith("image/"));
    if (nonImage) {
      const form = new FormData();
      form.append("file", nonImage);
      void send(form);
      return;
    }
    setPages((p) => [...p, ...files].slice(0, MAX_PAGES));
  }

  if (phase.kind === "reading") {
    return (
      <div className="reading" role="status" aria-live="polite">
        <ReadingArt />
        <h2>Reading your letter</h2>
        <ol className="stages">
          {STAGES.map((s, i) => (
            <li key={s} className={i < phase.stage ? "done" : i === phase.stage ? "on" : ""}>
              {i < phase.stage ? <Icon name="check" size={18} /> : <span style={{ width: 18, display: "inline-block" }} aria-hidden="true">{i === phase.stage ? "…" : ""}</span>}
              {s}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (phase.kind === "found") {
    const dates = phase.deadlines.length;
    const amount = phase.doc.analysis.amountDue;
    return (
      <div className="reading found" role="status" aria-live="polite">
        <span className="avatar" style={{ width: 56, height: 56 }}>
          <Icon name="check" size={28} />
        </span>
        <h2>{phase.doc.analysis.title}</h2>
        <p className="muted">
          Found {dates === 0 ? "no dates" : dates === 1 ? "1 date" : `${dates} dates`}
          {amount ? ` and ${money(amount.value, amount.currency)}` : ""}. Opening it now…
        </p>
      </div>
    );
  }

  return (
    <section className="stack">
      <div>
        <h1 className="headline">Add a document</h1>
        {remaining !== null && (
          <p className="small muted">
            {remaining} of {h.freeLimit} free documents left this month
          </p>
        )}
      </div>
      {error && <p className="error">{error}</p>}

      {pages.length > 0 ? (
        <div className="card stack">
          <h2 className="card-title">{pages.length === 1 ? "1 page" : `${pages.length} pages`} ready</h2>
          <div className="pages">
            {pages.map((p, i) => (
              <Thumb key={i} file={p} index={i} onRemove={() => setPages((ps) => ps.filter((_, j) => j !== i))} />
            ))}
          </div>
          <div className="row">
            <Button variant="primary" size="lg" icon="sparkle" onClick={readPages}>
              Read this letter
            </Button>
            {pages.length < MAX_PAGES && (
              <Button variant="secondary" icon="camera" onClick={() => photoRef.current?.click()}>
                Add a page
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          {photos ? (
            <button className="capture-primary" onClick={() => photoRef.current?.click()}>
              <Icon name="camera" />
              <span>
                <strong>Take a photo</strong>
                <span>Letters and paper bills. Several pages are fine.</span>
              </span>
            </button>
          ) : (
            <p className="flag">
              <Icon name="sparkle" size={18} />
              <span>Reading photos needs Claude, which isn't available in this view. Paste the text of a letter or email instead.</span>
            </p>
          )}

          <div className="capture-list">
            <button className="capture-option" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" />
              <span className="grow">
                <strong>Upload a file</strong>
                <span>{DEMO ? "A photo or text file" : "A PDF, photo or text file"}</span>
              </span>
              <Icon name="chevron" />
            </button>
            <button className="capture-option" aria-expanded={pasteOpen} onClick={() => setPasteOpen((o) => !o)}>
              <Icon name="paste" />
              <span className="grow">
                <strong>Paste text</strong>
                <span>From an email or a website</span>
              </span>
              <Icon name="chevron" className={pasteOpen ? "rot90" : ""} />
            </button>
            {pasteOpen && (
              <form
                className="card form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!text.trim()) return;
                  const form = new FormData();
                  form.append("text", text);
                  void send(form);
                }}
              >
                <label className="field">
                  The text of the letter or email
                  <textarea id="paste" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste here…" />
                </label>
                <Button variant="primary" icon="sparkle" disabled={!text.trim()}>
                  Read this
                </Button>
              </form>
            )}
          </div>

          {!DEMO && me.user.inboxAddress && (
            <div className="card stack-sm">
              <div className="row">
                <Icon name="mail" />
                <h2 className="card-title">Forward emails</h2>
              </div>
              <p className="small muted">Send bills and renewal emails here and they'll appear on your timeline by themselves.</p>
              <div className="inbox">
                <code>{me.user.inboxAddress}</code>
                <Button
                  size="sm"
                  icon={copied ? "check" : "copy"}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(me.user.inboxAddress);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      /* address is selectable */
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          )}

          <div className="stack-sm">
            <p className="small muted">No post to hand? Try an example:</p>
            <div className="choice-chips">
              {SAMPLES.map((s) => (
                <button
                  key={s.label}
                  className="choice"
                  onClick={() => {
                    const form = new FormData();
                    form.append("text", s.text);
                    void send(form, true);
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <input id="photo" ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
      <input
        id="upload"
        ref={fileRef}
        type="file"
        multiple
        accept={DEMO ? "image/*,text/plain" : "application/pdf,image/*,text/plain"}
        hidden
        onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))}
      />
    </section>
  );
}

function Thumb({ file, index, onRemove }: { file: File; index: number; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="page-thumb">
      {url && <img src={url} alt={`Page ${index + 1}`} />}
      <button onClick={onRemove} aria-label={`Remove page ${index + 1}`}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
