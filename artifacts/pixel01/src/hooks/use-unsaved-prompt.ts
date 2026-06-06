import { useEffect, useRef } from "react";
import { useBlocker } from "@tanstack/react-router";

/**
 * Warns the user before leaving the page (browser nav or in-app routing)
 * when there are unsaved changes.
 *
 * Accepts either a boolean or a getter function. The getter is called
 * lazily at navigation time so that refs (e.g. `submittedRef.current`)
 * updated synchronously inside a submit handler are honored without
 * needing to trigger a re-render before navigating.
 */
export function useUnsavedChangesPrompt(
  isDirty: boolean | (() => boolean),
  message: string = "هناك تغييرات غير محفوظة، هل تريد الخروج؟"
) {
  const ref = useRef(isDirty);
  ref.current = isDirty;

  const check = () => {
    const v = ref.current;
    return typeof v === "function" ? !!v() : !!v;
  };

  // Browser refresh / close
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!check()) return;
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  // In-app navigation (TanStack Router)
  useBlocker({
    shouldBlockFn: () => {
      if (!check()) return false;
      return !window.confirm(message);
    },
    enableBeforeUnload: false,
  });
}
