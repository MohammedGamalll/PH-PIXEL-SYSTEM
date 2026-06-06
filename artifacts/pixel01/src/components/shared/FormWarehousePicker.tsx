import { useWarehouses } from "@/hooks/use-warehouses";

const labelStyle: React.CSSProperties = {
  color: "#374151",
  fontSize: 13,
  fontWeight: 700,
};
const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  backgroundColor: "#ffffff",
  color: "#111827",
  fontWeight: 600,
};

/**
 * In-form warehouse selector: required, must be one of the user's warehouses.
 * Pass the resulting `value` along with the saved record so stock movement
 * targets the chosen warehouse — independent of the global navbar selector.
 */
export function FormWarehousePicker({
  value,
  onChange,
  label = "المخزن",
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const { data: warehouses = [], isLoading } = useWarehouses();
  const list = (warehouses ?? []).filter((w) => !!w?.id);
  return (
    <div>
      <label className="block mb-1.5" style={labelStyle}>
        {label} <span style={{ color: "#dc2626" }}>*</span>
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 px-3 rounded-md text-sm w-full outline-none"
        style={inputStyle}
        disabled={isLoading || list.length === 0}
      >
        {list.length === 0 ? (
          <option value="">لا توجد مخازن</option>
        ) : (
          <>
            <option value="">— اختر المخزن —</option>
            {list.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.is_default ? "  (افتراضي)" : ""}
              </option>
            ))}
          </>
        )}
      </select>
    </div>
  );
}
