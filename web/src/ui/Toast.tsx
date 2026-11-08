import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export interface ToastSpec {
  message: string;
  /** Shown as an Undo button; called if pressed before the toast times out. */
  undo?: () => void;
  /** Any other single action, e.g. Retry after an error. */
  action?: { label: string; icon?: IconName; run: () => void };
  /** Called when the toast times out without undo (e.g. to commit a delete). */
  onExpire?: () => void;
  tone?: "default" | "error";
  duration?: number;
}

const Ctx = createContext<(t: ToastSpec) => void>(() => {});
export const useToast = () => useContext(Ctx);

/** Single toast at a time, announced to screen readers. Undo is the forgiving default (Norman). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastSpec & { id: number }) | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const current = useRef<(ToastSpec & { id: number }) | null>(null);

  const finish = useCallback((choice: "undo" | "action" | "expire" | "dismiss") => {
    const t = current.current;
    window.clearTimeout(timer.current);
    current.current = null;
    setToast(null);
    if (!t) return;
    if (choice === "undo") t.undo?.();
    else if (choice === "action") t.action?.run();
    else t.onExpire?.();
  }, []);

  const show = useCallback(
    (spec: ToastSpec) => {
      if (current.current) finish("expire"); // commit the previous one
      const t = { ...spec, id: Date.now() + Math.random() };
      current.current = t;
      setToast(t);
      const ms = spec.duration ?? (spec.tone === "error" ? 8000 : spec.undo || spec.action ? 5000 : 3000);
      timer.current = window.setTimeout(() => finish("expire"), ms);
    },
    [finish],
  );

  useEffect(() => {
    // Commit pending actions if the page is hidden or closed.
    const flush = () => current.current && finish("expire");
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [finish]);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast-region" role={toast?.tone === "error" ? "alert" : "status"} aria-live={toast?.tone === "error" ? "assertive" : "polite"}>
        {toast && (
          <div className={`toast ${toast.tone === "error" ? "toast-error" : ""}`} key={toast.id}>
            {toast.tone === "error" && <Icon name="alert" size={20} />}
            <span>{toast.message}</span>
            {toast.undo && (
              <button className="toast-btn" onClick={() => finish("undo")}>
                <Icon name="undo" size={18} />
                Undo
              </button>
            )}
            {toast.action && (
              <button className="toast-btn" onClick={() => finish("action")}>
                {toast.action.icon && <Icon name={toast.action.icon} size={18} />}
                {toast.action.label}
              </button>
            )}
            {!toast.undo && !toast.action && toast.tone === "error" && (
              <button className="toast-btn" aria-label="Dismiss" onClick={() => finish("dismiss")}>
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
