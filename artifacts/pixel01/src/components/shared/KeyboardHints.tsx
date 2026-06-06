import { useI18n } from "@/lib/i18n";

export type Hint = { keys: string; label: string };

export function KeyboardHints({ hints, className }: { hints?: Hint[]; className?: string }) {
  const { t, dir } = useI18n();
  const items: Hint[] = hints ?? [
    { keys: "F2", label: t("shortcuts.search") || "بحث الصنف" },
    { keys: "↑ / ↓", label: t("shortcuts.move_row") || "تنقل بين الصفوف" },
    { keys: "Ctrl+Enter", label: t("shortcuts.save") || "حفظ" },
    { keys: "Esc", label: t("shortcuts.clear") || "مسح / إلغاء" },
  ];
  return (
    <div
      dir={dir}
      className={`flex flex-wrap items-center gap-2 mb-2 text-xs ${className ?? ""}`}
      style={{ color: "#374151" }}
    >
      <span style={{ fontWeight: 600, color: "#6b7280" }}>
        {t("shortcuts.title") || "اختصارات"}:
      </span>
      {items.map((h, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5"
          style={{ backgroundColor: "#f3f4f6", border: "1px solid #e5e7eb" }}
        >
          <kbd
            className="rounded px-1.5 py-0.5"
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #d1d5db",
              fontFamily: "monospace",
              fontSize: 11,
              fontWeight: 600,
              color: "#111827",
            }}
          >
            {h.keys}
          </kbd>
          <span>{h.label}</span>
        </span>
      ))}
    </div>
  );
}
