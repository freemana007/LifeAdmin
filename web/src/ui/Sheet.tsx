import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

/** Bottom sheet: thumb-reachable on phones, centred card on wide screens. Esc and scrim close it. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<Element | null>(null);
  // Keep the latest onClose without re-running the open/close effect on every parent render.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    // Focus the title, not an input: on phones focusing a field pops the keyboard or date picker.
    heading.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab" && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, textarea");
        if (!items.length) return;
        const firstEl = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("sheet-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("sheet-open");
      const el = opener.current as HTMLElement | null;
      if (el && document.contains(el)) el.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="sheet-layer">
      <div className="sheet-scrim" onClick={() => close.current()} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <h2 ref={heading} tabIndex={-1}>
            {title}
          </h2>
          <button className="sheet-close" onClick={() => close.current()} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
