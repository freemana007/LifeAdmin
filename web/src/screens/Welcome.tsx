import { useEffect, useState } from "react";
import { api, DEMO } from "../api";
import { viewerName } from "../demo/storage";
import icon from "../icon.svg";

export function Welcome({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (DEMO) void viewerName().then((n) => n && setName((cur) => cur || n));
  }, []);

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
      <img src={icon} alt="" width={56} height={56} />
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
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        </label>
        {!DEMO && (
          <>
            <label>
              Email
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </label>
            <label className="check">
              <input id="joining" type="checkbox" checked={joining} onChange={(e) => setJoining(e.target.checked)} />
              I have an invite code from my household
            </label>
          </>
        )}
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
        <p className="fine">
          {DEMO
            ? "This is a demo. We'll add three example letters so you can see how it works; add your own whenever you like."
            : "Your documents are stored in the EU and never used to train AI models."}
        </p>
      </form>
    </div>
  );
}
