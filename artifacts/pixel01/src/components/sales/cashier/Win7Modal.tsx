import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

type Props = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  width?: number | string;
};

export function Win7Modal({ title, children, onClose, width = 360 }: Props) {
  const { t, dir } = useI18n();
  return (
    <div
      role="dialog"
      onClick={onClose}
      className="no-print"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
    >
      <div
        dir={dir}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#e9e9e9",
          border: "1px solid #9aa0a6",
          padding: 14,
          width,
          maxWidth: "95vw",
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: 2,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
            paddingBottom: 6,
            borderBottom: "1px solid #9aa0a6",
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer" }}
            aria-label={t("sales.cashier.close_btn")}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
