import { useEffect } from "react";

export type CashierHotkeyHandlers = {
  onCash?: () => void;
  onCard?: () => void;
  onCredit?: () => void;
  onCancel?: () => void;
  onDraft?: () => void;
  onMultiPay?: () => void;
  onSuspend?: () => void;
  onQuotation?: () => void;
  onQuickItems?: () => void;
  onDiscount?: () => void;
  onTax?: () => void;
  onFocusSearch?: () => void;
  onFocusLastQty?: () => void;
};

export function useCashierHotkeys(h: CashierHotkeyHandlers, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Only skip when typing inside an OPEN dialog (modal). Outside dialogs the
      // global hotkeys always fire, even when an input/select is focused.
      const inOpenDialog = !!target?.closest('[role="dialog"]');

      // F-keys always work
      if (e.key === "F4") {
        e.preventDefault();
        h.onFocusSearch?.();
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        h.onFocusLastQty?.();
        return;
      }
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyS") {
        e.preventDefault();
        if (inOpenDialog) return;
        h.onCash?.();
        return;
      }
      // Cashier action shortcuts with Ctrl/Cmd
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        if (inOpenDialog) return;
        switch (e.code) {
          case "KeyN":
            e.preventDefault();
            h.onCash?.();
            return;
          case "KeyM":
            e.preventDefault();
            h.onMultiPay?.();
            return;
          case "KeyB":
            e.preventDefault();
            h.onCard?.();
            return;
          case "KeyA":
            e.preventDefault();
            h.onCredit?.();
            return;
          case "KeyT":
            e.preventDefault();
            h.onSuspend?.();
            return;
          case "KeyP":
            e.preventDefault();
            h.onQuotation?.();
            return;
          case "KeyD":
            e.preventDefault();
            h.onDraft?.();
            return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          h.onCancel?.();
          return;
        }
      }
      // Quick items shortcut: "*" (main keyboard or numpad)
      if ((e.key === "*" || e.code === "NumpadMultiply" || (e.shiftKey && e.code === "Digit8")) && !inOpenDialog) {
        e.preventDefault();
        h.onQuickItems?.();
        return;
      }

      if (!e.shiftKey) return;
      if (inOpenDialog) return;
      // Use e.code so it works regardless of keyboard layout (Arabic/English).
      switch (e.code) {
        case "KeyE":
          e.preventDefault();
          h.onCash?.();
          break;
        case "KeyC":
          e.preventDefault();
          h.onCancel?.();
          break;
        case "KeyD":
          e.preventDefault();
          h.onDraft?.();
          break;
        case "KeyP":
          e.preventDefault();
          h.onMultiPay?.();
          break;
        case "KeyI":
          e.preventDefault();
          h.onDiscount?.();
          break;
        case "KeyT":
          e.preventDefault();
          h.onTax?.();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, h]);
}
