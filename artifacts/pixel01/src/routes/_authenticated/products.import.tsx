import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csv";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/products/import")({
  component: ImportProductsPage,
});

const BLUE = "#3b82f6";
const GREEN = "#10b981";
const RED = "#ef4444";

const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151" };

const rows: { num: number; name: string; note: string; required?: boolean }[] = [
  { num: 1, name: "اسم الصنف بالعربي (إلزامي)", note: "اسم الصنف بالعربية", required: true },
  { num: 2, name: "اسم الصنف بالإنجليزي (إلزامي)", note: "اسم الصنف بالإنجليزية", required: true },
  { num: 3, name: "الماركة (اختياري)", note: "اسم العلامة التجارية (إذا لم يتم العثور على، سيتم إنشاء علامة تجارية جديدة تحمل الاسم الأول)" },
  { num: 4, name: "الوحدة الرئيسية (الأكبر) (إلزامي)", note: "اسم الوحدة الرئيسية (الأكبر) — تُنشأ تلقائيًا إن لم تكن معرّفة", required: true },
  { num: 5, name: "الوحدة الفرعية الأولى (اختياري)", note: "اسم الوحدة الفرعية الأولى — تُنشأ تلقائيًا إن لم تكن معرّفة" },
  { num: 6, name: "نسبة الوحدة الفرعية الأولى (إلزامي في حال وجود وحدة فرعية)", note: "عدد صحيح ≥ 1" },
  { num: 7, name: "الوحدة الفرعية الثانية (اختياري)", note: "اسم الوحدة الفرعية الثانية — تُنشأ تلقائيًا إن لم تكن معرّفة" },
  { num: 8, name: "نسبة الوحدة الفرعية الثانية (إلزامي في حال وجود وحدة فرعية ثانية)", note: "عدد صحيح ≥ 1" },
  { num: 9, name: "المجموعة الرئيسية (اختياري)", note: "اسم المجموعة الرئيسية" },
  { num: 10, name: "المجموعة الفرعية (اختياري)", note: "اسم المجموعة الفرعية" },
  { num: 11, name: "SKU الباركود (اختياري)", note: "كود SKU الصنف" },
  { num: 12, name: "نوع الباركود (اختياري)", note: "C128, C39, EAN-13, EAN-8, UPC-A, UPC-E, ITF-14" },
  { num: 13, name: "إدارة المخزون (الحقول الإلزامية)", note: "1 = نعم, 0 = لا", required: true },
  { num: 14, name: "تنبيه الكمية (اختياري)", note: "" },
  { num: 15, name: "الضريبة المطبقة (اختياري)", note: "" },
  { num: 16, name: "نوع ضريبة المبيعات (الحقول الإلزامية)", note: "inclusive, exclusive", required: true },
  { num: 17, name: "نوع الصنف (الحقول الإلزامية)", note: "single, variable", required: true },
  { num: 18, name: "سعر الشراء (بما في ذلك ضريبة القيمة المضافة)", note: "" },
  { num: 19, name: "سعر الشراء (باستثناء الضرائب)", note: "" },
  { num: 20, name: "سعر البيع (اختياري)", note: "" },
  { num: 21, name: "الكمية (اختياري)", note: "" },
];

function normKey(s: string): string {
  return String(s ?? "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function pick(row: Record<string, any>, ...labels: string[]): any {
  const normalized: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) normalized[normKey(k)] = v;
  for (const label of labels) {
    const v = normalized[normKey(label)];
    if (v != null && v !== "") return v;
  }
  return undefined;
}

function parseIntStrict(v: unknown): number | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function normalizeRow(r: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).trim(), v]));
}

async function parseFile(file: File): Promise<Record<string, any>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, any>>(file, {
        header: true, skipEmptyLines: true,
        complete: (res) => resolve(res.data.map(normalizeRow)),
        error: reject,
      });
    });
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, any>>(ws).map(normalizeRow);
}

