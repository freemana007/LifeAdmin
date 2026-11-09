import { useCallback } from "react";
import { ApiError } from "../apiError";
import { StorageError } from "../demo/storage";
import { useToast } from "./Toast";

/** Turns any failure into a sentence a person can act on, keeping the technical code for support. */
export function describeError(e: unknown): string {
  if (e instanceof StorageError) return e.message;
  if (e instanceof ApiError) {
    if (e.status === 0 || e.status >= 500) return "We couldn't reach Life Admin. Check your connection and try again.";
    return e.message;
  }
  if (e && typeof e === "object" && "code" in e && "message" in e) return `Something went wrong (${String((e as { code: unknown }).code)}). Try again.`;
  const msg = e instanceof Error ? e.message : String(e);
  if (/fetch|network/i.test(msg)) return "We couldn't reach Life Admin. Check your connection and try again.";
  return `Something went wrong: ${msg}`;
}

/**
 * Runs a user action. On failure it undoes the optimistic change, explains
 * what happened in a toast and offers Retry, so a button never just "breaks".
 */
export function useAction() {
  const toast = useToast();
  const run = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      opts: { rollback?: () => void; retryable?: boolean; /** Repeats the whole action, including its on-screen change. */ retry?: () => void } = {},
    ): Promise<T | undefined> => {
      try {
        return await fn();
      } catch (e) {
        console.error("[life-admin] action failed", e);
        opts.rollback?.();
        toast({
          tone: "error",
          message: describeError(e),
          action: opts.retryable === false ? undefined : { label: "Retry", icon: "retry", run: () => (opts.retry ? opts.retry() : void run(fn, opts)) },
        });
        return undefined;
      }
    },
    [toast],
  );
  return run;
}
