import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csv";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/products/update-prices")({ component: UpdatePricesPage });

const BLUE = "#3b82f6";
const RED = "#ef4444";

const HEADERS = ["SKU", "Name", "Cost", "Price"];

function normalizeRow(row: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [String(k).trim(), v]));
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
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, any>>(ws).map(normalizeRow);
}

function UpdatePricesPage() {
  const { t, dir } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = fileRef.current?.files?.[0];
    if (!f) { toast.error(t("products.toast.choose_file")); return; }
    try {
      const rows = await parseFile(f);
      if (rows.length === 0) { toast.error(t("products.toast.empty_file")); return; }

      const { data: products, error } = await supabase.from("products").select("id, sku, name");
      if (error) throw error;

      let updated = 0;
      const updates: Promise<any>[] = [];
      for (const r of rows) {
        const sku = String(r["SKU"] ?? "").trim();
        const name = String(r["اسم الصنف"] ?? r["Name"] ?? "").trim();
        const costRaw = r["سعر الشراء"] ?? r["Cost"];
        const priceRaw = r["سعر البيع"] ?? r["Price"];
        const cost = costRaw !== "" && costRaw != null ? Number(costRaw) : null;
        const price = priceRaw !== "" && priceRaw != null ? Number(priceRaw) : null;
        const match = (products as any[]).find(
          (p) => (sku && p.sku === sku) || (!sku && name && p.name === name)
        );
        if (!match) continue;
        const patch: Record<string, number> = {};
        if (cost != null && !Number.isNaN(cost)) patch.cost = cost;
        if (price != null && !Number.isNaN(price)) patch.price = price;
        if (Object.keys(patch).length === 0) continue;
        updates.push((supabase.from("products") as any).update(patch).eq("id", match.id));
        updated++;
      }
      const results = await Promise.all(updates);
      const failed = results.filter((r: any) => r.error).length;
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(t("products.opening.updated_of", { a: updated - failed, b: rows.length }));
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: any) {
      toast.error(err.message || t("products.toast.parse_failed"));
    }
  };

  const exportTemplate = async () => {
    const { data, error } = await supabase.from("products").select("sku, name, cost, price");
    if (error) { toast.error(error.message); return; }
    const rows = (data ?? []).map((p: any) => [p.sku ?? "", p.name ?? "", p.cost ?? 0, p.price ?? 0]);
    if (rows.length === 0) rows.push(["", "", "", ""]);
    exportToCsv("product-prices.csv", HEADERS, rows);
  };

  return (
    <form onSubmit={submit} className="space-y-3" dir={dir}>
      <PageHeader title={t("products.update_prices.title")} />
      <DataCard>
        <div className="flex items-start justify-between gap-4 mb-6">
          <button type="button" onClick={exportTemplate} className="h-10 px-4 rounded-md text-white text-sm" style={{ backgroundColor: "#6366f1" }}>
            {t("products.update_prices.export")}
          </button>
          <div className="text-sm font-semibold" style={{ color: "#111827" }}>{t("products.update_prices.export_label")}</div>
        </div>

        <div className="max-w-xl mx-auto text-center space-y-3 mb-6">
          <div>
            <label className="block text-sm mb-2" style={{ color: "#374151" }}>{t("products.import.file_label")}</label>
            <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="text-sm mx-auto"
              style={{ border: "1px solid #d1d5db", padding: 6, borderRadius: 6, backgroundColor: "#ffffff" }} />
          </div>
          <p className="text-xs" style={{ color: "#6b7280" }}>{t("products.import.ext_hint")}</p>
          <p className="text-xs" style={{ color: RED }}>{t("products.import.size_hint")}</p>
          <button type="submit" className="h-10 px-8 rounded-md text-white text-sm" style={{ backgroundColor: BLUE }}>{t("products.import.submit")}</button>
        </div>

        <div className="text-start text-sm" style={{ color: "#374151" }}>
          <div className="font-semibold mb-2">{t("products.update_prices.instructions")}</div>
          <ul className="list-disc pe-6 ps-6 space-y-1">
            <li>{t("products.update_prices.step1")}</li>
            <li>{t("products.update_prices.step2")}</li>
            <li>{t("products.update_prices.step3")}</li>
            <li>{t("products.update_prices.step4")}</li>
          </ul>
        </div>
      </DataCard>
    </form>
  );
}
