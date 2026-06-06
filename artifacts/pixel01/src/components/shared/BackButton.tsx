import { useRouter } from "@tanstack/react-router";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Shared back button. Uses router.history.back() to return to the previous page.
 * Falls back to the provided `fallbackTo` route if there's no history entry.
 */
export function BackButton({ fallbackTo, label }: { fallbackTo?: string; label?: string }) {
  const router = useRouter();
  const { dir } = useI18n();
  const isRtl = dir === "rtl";
  const Icon = isRtl ? ArrowRight : ArrowLeft;

  const onClick = () => {
    try {
      // tanstack router exposes history
      const hist: any = (router as any).history;
      if (hist && typeof hist.back === "function" && hist.length > 1) {
        hist.back();
        return;
      }
    } catch { /* ignore */ }
    if (fallbackTo) {
      router.navigate({ to: fallbackTo as any }).catch(() => {});
    } else {
      window.history.back();
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 px-3 rounded-md text-sm inline-flex items-center gap-1.5"
      style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151" }}
      title={label || (isRtl ? "رجوع" : "Back")}
    >
      <Icon className="h-4 w-4" />
      <span>{label || (isRtl ? "رجوع" : "Back")}</span>
    </button>
  );
}
