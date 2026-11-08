import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

interface ToastSpec {
  message: string;
  /** Shown as a button; called if pressed before the toast times out. */
  undo?: () => void;
  /** Called when the toast times out without undo (e.g. to commit a delete). */
  onExpire?: () => void;
  duration?: number;
}

const Ctx = createContext<(t: ToastSpec) => void>(() => {});
export const useToast = () => useContext(Ctx);

/** Single toast at a time, announced politely to screen readers. Undo is the forgiving default (Norman). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastSpec & { id: number }) | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const current = useRef<(ToastSpec & { id: number }) | null>(null);

  const finish = useCallback((undo: boolean) => {
    const t = current.current;
    window.clearTimeout(timer.current);
    current.current = null;
    setToast(null);
    if (!t) return;
    if (undo) t.undo?.();
    else t.onExpire?.();
  }, []);

  const show = useCallback(
    (spec: ToastSpec) => {
      if (current.current) finish(false); // commit the previous one
      const t = { ...spec, id: Date.now() };
      current.current = t;
      setToast(t);
      timer.current = window.setTimeout(() => finish(false), spec.duration ?? (spec.undo ? 5000 : 3000));
    },
    [finish],
  );

  useEffect(() => {
    // Commit pending actions if the page is hidden or closed.
    const flush = () => current.current && finish(false);
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [finish]);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            <span>{toast.message}</span>
            {toast.undo && (
              <button className="toast-undo" onClick={() => finish(true)}>
                <Icon name="undo" size={18} />
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
