import type { ReactNode } from "react";
import type { Confidence } from "../api";
import { initials, money, type Category } from "../format";

const CONF_TEXT: Record<Confidence, string> = { high: "Clear in the letter", medium: "Likely right", low: "Worth checking" };

/** Confidence in words people use, never a percentage (Teleanu: understandable AI). */
export function ConfidenceChip({ confidence, confirmed }: { confidence: Confidence; confirmed: boolean }) {
  if (confirmed) return <span className="chip-conf conf-confirmed">Confirmed</span>;
  return <span className={`chip-conf conf-${confidence}`}>{CONF_TEXT[confidence]}</span>;
}

/** A tear-off calendar stamp: the date is the most important fact on most letters. */
export function DateStamp({ iso, tone = "default" }: { iso: string; tone?: "default" | "muted" | "past" }) {
  const d = new Date(`${iso}T00:00:00Z`);
  const month = d.toLocaleDateString("en-IE", { month: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  const weekday = d.toLocaleDateString("en-IE", { weekday: "short", timeZone: "UTC" });
  return (
    <span className={`stamp stamp-${tone}`}>
      <span className="sr-only">{d.toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</span>
      <span className="stamp-month" aria-hidden="true">{month}</span>
      <span className="stamp-day" aria-hidden="true">{day}</span>
      <span className="stamp-weekday" aria-hidden="true">{weekday}</span>
    </span>
  );
}

export function Money({ value, currency }: { value: number; currency?: string | null }) {
  return <span className="money">{money(value, currency ?? "EUR")}</span>;
}

export function EmptyState({ art, title, children, action }: { art: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-art">{art}</div>
      <h2>{title}</h2>
      {children && <div className="empty-body">{children}</div>}
      {action}
    </div>
  );
}

/** A coloured tile with the sender's initials: makes each provider recognisable at a glance. */
export function ProviderBadge({ name, cat, size = "md" }: { name: string | null | undefined; cat: Category; size?: "sm" | "md" | "lg" }) {
  const text = initials(name);
  return (
    <span className={`badge-provider size-${size} cat-${cat} ${text.length > 2 ? "is-long" : ""}`} aria-hidden="true">
      {text}
    </span>
  );
}

/** "3 of 5 sorted": progress on the household's own admin, not on app usage. */
export function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress">
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={label}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="progress-label">
        <strong>
          {done} of {total}
        </strong>{" "}
        {label}
      </span>
    </div>
  );
}
