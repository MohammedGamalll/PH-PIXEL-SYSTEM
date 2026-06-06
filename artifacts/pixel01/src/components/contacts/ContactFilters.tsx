import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Filter } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  backgroundColor: "#ffffff",
  borderRadius: 6,
  height: 36,
  padding: "0 8px",
  width: "100%",
  fontSize: 13,
  outline: "none",
};
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#374151",
  marginBottom: 4,
  display: "block",
};

export function ContactFilters({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { t, dir } = useI18n();
  return (
    <div
      dir={dir}
      className="mb-3 rounded-md"
      style={{ border: "1px solid #e5e7eb", backgroundColor: "#ffffff" }}
    >
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm"
        style={{ color: "#1d4ed8" }}
      >
        <span className="flex items-center gap-2">
          <Filter className="h-4 w-4" /> {t("users.filters.title")}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3"
          style={{ borderTop: "1px solid #e5e7eb" }}
        >
          {children ?? (
            <>
              <div>
                <label style={labelStyle}>{t("users.filters.type")}:</label>
                <select style={inputStyle}>
                  <option value="">{t("users.filters.all")}</option>
                  <option value="customer">{t("users.type.customer")}</option>
                  <option value="supplier">{t("users.type.supplier")}</option>
                  <option value="both">{t("users.type.both")}</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("users.filters.group")}:</label>
                <select style={inputStyle}>
                  <option value="">{t("users.filters.all")}</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("users.filters.assigned_to")}:</label>
                <select style={inputStyle}>
                  <option value="">{t("users.filters.all")}</option>
                </select>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
