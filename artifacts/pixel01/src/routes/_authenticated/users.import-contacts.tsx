import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { exportToCsv } from "@/lib/csv";
import { useImportContacts } from "@/hooks/use-contacts";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/users/import-contacts")({
  component: ImportContactsPage,
});

const BLUE = "#3b82f6";

const TYPE_ALIAS: Record<string, "customer" | "supplier" | "both"> = {
  "العملاء": "customer", "عميل": "customer", "customer": "customer",
  "الموردين": "supplier", "مورد": "supplier", "supplier": "supplier",
  "مورد وعميل": "both", "كلاهما": "both", "both": "both",
};

function ImportContactsPage() {
  const { t, dir } = useI18n();
  const printRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const importer = useImportContacts();

  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "8px 10px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 12, borderBottom: "1px solid #e5e7eb" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "8px 10px", color: "#374151", fontSize: 12, verticalAlign: "top", textAlign: dir === "rtl" ? "right" : "left" };

  type TplRow = { num: number; name: string; req: boolean; desc: string; field: string };
  const TEMPLATE: TplRow[] = useMemo(() => [
    { num: 1, name: t("users.import.t.type"), req: true, desc: t("users.import.t.type_desc"), field: "type" },
    { num: 2, name: t("users.import.t.prefix"), req: false, desc: t("users.import.t.prefix_desc"), field: "prefix" },
    { num: 3, name: t("users.import.t.first"), req: true, desc: t("users.import.t.first_desc"), field: "first_name" },
    { num: 4, name: t("users.import.t.middle"), req: false, desc: t("users.import.t.middle_desc"), field: "middle_name" },
    { num: 5, name: t("users.import.t.last"), req: false, desc: t("users.import.t.last_desc"), field: "last_name" },
    { num: 6, name: t("users.import.t.business"), req: false, desc: t("users.import.t.business_desc"), field: "business_name" },
    { num: 7, name: t("users.import.t.contact_id"), req: false, desc: t("users.import.t.contact_id_desc"), field: "contact_id" },
    { num: 8, name: t("users.import.t.tax"), req: false, desc: t("users.import.t.tax_desc"), field: "tax_number" },
    { num: 9, name: t("users.import.t.opening"), req: false, desc: t("users.import.t.opening_desc"), field: "opening_balance" },
    { num: 10, name: t("users.import.t.pay_term"), req: false, desc: t("users.import.t.pay_term_desc"), field: "pay_term" },
    { num: 11, name: t("users.import.t.credit"), req: false, desc: t("users.import.t.credit_desc"), field: "credit_limit" },
    { num: 12, name: t("users.import.t.assigned"), req: false, desc: t("users.import.t.assigned_desc"), field: "assigned_to" },
    { num: 13, name: t("users.import.t.email"), req: false, desc: t("users.import.t.email_desc"), field: "email" },
    { num: 14, name: t("users.import.t.mobile"), req: true, desc: t("users.import.t.mobile_desc"), field: "mobile" },
    { num: 15, name: t("users.import.t.alt_mobile"), req: false, desc: t("users.import.t.alt_mobile_desc"), field: "alt_mobile" },
    { num: 16, name: t("users.import.t.phone"), req: false, desc: t("users.import.t.phone_desc"), field: "phone" },
    { num: 17, name: t("users.import.t.dob"), req: false, desc: t("users.import.t.dob_desc"), field: "dob" },
    { num: 18, name: t("users.import.t.addr1"), req: false, desc: t("users.import.t.addr1_desc"), field: "address_line_1" },
    { num: 19, name: t("users.import.t.addr2"), req: false, desc: t("users.import.t.addr2_desc"), field: "address_line_2" },
    { num: 20, name: t("users.import.t.city"), req: false, desc: t("users.import.t.city_desc"), field: "city" },
    { num: 21, name: t("users.import.t.state"), req: false, desc: t("users.import.t.state_desc"), field: "state" },
    { num: 22, name: t("users.import.t.zip"), req: false, desc: t("users.import.t.zip_desc"), field: "zip_code" },
    { num: 23, name: t("users.import.t.shipping"), req: false, desc: t("users.import.t.shipping_desc"), field: "shipping_address" },
    { num: 24, name: t("users.table.cf", { n: 1 }), req: false, desc: t("users.import.t.cf_desc"), field: "custom_field_1" },
    { num: 25, name: t("users.table.cf", { n: 2 }), req: false, desc: t("users.import.t.cf_desc"), field: "custom_field_2" },
    { num: 26, name: t("users.table.cf", { n: 3 }), req: false, desc: t("users.import.t.cf_desc"), field: "custom_field_3" },
    { num: 27, name: t("users.table.cf", { n: 4 }), req: false, desc: t("users.import.t.cf_desc"), field: "custom_field_4" },
  ], [t]);

  const downloadTemplate = () => {
    exportToCsv(
      "contacts-template.csv",
      TEMPLATE.map((r) => r.name),
      [TEMPLATE.map(() => "")],
    );
  };

  const submit = async () => {
    if (!file) {
      toast.error(t("users.import.no_file"));
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
      const mapped = rows
        .map((r) => {
          const out: Record<string, any> = {};
          for (const tpl of TEMPLATE) {
            const v = r[tpl.name];
            if (v === undefined || v === "") continue;
            out[tpl.field] = v;
          }
          const rawType = String(out.type ?? "").trim();
          out.type = TYPE_ALIAS[rawType] ?? "customer";
          if (out.opening_balance !== undefined) out.opening_balance = Number(out.opening_balance) || 0;
          if (out.credit_limit !== undefined) out.credit_limit = Number(out.credit_limit) || 0;
          out.business_type = out.business_name ? "business" : "person";
          return out;
        })
        .filter((r) => r.first_name && r.mobile);
      if (mapped.length === 0) {
        toast.error(t("users.import.no_valid"));
        return;
      }
      await importer.mutateAsync(mapped);
      setFile(null);
    } catch (e: any) {
      toast.error(e?.message ?? t("users.import.read_failed"));
    }
  };

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("users.page.import_title")} subtitle={t("users.page.import_subtitle")} />

      <DataCard>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-sm block mb-1" style={{ color: "#374151" }}>{t("users.import.label_file")}</label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
              style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: 6, backgroundColor: "#ffffff" }}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={importer.isPending}
              className="h-10 px-4 rounded-md text-white text-sm flex items-center gap-2"
              style={{ backgroundColor: BLUE }}
            >
              <Upload className="h-4 w-4" /> {t("users.actions.send")}
            </button>
            <button
              type="button"
              onClick={downloadTemplate}
              className="h-10 px-4 rounded-md text-sm flex items-center gap-2"
              style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151" }}
            >
              <Download className="h-4 w-4" /> {t("users.actions.download_template")}
            </button>
          </div>
        </div>
      </DataCard>

      <DataCard>
        <div className="text-base font-semibold mb-2" style={{ color: "#111827" }}>{t("users.import.instructions")}</div>
        <div className="overflow-x-auto" ref={printRef}>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headStyle}>{t("users.import.col_num")}</th>
                <th style={headStyle}>{t("users.import.col_name")}</th>
                <th style={headStyle}>{t("users.import.col_required")}</th>
                <th style={headStyle}>{t("users.import.col_desc")}</th>
              </tr>
            </thead>
            <tbody>
              {TEMPLATE.map((r) => (
                <tr key={r.num}>
                  <td style={cellStyle}>{r.num}</td>
                  <td style={cellStyle}>{r.name}</td>
                  <td style={cellStyle}>{r.req ? t("users.import.yes") : t("users.import.no")}</td>
                  <td style={cellStyle}>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataCard>
    </div>
  );
}
