import { useCallback, useEffect, useState } from "react";
import { api, ApiError, DEMO, getToken, setToken, type Me } from "./api";
import icon from "./icon.svg";
import { Capture } from "./screens/Capture";
import { DocumentDetail } from "./screens/DocumentDetail";
import { Documents } from "./screens/Documents";
import { Household } from "./screens/Household";
import { TimelineScreen } from "./screens/Timeline";
import { Welcome } from "./screens/Welcome";

export type View =
  | { name: "timeline" }
  | { name: "capture" }
  | { name: "documents" }
  | { name: "household" }
  | { name: "document"; id: string; justCaptured?: boolean };

const TABS: { name: View["name"]; label: string; icon: string }[] = [
  { name: "timeline", label: "Timeline", icon: "M4 6h16M4 12h10M4 18h13" },
  { name: "capture", label: "Add", icon: "M12 5v14M5 12h14" },
  { name: "documents", label: "Documents", icon: "M7 3h7l5 5v13H7zM14 3v5h5" },
  { name: "household", label: "Household", icon: "M3 11l9-7 9 7v9H3zM9 20v-6h6v6" },
];

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(DEMO || Boolean(getToken()));
  const [view, setView] = useState<View>({ name: "timeline" });

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        setMe(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (DEMO || getToken()) void refreshMe();
  }, [refreshMe]);

  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };

  if (loading) return <div className="splash">Loading…</div>;
  if (!me) return <Welcome onSignedIn={(token) => (setToken(token), setLoading(true), void refreshMe())} />;

  const activeTab = view.name === "document" ? "documents" : view.name;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src={icon} alt="" width={28} height={28} />
          <span>Life Admin</span>
          {DEMO && <span className="demo-tag">Demo</span>}
        </div>
        <span className={`plan plan-${me.household.plan}`}>{me.household.plan === "premium" ? "Premium" : "Free"}</span>
      </header>

      <main className="content">
        {view.name === "timeline" && <TimelineScreen me={me} go={go} />}
        {view.name === "capture" && <Capture me={me} go={go} onCaptured={refreshMe} />}
        {view.name === "documents" && <Documents go={go} />}
        {view.name === "document" && <DocumentDetail id={view.id} justCaptured={view.justCaptured} me={me} go={go} />}
        {view.name === "household" && (
          <Household me={me} onChanged={refreshMe} onSignOut={DEMO ? undefined : () => (setToken(null), setMe(null), setView({ name: "timeline" }))} />
        )}
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button
            key={t.name}
            className={`tab ${activeTab === t.name ? "active" : ""} ${t.name === "capture" ? "tab-primary" : ""}`}
            onClick={() => go({ name: t.name } as View)}
            aria-current={activeTab === t.name ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d={t.icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
