import { useState } from "react";
import { api, type Me } from "../api";

export function Household({ me, onChanged, onSignOut }: { me: Me; onChanged: () => void; onSignOut: () => void }) {
  const h = me.household;
  const [name, setName] = useState(h.name);
  const [busy, setBusy] = useState(false);
  const calendarUrl = `${location.origin}/api/calendar/${me.user.calendarToken}.ics`;

  async function update(patch: Parameters<typeof api.updateHousehold>[0]) {
    setBusy(true);
    try {
      await api.updateHousehold(patch);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1 className="page-title">Household</h1>

      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          void update({ name });
        }}
      >
        <label>
          Household name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {name !== h.name && (
          <button className="btn small primary" disabled={busy}>
            Save
          </button>
        )}
      </form>

      <div className="card">
        <h2 className="card-title">Members</h2>
        <ul className="members">
          {h.members.map((m) => (
            <li key={m.id}>
              <span className="avatar" aria-hidden="true">
                {m.name.slice(0, 1).toUpperCase()}
              </span>
              <span>
                {m.name} {m.id === me.user.id && <span className="muted">(you)</span>}
                <br />
                <span className="muted small">{m.email}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="small">
          Invite a partner, family member or someone you manage admin for. They sign up with this code:
        </p>
        <div className="inbox">
          <code>{h.inviteCode}</code>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Calendar</h2>
        <p className="small">Subscribe in Google, Outlook or Apple Calendar to see every deadline there too.</p>
        <div className="inbox">
          <code className="wrap">{calendarUrl}</code>
        </div>
        <a className="btn small" href={calendarUrl.replace(/^https?:/, "webcal:")}>
          Subscribe
        </a>
      </div>

      <div className="card">
        <h2 className="card-title">Plan</h2>
        {h.plan === "premium" ? (
          <>
            <p className="small">Premium: unlimited documents, AI drafting and household sharing.</p>
            <button className="btn small" disabled={busy} onClick={() => update({ plan: "free" })}>
              Switch to Free
            </button>
          </>
        ) : (
          <>
            <p className="small">
              Free: {h.docsThisMonth} of {h.freeLimit} documents used this month, with basic reminders.
            </p>
            <p className="small">
              <strong>Premium, €4.99 a month:</strong> unlimited documents, AI-written replies and cancellations, household sharing.
            </p>
            <button className="btn primary" disabled={busy} onClick={() => update({ plan: "premium" })}>
              Try Premium
            </button>
            <p className="fine">Prototype: no payment is taken.</p>
          </>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">Privacy</h2>
        <p className="small">
          Your documents are stored encrypted in the EU. They're only used to help you, never to train AI models. You can delete any
          document at any time.
        </p>
        <p className="small muted">Reader: {me.ai === "claude" ? "AI (Claude)" : "basic offline reader"}</p>
      </div>

      <button className="btn" onClick={onSignOut}>
        Sign out
      </button>
    </section>
  );
}
