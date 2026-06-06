import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";

export type DateRange = { from: string; to: string };

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last3"
  | "last5"
  | "week"
  | "twoweeks"
  | "month"
  | "quarter"
  | "halfyear"
  | "year"
  | "custom"
  | "all";

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
const toLocal = (d: Date) => {
  const off = d.getTimezoneOffset();
  const x = new Date(d.getTime() - off * 60000);
  return x.toISOString().slice(0, 16);
};

export function rangeForPreset(preset: DateRangePreset): DateRange {
  const now = new Date();
  const today = startOfDay(now);
  const eod = endOfDay(now);
  switch (preset) {
    case "today":
      return { from: toLocal(today), to: toLocal(eod) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const ye = endOfDay(y);
      return { from: toLocal(y), to: toLocal(ye) };
    }
    case "last3": {
      const f = new Date(today); f.setDate(f.getDate() - 2);
      return { from: toLocal(f), to: toLocal(eod) };
    }
    case "last5": {
      const f = new Date(today); f.setDate(f.getDate() - 4);
      return { from: toLocal(f), to: toLocal(eod) };
    }
    case "week": {
      const f = new Date(today); f.setDate(f.getDate() - 6);
      return { from: toLocal(f), to: toLocal(eod) };
    }
    case "twoweeks": {
      const f = new Date(today); f.setDate(f.getDate() - 13);
      return { from: toLocal(f), to: toLocal(eod) };
    }
    case "month": {
      const f = new Date(today); f.setMonth(f.getMonth() - 1);
      return { from: toLocal(f), to: toLocal(eod) };
    }
    case "quarter": {
      const f = new Date(today); f.setMonth(f.getMonth() - 3);
      return { from: toLocal(f), to: toLocal(eod) };
    }
    case "halfyear": {
      const f = new Date(today); f.setMonth(f.getMonth() - 6);
      return { from: toLocal(f), to: toLocal(eod) };
    }
    case "year": {
      const f = new Date(today); f.setFullYear(f.getFullYear() - 1);
      return { from: toLocal(f), to: toLocal(eod) };
    }
    default:
      return { from: "", to: "" };
  }
}

export function DateRangeFilter({
  value,
  onChange,
  className,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}) {
  const { t, dir } = useI18n();
  const [preset, setPreset] = useState<DateRangePreset>("custom");

  const presets: Array<{ id: DateRangePreset; label: string }> = useMemo(
    () => [
      { id: "all", label: t("range.all") || "الكل" },
      { id: "today", label: t("range.today") || "اليوم" },
      { id: "yesterday", label: t("range.yesterday") || "أمس" },
      { id: "last3", label: t("range.last3") || "آخر 3 أيام" },
      { id: "last5", label: t("range.last5") || "آخر 5 أيام" },
      { id: "week", label: t("range.week") || "أسبوع" },
      { id: "twoweeks", label: t("range.twoweeks") || "أسبوعين" },
      { id: "month", label: t("range.month") || "شهر" },
      { id: "quarter", label: t("range.quarter") || "3 شهور" },
      { id: "halfyear", label: t("range.halfyear") || "6 شهور" },
      { id: "year", label: t("range.year") || "سنة" },
      { id: "custom", label: t("range.custom") || "مخصص" },
    ],
    [t],
  );

  const apply = (id: DateRangePreset) => {
    setPreset(id);
    if (id === "all") {
      onChange({ from: "", to: "" });
      return;
    }
    if (id === "custom") return;
    onChange(rangeForPreset(id));
  };

  const inputStyle: React.CSSProperties = {
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#374151",
    height: 36,
    padding: "0 8px",
    borderRadius: 6,
    fontSize: 13,
  };

  return (
    <div dir={dir} className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <select
        value={preset}
        onChange={(e) => apply(e.target.value as DateRangePreset)}
        style={inputStyle}
        title={t("range.preset_hint") || "اختر فترة سريعة"}
      >
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <input
        type="datetime-local"
        value={value.from}
        onChange={(e) => {
          setPreset("custom");
          onChange({ ...value, from: e.target.value });
        }}
        style={inputStyle}
        title={t("range.from_hint") || "من تاريخ ووقت"}
      />
      <span style={{ color: "#6b7280", fontSize: 13 }}>→</span>
      <input
        type="datetime-local"
        value={value.to}
        onChange={(e) => {
          setPreset("custom");
          onChange({ ...value, to: e.target.value });
        }}
        style={inputStyle}
        title={t("range.to_hint") || "إلى تاريخ ووقت"}
      />
    </div>
  );
}
