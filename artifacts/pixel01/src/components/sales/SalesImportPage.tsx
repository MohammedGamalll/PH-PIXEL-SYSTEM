import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { exportToCsv } from "@/lib/csv";

export function SalesImportPage() {
  const { t, dir } = useI18n();
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #d1d5db" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #e5e7eb", padding: "10px 12px", color: "#374151" };

  const FIELDS: { name: string; instr: string }[] = [
    { name: t("sales.cols.invoice_no"), instr: "" },
    { name: t("sales.cols.customer"), instr: "" },
    { name: t("sales.cols.phone"), instr: t("sales.import.instr_email_or_phone") },
    { name: t("sales.import.field_email"), instr: t("sales.import.instr_email_or_phone") },
    { name: t("sales.form.sale_date"), instr: t("sales.import.instr_date_format") },
    { name: t("sales.import.field_item_name"), instr: t("sales.import.instr_item_or_sku") },
    { name: t("sales.import.field_item_sku"), instr: t("sales.import.instr_item_or_sku") },
    { name: t("sales.form.qty"), instr: t("sales.import.instr_required") },
    { name: t("sales.import.field_unit"), instr: "" },
    { name: t("sales.items.col.unit_price"), instr: "" },
    { name: t("sales.import.field_line_tax"), instr: "" },
    { name: t("sales.import.field_line_discount"), instr: "" },
    { name: t("sales.import.field_item_desc"), instr: "" },
    { name: t("sales.import.field_order_total"), instr: "" },
  ];

  const TEMPLATE_HEADERS = FIELDS.map((f) => f.name);

  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState(t("sales.import.no_file"));
  const [preview, setPreview] = useState<string[][]>([]);

  const onChoose = () => fileRef.current?.click();
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFileName(f?.name || t("sales.import.no_file"));
  };

  const onReview = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 10);
    setPreview(lines.map((l) => l.split(",")));
  };

  const onDownloadTemplate = () => exportToCsv("sales-import-template.csv", TEMPLATE_HEADERS, []);

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("sales.titles.import")} />

      <DataCard className="border-gray-300">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <label className="text-sm" style={{ color: "#374151", minWidth: 110 }}>{t("sales.import.file_label")}</label>
            <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={onFile} />
            <button onClick={onChoose} className="h-9 px-3 rounded text-sm" style={{ border: "1px solid #d1d5db", backgroundColor: "#e9e9e9" }}>{t("sales.import.choose")}</button>
            <span className="text-sm" style={{ color: "#6b7280" }}>{fileName}</span>
          </div>
          <button onClick={onReview} className="h-10 px-4 rounded-full text-sm flex items-center gap-2 text-white" style={{ backgroundColor: "#8b5cf6" }}>
            <Upload className="h-4 w-4" /> {t("sales.import.review")}
          </button>
        </div>
        <div className="mt-3 flex justify-center">
          <button onClick={onDownloadTemplate} className="h-10 px-4 rounded-md text-sm flex items-center gap-2 text-white" style={{ backgroundColor: "#16a34a" }}>
            <Download className="h-4 w-4" /> {t("sales.import.template")}
          </button>
        </div>
      </DataCard>

      <DataCard className="border-gray-300">
        <h3 className="text-sm font-bold mb-3" style={{ color: "#374151" }}>{t("sales.import.instructions")}</h3>
        <ol className="list-decimal ps-5 space-y-1 text-sm mb-4" style={{ color: "#374151" }}>
          <li>{t("sales.import.step1")}</li>
          <li>{t("sales.import.step2")}</li>
          <li>{t("sales.import.step3")}</li>
          <li>{t("sales.import.step4")}</li>
        </ol>
        <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #d1d5db" }}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headStyle}>{t("sales.import.fields")}</th>
                <th style={headStyle}>{t("sales.import.instructions")}</th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map((f) => (
                <tr key={f.name}>
                  <td style={cellStyle}>{f.name}</td>
                  <td style={cellStyle}>{f.instr || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataCard>

      {preview.length > 0 && (
        <DataCard className="border-gray-300">
          <h3 className="text-sm font-bold mb-3" style={{ color: "#374151" }}>{t("sales.import.preview")}</h3>
          <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #d1d5db" }}>
            <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>{row.map((c, j) => <td key={j} style={cellStyle}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataCard>
      )}

      <DataCard className="border-gray-300">
        <h3 className="text-sm font-bold mb-3" style={{ color: "#374151" }}>{t("sales.import.imports")}</h3>
        <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #d1d5db" }}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headStyle}>{t("sales.import.batch")}</th>
                <th style={headStyle}>{t("sales.import.time")}</th>
                <th style={headStyle}>{t("sales.import.created_by")}</th>
                <th style={headStyle}>{t("sales.import.invoices")}</th>
                <th style={headStyle}>{t("sales.cols.option")}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={5} className="text-center py-6 text-sm" style={{ color: "#6b7280" }}>{t("sales.import.no_data")}</td></tr>
            </tbody>
          </table>
        </div>
      </DataCard>
    </div>
  );
}
