// Globally patch sonner's toast so success/error calls also play an audible sound.
import { toast } from "sonner";
import { playSuccess, playError } from "./sounds";

if (typeof window !== "undefined" && !(toast as any).__soundPatched) {
  const origSuccess = toast.success.bind(toast);
  const origError = toast.error.bind(toast);
  const origWarning = (toast as any).warning?.bind(toast);

  (toast as any).success = (...args: any[]) => {
    try { playSuccess(); } catch { /* ignore */ }
    return (origSuccess as any)(...args);
  };
  (toast as any).error = (...args: any[]) => {
    try { playError(); } catch { /* ignore */ }
    return (origError as any)(...args);
  };
  if (origWarning) {
    (toast as any).warning = (...args: any[]) => {
      try { playError(); } catch { /* ignore */ }
      return (origWarning as any)(...args);
    };
  }
  (toast as any).__soundPatched = true;
}

export {};
