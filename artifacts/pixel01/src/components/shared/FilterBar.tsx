import { X } from "lucide-react";
import { DateInput } from "@/components/shared/DateInput";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";


export type FilterField =
  | { type: "date"; key: string; label: string; value: string }
  | { type: "select"; key: string; label: string; value: string; options: { value: string; label: string }[] };

const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  backgroundColor: "#ffffff",
  color: "#374151",
  height: 36,
  borderRadius: 6,
  padding: "0 10px",
  fontSize: 13,
  width: "100%",
  minWidth: 0,
};

export function FilterBar({
  fields,
  onChange,
  onReset,
}: {
  fields: FilterField[];
  onChange: (key: string, value: string) => void;
  onReset?: () => void;
}) {
  const hasActive = fields.some((f) => f.value);

  // Detect a from/to date pair and render a unified DateRangeFilter with presets.
  const fromField = fields.find(
    (f) => f.type === "date" && (f.key === "from" || f.key === "from_date" || f.key === "date_from"),
  );
  const toField = fields.find(
    (f) => f.type === "date" && (f.key === "to" || f.key === "to_date" || f.key === "date_to"),
  );
  const useRange = fromField && toField;
  const otherFields = useRange
    ? fields.filter((f) => f.key !== fromField!.key && f.key !== toField!.key)
    : fields;

  return (
    <div
      className="flex flex-col gap-2 mb-3 p-3 rounded-md"
      dir="rtl"
      style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb" }}
    >
      {useRange ? (
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: "#6b7280" }}>الفترة</label>
          <DateRangeFilter
            value={{ from: fromField!.value, to: toField!.value }}
            onChange={(r) => {
              onChange(fromField!.key, r.from);
              onChange(toField!.key, r.to);
            }}
          />
        </div>
      ) : null}

      {otherFields.length > 0 || (hasActive && onReset) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {otherFields.map((f) => (
            <div key={f.key} className="flex flex-col gap-1 min-w-0">
              <label className="text-xs" style={{ color: "#6b7280" }}>{f.label}</label>
              {f.type === "date" ? (
                <DateInput
                  value={f.value}
                  onChange={(v: string) => onChange(f.key, v)}
                  style={inputStyle}
                />
              ) : (
                <select
                  value={f.value}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  style={inputStyle}
                >
                  <option value="">{`الكل`}</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
          {hasActive && onReset ? (
            <div className="flex items-end">
              <button
                type="button"
                onClick={onReset}
                className="h-9 px-3 rounded-md text-sm flex items-center gap-1.5 w-full sm:w-auto justify-center"
                style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151" }}
              >
                <X className="h-4 w-4" /> إعادة تعيين
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
