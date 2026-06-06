import { useEffect } from "react";

export type FormHotkeyHandlers = {
  onFocusSearch?: () => void;
  onSave?: () => void;
  onClear?: () => void;
};

export function useFormHotkeys(h: FormHotkeyHandlers, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inOpenDialog = !!target?.closest('[role="dialog"]');

      if (e.key === "F4") {
        e.preventDefault();
        h.onFocusSearch?.();
        return;
      }
      // Ctrl+S / Cmd+S
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
        e.preventDefault();
        if (!inOpenDialog) h.onSave?.();
        return;
      }
      if (e.key === "Escape" && !inOpenDialog) {
        h.onClear?.();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, h]);
}
