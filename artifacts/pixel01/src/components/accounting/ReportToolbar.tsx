import type { ReactNode } from "react";
import { Printer } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function ReportToolbar({ children, onPrint }: { children?: ReactNode; onPrint?: () => void }) {
  const { t } = useI18n();
  const handlePrint = onPrint || (() => window.print());
  return (
    <div className="no-print flex flex-wrap items-end gap-3 mb-3 pb-3" style={{ borderBottom: "1px solid #e5e7eb" }}>
      {children}
      <div className="ms-auto">
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-white text-sm"
          style={{ background: "#6366f1", border: "1px solid #4f46e5" }}
        >
          <Printer className="h-4 w-4" /> {t("accounting.toolbar.print")}
        </button>
      </div>
    </div>
  );
}
