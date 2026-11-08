import { useState } from "react";
import { api, DEMO, type Me } from "../api";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

export function Household({ me, onChanged, onSignOut }: { me: Me; onChanged: () => void; onSignOut?: () => void }) {
  const h = me.household;
  const [name, setName] = useState(h.name);
  const [email, setEmail] = useState(me.user.email);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const calendarUrl = `${location.origin}/api/calendar/${me.user.calendarToken}.ics`;

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setSaved(done);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack">
      <h1 className="headline">Household</h1>
      {error && <p className="error">{error}</p>}
      {saved && (
        <p className="notice ok" role="status">
          <Icon name="check" />
          <span>{saved}</span>
        </p>
      )}

      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => api.updateHousehold({ name }), "Household name saved.");
        }}
      >
        <label className="field">
          Household name
          <input id="household-name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {name !== h.name && (
          <Button variant="primary" size="sm" disabled={busy}>
            Save name
          </Button>
        )}
      </form>

      <div className="card stack">
        <h2>Who's in it</h2>
        <ul className="members">
          {h.members.map((m) => (
            <li key={m.id}>
              <span className="avatar" aria-hidden="true">
                {m.name.slice(0, 1).toUpperCase()}
              </span>
              <span>
                {m.name} {m.id === me.user.id && <span className="muted">(you)</span>}
                {m.email && (
                  <>
                    <br />
                    <span className="small muted">{m.email}</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        {DEMO ? (
          <p className="small muted">Sharing with a partner or family member, with someone in charge of each deadline, is part of the full app.</p>
        ) : (
          <div className="stack-sm">
            <p className="small">Invite a partner, family member, or someone you look after admin for. They choose “Joining someone's household?” and enter:</p>
            <div className="inbox">
              <code>{h.inviteCode}</code>
            </div>
          </div>
        )}
      </div>

      <div className="card stack">
        <h2>Reminders</h2>
        <p className="small">
          One short summary a day, only when something is coming up. Nothing between 9pm and 8am. No streaks, no nagging.
        </p>
        {!DEMO && (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api.updateMe({ email }), email ? "Reminders will go to " + email + "." : "Email reminders turned off.");
            }}
          >
            <label className="field">
              Send reminders to
              <input id="reminder-email" type="email" autoComplete="email" value={email} placeholder="you@example.ie" onChange={(e) => setEmail(e.target.value)} />
              <span className="hint">Optional. Leave empty to only see them in the app.</span>
            </label>
            {email !== me.user.email && (
              <Button variant="primary" size="sm" disabled={busy}>
                Save
              </Button>
            )}
          </form>
        )}
        {!DEMO && (
          <div className="stack-sm">
            <p className="small">Or see every deadline in Google, Outlook or Apple Calendar:</p>
            <div className="inbox">
              <code className="small">{calendarUrl}</code>
            </div>
            <a className="btn btn-secondary btn-sm" href={calendarUrl.replace(/^https?:/, "webcal:")}>
              <Icon name="calendar" size={18} />
              Subscribe in my calendar
            </a>
          </div>
        )}
      </div>

      <div className="card stack">
        <h2>Plan</h2>
        {h.plan === "premium" ? (
          <>
            <p className="small">Premium: unlimited documents and emails written for each letter.</p>
            <Button size="sm" disabled={busy} onClick={() => run(() => api.updateHousehold({ plan: "free" }), "Switched to the free plan.")}>
              Switch to Free
            </Button>
          </>
        ) : (
          <>
            <p className="small">
              Free: {h.docsThisMonth} of {h.freeLimit} documents used this month. Examples don't count.
            </p>
            <p className="small">
              <strong>Premium, €4.99 a month:</strong> unlimited documents, cancellations and replies written for each letter, household sharing.
            </p>
            <Button variant="primary" disabled={busy} onClick={() => run(() => api.updateHousehold({ plan: "premium" }), "Premium is on.")}>
              Try Premium
            </Button>
            <p className="hint">Prototype: no payment is taken.</p>
          </>
        )}
      </div>

      <div className="card stack-sm">
        <div className="row">
          <Icon name="shield" />
          <h2>Privacy</h2>
        </div>
        {me.demo ? (
          <p className="small">
            {me.demo.storage === "account"
              ? "Your documents are saved privately to your claude.ai account. Nobody else who opens this page can see them."
              : "Your documents are saved in this browser only."}
          </p>
        ) : (
          <p className="small">Stored encrypted in the EU. Only used to help you, never to train AI models. Delete anything, any time.</p>
        )}
        <p className="small muted">Letters are read by {me.ai === "claude" ? "Claude" : "the basic offline reader"}.</p>
      </div>

      {onSignOut && (
        <Button variant="ghost" onClick={onSignOut}>
          Sign out
        </Button>
      )}
    </section>
  );
}
