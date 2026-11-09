import { DEMO } from "../api";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Sheet } from "./Sheet";

const STEPS: { cat: string; icon: IconName; title: string; body: string }[] = [
  {
    cat: "bill",
    icon: "camera",
    title: "Add a letter",
    body: DEMO
      ? "Take a photo, upload a file or paste the text of a bill, renewal or official letter."
      : "Take a photo, upload a file, paste the text, or forward an email to your Life Admin address.",
  },
  {
    cat: "official",
    icon: "quote",
    title: "We explain it",
    body: "You get a plain-English summary, and we show the exact line each date and amount came from, so you can check it.",
  },
  {
    cat: "renewal",
    icon: "calendar",
    title: "Deal with it",
    body: "Every deadline lands on this timeline with a reminder, and we'll draft a reply, cancellation or complaint for you.",
  },
];

/** The one explanation of the app, shared by the home-page card and the info sheet. */
export function AboutContent() {
  return (
    <div className="about">
      <p className="about-lede">
        Life Admin keeps track of your household post: bills, renewals, tax letters and warranties. You'll know what's due, by when, and what to
        do about it.
      </p>
      <ol className="about-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className={`cat-${s.cat}`}>
            <span className="about-num" aria-hidden="true">
              {i + 1}
            </span>
            <span className="about-text">
              <strong>
                <Icon name={s.icon} size={18} />
                {s.title}
              </strong>
              <span>{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="hint about-note">
        <Icon name="shield" size={16} />
        {DEMO ? "The letters marked Example are there to show you around. Add your own any time." : "Stored in the EU. Never used to train AI models."}
      </p>
    </div>
  );
}

/** First-visit card on the home page. */
export function AboutCard({ onAdd, onDismiss }: { onAdd: () => void; onDismiss: () => void }) {
  return (
    <section className="card about-card" aria-labelledby="about-title">
      <h2 id="about-title">What is Life Admin?</h2>
      <AboutContent />
      <div className="row">
        <Button variant="primary" icon="plus" onClick={onAdd}>
          Add a letter
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          Got it
        </Button>
      </div>
    </section>
  );
}

export function AboutSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: () => void }) {
  return (
    <Sheet open={open} title="What is Life Admin?" onClose={onClose}>
      <AboutContent />
      <Button variant="primary" block icon="plus" onClick={onAdd}>
        Add a letter
      </Button>
    </Sheet>
  );
}

const KEY = "lifeadmin.about.hidden";
export function aboutHidden(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
export function hideAbout() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* fine for this visit */
  }
}