function ImportProductsPage() {
  const { t, dir } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const headStyle: React.CSSProperties = {
    backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px",
    fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb",
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = fileRef.current?.files?.[0];
    if (!f) { toast.error(t("products.toast.choose_file")); return; }
    if (!user) return;
    try {
      const effectiveOwnerId = ownerId ?? user.id;
      const parsed = await parseFile(f);
      const { data: unitsData } = await supabase.from("units").select("name,short_name").eq("owner_id", effectiveOwnerId);
      const unitSet = new Set<string>();
      (unitsData ?? []).forEach((u: any) => {
        if (u.name) unitSet.add(String(u.name).trim().toLowerCase());
        if (u.short_name) unitSet.add(String(u.short_name).trim().toLowerCase());
      });

      const referencedUnits = new Map<string, string>();
      parsed.forEach((r) => {
        for (const label of [
          "الوحدة الرئيسية", "الوحدة الفرعية الأولى", "الوحدة الفرعية الثانية",
        ]) {
          const v = String(pick(r, label) ?? "").trim();
          if (v) referencedUnits.set(v.toLowerCase(), v);
        }
      });

      const missing = Array.from(referencedUnits.entries())
        .filter(([lo]) => !unitSet.has(lo))
        .map(([, name]) => name);
      if (missing.length > 0) {
        const payload = missing.map((name) => ({ name, short_name: name, owner_id: effectiveOwnerId }));
        const { error: insErr } = await (supabase.from("units") as any).insert(payload);
        if (insErr) throw insErr;
        missing.forEach((n) => unitSet.add(n.toLowerCase()));
        toast.success(`تم إنشاء ${missing.length} وحدة جديدة تلقائيًا`);
      }

      const errors: string[] = [];
      const inserts: any[] = [];
      let skippedNoName = 0;
      parsed.forEach((r, idx) => {
        const line = idx + 2;
        const nameAr = String(pick(r, "اسم الصنف بالعربي") ?? "").trim();
        const nameEn = String(pick(r, "اسم الصنف بالإنجليزي") ?? "").trim();
        if (!nameAr && !nameEn) { skippedNoName++; return; }
        if (!nameAr) { errors.push(`سطر ${line}: اسم الصنف بالعربي مطلوب`); return; }
        if (!nameEn) { errors.push(`سطر ${line}: اسم الصنف بالإنجليزي مطلوب`); return; }
        const name = `${nameAr} - ${nameEn}`;

        const mainUnit = String(pick(r, "الوحدة الرئيسية", "الوحدة الرئيسية (الأكبر)", "الوحدة") ?? "").trim();
        if (!mainUnit) { errors.push(`سطر ${line} (${name}): الوحدة الرئيسية مطلوبة`); return; }
        if (!unitSet.has(mainUnit.toLowerCase())) { errors.push(`سطر ${line} (${name}): الوحدة الرئيسية "${mainUnit}" غير معرّفة`); return; }

        const sub1Raw = String(pick(r, "الوحدة الفرعية الأولى") ?? "").trim();
        const sub1RatioRaw = pick(r, "نسبة الوحدة الفرعية الأولى");
        let sub_unit_1: string | null = null;
        let sub_unit_1_ratio = 1;
        if (sub1Raw) {
          if (!unitSet.has(sub1Raw.toLowerCase())) { errors.push(`سطر ${line} (${name}): الوحدة الفرعية الأولى "${sub1Raw}" غير معرّفة`); return; }
          const r1 = parseIntStrict(sub1RatioRaw);
          if (r1 == null || r1 < 1) { errors.push(`سطر ${line} (${name}): نسبة الوحدة الفرعية الأولى مطلوبة وعدد صحيح ≥ 1`); return; }
          sub_unit_1 = sub1Raw;
          sub_unit_1_ratio = r1;
        }

        const sub2Raw = String(pick(r, "الوحدة الفرعية الثانية") ?? "").trim();
        const sub2RatioRaw = pick(r, "نسبة الوحدة الفرعية الثانية");
        let sub_unit_2: string | null = null;
        let sub_unit_2_ratio = 1;
        if (sub2Raw) {
          if (!sub_unit_1) { errors.push(`سطر ${line} (${name}): يجب وجود الوحدة الفرعية الأولى قبل الثانية`); return; }
          if (!unitSet.has(sub2Raw.toLowerCase())) { errors.push(`سطر ${line} (${name}): الوحدة الفرعية الثانية "${sub2Raw}" غير معرّفة`); return; }
          const r2 = parseIntStrict(sub2RatioRaw);
          if (r2 == null || r2 < 1) { errors.push(`سطر ${line} (${name}): نسبة الوحدة الفرعية الثانية مطلوبة وعدد صحيح ≥ 1`); return; }
          sub_unit_2 = sub2Raw;
          sub_unit_2_ratio = r2;
        }

        const sku = String(pick(r, "SKU الباركود", "SKU") ?? "").trim() || null;
        const price = Number(pick(r, "سعر البيع") ?? 0) || 0;
        const cost = Number(pick(r, "سعر الشراء باستثناء الضرائب", "سعر الشراء") ?? 0) || 0;
        const stock = Number(pick(r, "الكمية") ?? 0) || 0;
        inserts.push({
          name, sku, price, cost, stock,
          unit: mainUnit,
          main_unit: mainUnit,
          sub_unit_1, sub_unit_1_ratio,
          sub_unit_2, sub_unit_2_ratio,
          owner_id: effectiveOwnerId,
        });
      });
      if (errors.length > 0) {
        errors.slice(0, 5).forEach((m) => toast.error(m));
        return;
      }
      if (inserts.length === 0) {
        if (skippedNoName > 0 && parsed.length > 0) {
          toast.error("تحقق من عناوين الأعمدة في الملف — لم نجد أي صف ببيانات اسم صحيحة");
        } else {
          toast.error(t("products.toast.no_valid_rows"));
        }
        return;
      }
      const { error } = await (supabase.from("products") as any).insert(inserts);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(t("products.import.imported_count", { n: inserts.length }));
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: any) {
      toast.error(err.message || t("products.toast.import_failed"));
    }
  };

  const downloadTemplate = () =>
    exportToCsv("products-import-template.csv", rows.map(r => r.name), [rows.map(() => "")]);

  return (
    <form onSubmit={submit} className="space-y-3" dir={dir}>
      <PageHeader title={t("products.import.title")} />

      <DataCard>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          <div className="md:col-start-3 text-start space-y-2">
            <label className="text-sm font-semibold" style={{ color: "#374151" }}>{t("products.import.file_label")}</label>
            <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="text-sm block"
              style={{ border: "1px solid #d1d5db", padding: 6, borderRadius: 6, backgroundColor: "#ffffff" }} />
            <p className="text-xs" style={{ color: "#6b7280" }}>{t("products.import.ext_hint")}</p>
            <p className="text-xs" style={{ color: RED }}>{t("products.import.size_hint")}</p>
          </div>
          <div className="md:col-start-2 flex items-center justify-center">
            <button type="submit" className="h-10 px-8 rounded-md text-white text-sm" style={{ backgroundColor: BLUE }}>{t("products.import.submit")}</button>
          </div>
          <div className="md:col-start-1 flex items-end">
            <button type="button" onClick={downloadTemplate} className="h-10 px-4 rounded-md text-white text-sm flex items-center gap-2" style={{ backgroundColor: GREEN }}>
              <Download className="h-4 w-4" /> {t("products.import.template")}
            </button>
          </div>
        </div>
      </DataCard>

      <DataCard>
        <div className="text-start mb-3">
          <h2 className="text-lg font-semibold" style={{ color: "#111827" }}>{t("products.import.instructions")}</h2>
          <p className="text-sm" style={{ color: "#6b7280" }}>{t("products.import.instructions_text")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...headStyle, width: 110 }}>{t("products.import.col_number")}</th>
                <th style={headStyle}>{t("products.import.col_name")}</th>
                <th style={headStyle}>{t("products.import.col_note")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.num}>
                  <td style={cellStyle}>{r.num}</td>
                  <td style={{ ...cellStyle, color: r.required ? RED : "#374151" }}>{r.name}</td>
                  <td style={cellStyle}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataCard>
    </form>
  );
}
