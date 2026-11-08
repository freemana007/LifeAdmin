import { useState } from "react";
import { api } from "../api";

export function Welcome({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.signup(name, email, joining ? invite : undefined);
      onSignedIn(token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="welcome">
      <img src="/icon.svg" alt="" width={56} height={56} />
      <h1>Household admin, sorted.</h1>
      <p className="lede">
        Snap a letter or forward an email. We explain it in plain English, put the deadlines and money on one timeline, and help you
        reply, cancel or switch.
      </p>
      <ul className="welcome-points">
        <li>Bills, renewals, Revenue letters, warranties</li>
        <li>Reminders before things are due</li>
        <li>Shared with your household</li>
      </ul>

      <form className="card form" onSubmit={submit}>
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="check">
          <input type="checkbox" checked={joining} onChange={(e) => setJoining(e.target.checked)} />
          I have an invite code from my household
        </label>
        {joining && (
          <label>
            Invite code
            <input value={invite} onChange={(e) => setInvite(e.target.value)} required autoCapitalize="none" />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? "Setting up…" : joining ? "Join household" : "Get started"}
        </button>
        <p className="fine">Your documents are stored in the EU and never used to train AI models.</p>
      </form>
    </div>
  );
}
