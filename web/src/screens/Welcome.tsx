import { useEffect, useState } from "react";
import { api, DEMO } from "../api";
import { viewerName } from "../demo/storage";
import { WelcomeArt } from "../illustrations";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

/** Value before effort (Wroblewski): one field, then straight into a timeline that already has examples on it. */
export function Welcome({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [name, setName] = useState("");
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
      const { token } = await api.signup(name.trim(), joining ? invite : undefined);
      onSignedIn(token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="welcome">
      <WelcomeArt />
      <div>
        <h1>All your household post, sorted.</h1>
        <p className="lede">Snap a letter or forward an email. We'll explain it in plain English, put what's due on one timeline, and help you deal with it.</p>
      </div>
      <ul className="promises">
        <li>
          <Icon name="calendar" />
          <span>Every bill, renewal and deadline on one calm timeline</span>
        </li>
        <li>
          <Icon name="quote" />
          <span>Plain-English summaries that show the exact line each date came from</span>
        </li>
        <li>
          <Icon name="edit" />
          <span>Cancellations, replies and complaints drafted for you</span>
        </li>
      </ul>

      <form className="card form" onSubmit={submit}>
        <label className="field">
          What should we call you?
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="given-name" placeholder="Your first name" />
        </label>
        {joining && (
          <label className="field">
            Invite code
            <input id="invite" value={invite} onChange={(e) => setInvite(e.target.value)} required autoCapitalize="none" autoComplete="off" />
            <span className="hint">Ask the person who set up your household. It's on their Household page.</span>
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <Button variant="primary" size="lg" block disabled={busy || !name.trim()}>
          {busy ? "Setting up…" : joining ? "Join household" : "Show me how it works"}
        </Button>
        <p className="hint">
          {joining ? "You'll see your household's shared timeline." : "We'll start you off with three example letters. No email or password needed yet."}
        </p>
        {!DEMO && (
          <button type="button" className="link small" onClick={() => setJoining((j) => !j)}>
            {joining ? "Start a new household instead" : "Joining someone's household?"}
          </button>
        )}
      </form>
      <p className="hint" style={{ textAlign: "center" }}>
        {DEMO ? "Demo: your documents stay private to you." : "Stored in the EU. Never used to train AI models."}
      </p>
    </main>
  );
}
