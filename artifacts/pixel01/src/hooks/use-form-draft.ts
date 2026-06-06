import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";

/**
 * Persists form state to localStorage so an in-progress invoice/purchase/expense
 * survives a tab close, network outage, or power cut. Cleared after successful save.
 */
export function useFormDraft<T>(
  key: string,
  state: T,
  setState: (v: T) => void,
  options?: { enabled?: boolean; debounceMs?: number; suffix?: string },
) {
  const { user } = useAuth();
  const enabled = options?.enabled ?? true;
  const debounceMs = options?.debounceMs ?? 500;
  const storageKey = user ? `draft:${user.id}:${key}${options?.suffix ? `:${options.suffix}` : ""}` : null;

  const [restored, setRestored] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const skipNextSave = useRef(true);

  // Load on mount
  useEffect(() => {
    if (!storageKey || !enabled || restored) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        skipNextSave.current = true;
        setState(parsed);
        setHasDraft(true);
      }
    } catch {}
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, enabled]);

  // Save (debounced)
  useEffect(() => {
    if (!storageKey || !enabled || !restored) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {}
    }, debounceMs);
    return () => window.clearTimeout(id);
  }, [storageKey, enabled, restored, state, debounceMs]);

  const clear = () => {
    if (!storageKey) return;
    try { localStorage.removeItem(storageKey); } catch {}
    setHasDraft(false);
  };

  const dismiss = () => {
    clear();
  };

  return { hasDraft, clear, dismiss, restored };
}
