import type { ReactNode } from "react";
import type { Confidence } from "../api";
import { money } from "../format";

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
