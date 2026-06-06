import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";

const BLUE = "#3b82f6";
const RED = "#ef4444";
const DARK = "#111827";

const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db", backgroundColor: "#ffffff",
  borderRadius: 6, height: 38, padding: "0 10px", width: "100%", fontSize: 14, outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 13, color: "#374151", marginBottom: 4, display: "block" };

export type FieldDef =
  | { type: "text" | "number"; key: string; label: string; required?: boolean; placeholder?: string }
  | { type: "textarea"; key: string; label: string; required?: boolean; placeholder?: string }
  | { type: "select"; key: string; label: string; required?: boolean; options: { value: string; label: string }[] }
  | { type: "checkbox"; key: string; label: string };

export function EntityDialog({
  open, onOpenChange, title, fields, initial = {}, onSubmit, submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  fields: FieldDef[];
  initial?: Record<string, any>;
  onSubmit: (values: Record<string, any>) => Promise<void> | void;
  submitting?: boolean;
}) {
  const { t, dir } = useI18n();
  const [values, setValues] = useState<Record<string, any>>(initial);

  useEffect(() => { if (open) setValues(initial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  const set = (k: string, v: any) => setValues((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const f of fields) {
      if ("required" in f && f.required && !String(values[f.key] ?? "").trim()) {
        return;
      }
    }
    await onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-md" style={{ backgroundColor: "#ffffff" }}>
        <DialogHeader>
          <DialogTitle className="text-start" style={{ color: DARK }}>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {fields.map((f) => {
            if (f.type === "checkbox") {
              return (
                <label key={f.key} className="flex items-center gap-2 text-sm" style={{ color: "#374151" }}>
                  <input type="checkbox" checked={!!values[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
                  {f.label}
                </label>
              );
            }
            return (
              <div key={f.key}>
                <label style={labelStyle}>
                  {f.label}{("required" in f && f.required) && <span style={{ color: RED }}>*</span>}
                </label>
                {f.type === "textarea" ? (
                  <textarea
                    value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}
                    placeholder={"placeholder" in f ? f.placeholder : ""}
                    style={{ ...inputStyle, height: 80, padding: 8 }}
                  />
                ) : f.type === "select" ? (
                  <select value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} style={inputStyle}>
                    <option value="">{t("products.form.select_placeholder")}</option>
                    {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}
                    placeholder={"placeholder" in f ? f.placeholder : ""} style={inputStyle}
                  />
                )}
              </div>
            );
          })}
          <DialogFooter className="flex-row-reverse sm:flex-row-reverse gap-2">
            <button type="submit" disabled={submitting}
              className="h-10 px-5 rounded-md text-white text-sm" style={{ backgroundColor: BLUE }}>{t("products.form.save")}</button>
            <button type="button" onClick={() => onOpenChange(false)}
              className="h-10 px-5 rounded-md text-white text-sm" style={{ backgroundColor: DARK }}>{t("products.form.close")}</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
