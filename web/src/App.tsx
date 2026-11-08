import { useCallback, useEffect, useState } from "react";
import { api, ApiError, DEMO, getToken, setToken, type DraftKind, type Me } from "./api";
import icon from "./icon.svg";
import { Capture } from "./screens/Capture";
import { DocumentDetail } from "./screens/DocumentDetail";
import { Documents } from "./screens/Documents";
import { Household } from "./screens/Household";
import { TimelineScreen } from "./screens/Timeline";
import { Welcome } from "./screens/Welcome";
import { Icon, type IconName } from "./ui/Icon";
import { ToastProvider, useToast } from "./ui/Toast";

export type View =
  | { name: "timeline" }
  | { name: "capture" }
  | { name: "documents" }
  | { name: "household" }
  | { name: "document"; id: string; justCaptured?: boolean; draft?: DraftKind };

const TABS: { name: View["name"]; label: string; icon: IconName }[] = [
  { name: "timeline", label: "Timeline", icon: "timeline" },
  { name: "capture", label: "Add", icon: "plus" },
  { name: "documents", label: "Library", icon: "library" },
  { name: "household", label: "Household", icon: "home" },
];

export function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(DEMO || Boolean(getToken()));
  const [view, setView] = useState<View>({ name: "timeline" });
  // Documents waiting out their undo window before they are really deleted.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toast = useToast();

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

  const go = useCallback((v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  }, []);

  const deleteDocument = useCallback(
    (id: string, title: string) => {
      setHidden((s) => new Set(s).add(id));
      go({ name: "documents" });
      const unhide = () =>
        setHidden((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      toast({
        message: `Deleted “${title}”`,
        undo: unhide,
        onExpire: () => {
          void api.deleteDocument(id).finally(() => {
            unhide();
            void refreshMe();
          });
        },
      });
    },
    [go, toast, refreshMe],
  );

  if (loading) return <div className="splash">Loading…</div>;
  if (!me) return <Welcome onSignedIn={(token) => (setToken(token), setLoading(true), void refreshMe())} />;

  const activeTab = view.name === "document" ? "documents" : view.name;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="wordmark">
          <img src={icon} alt="" width={28} height={28} />
          <span>Life Admin</span>
          {DEMO && <span className="demo-tag">Demo</span>}
        </div>
        <span className={`pill ${me.household.plan === "premium" ? "pill-premium" : ""}`}>{me.household.plan === "premium" ? "Premium" : "Free plan"}</span>
      </header>

      <main className="content" id="main">
        {view.name === "timeline" && <TimelineScreen me={me} go={go} hidden={hidden} />}
        {view.name === "capture" && <Capture me={me} go={go} onCaptured={refreshMe} />}
        {view.name === "documents" && <Documents go={go} hidden={hidden} />}
        {view.name === "document" && (
          <DocumentDetail key={view.id} id={view.id} justCaptured={view.justCaptured} openDraft={view.draft} me={me} go={go} onDelete={deleteDocument} />
        )}
        {view.name === "household" && (
          <Household me={me} onChanged={refreshMe} onSignOut={DEMO ? undefined : () => (setToken(null), setMe(null), setView({ name: "timeline" }))} />
        )}
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button
            key={t.name}
            className={`tab ${activeTab === t.name ? "active" : ""} ${t.name === "capture" ? "tab-add" : ""}`}
            onClick={() => go({ name: t.name } as View)}
            aria-current={activeTab === t.name ? "page" : undefined}
          >
            {t.name === "capture" ? (
              <span className="tab-add-disc">
                <Icon name="plus" size={24} />
              </span>
            ) : (
              <Icon name={t.icon} size={24} />
            )}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
