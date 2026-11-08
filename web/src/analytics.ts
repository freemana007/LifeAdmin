/**
 * Product metrics from the plan: activation (documents in week one), AI
 * accuracy (confirm vs correct), and value (drafts used, deadlines handled).
 * A no-op unless VITE_ANALYTICS_URL is set; never sends document contents.
 */
export type EventName = "doc_captured" | "fact_confirmed" | "fact_corrected" | "draft_copied" | "deadline_done" | "example_tried";

const URL_ = import.meta.env.VITE_ANALYTICS_URL as string | undefined;

export function track(event: EventName, props: Record<string, string | number | boolean> = {}) {
  if (!URL_) return;
  try {
    const body = JSON.stringify({ event, props, at: new Date().toISOString() });
    if (!navigator.sendBeacon?.(URL_, body)) void fetch(URL_, { method: "POST", body, keepalive: true });
  } catch {
    /* analytics must never break the app */
  }
}
