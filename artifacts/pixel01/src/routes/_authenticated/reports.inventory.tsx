import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/products/PageHeader";

import { ReportTable, StatCard } from "@/components/reports/ReportTable";
import type { ColumnDef } from "@/components/products/TableToolbar";
import { toMainUnits, formatBaseQuantity } from "@/lib/units";
import { useI18n } from "@/lib/i18n";
import { CreditCard } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports/inventory")({
  component: InventoryReportPage,
});

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
  fontWeight: 600,
};

function InventoryReportPage() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const cur = (n: number) => t("reports.currency", { n: n.toFixed(2) });

  const [categoryId, setCategoryId] = useState<string>("");
  const [subCategoryId, setSubCategoryId] = useState<string>("");
  const [brandId, setBrandId] = useState<string>("");
  const [unit, setUnit] = useState<string>("");
  const [stockStatus, setStockStatus] = useState<string>("");

  const cols: ColumnDef[] = [
    { key: "card", label: "كرت الصنف", visible: true },
    { key: "sku", label: "SKU", visible: true },
    { key: "name", label: t("reports.col.name"), visible: true },
    { key: "category", label: t("reports.col.category"), visible: true },
    { key: "brand", label: "الماركة", visible: true },
    { key: "unit", label: "الوحدة", visible: true },
    { key: "price", label: t("reports.col.sale_price"), visible: true },
    { key: "stock", label: t("reports.col.stock"), visible: true },
    { key: "stock_value_cost", label: t("reports.col.stock_value_cost"), visible: true },
    { key: "stock_value_sell", label: t("reports.col.stock_value_sell"), visible: true },
    { key: "potential_profit", label: t("reports.col.potential_profit"), visible: true },
    { key: "sold_units", label: t("reports.col.sold_units"), visible: true },
    { key: "damaged_units", label: t("reports.col.damaged_units"), visible: true },
  ];

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["all-categories", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase.from("categories") as any)
        .select("id,name,parent_id").order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: brands = [] } = useQuery({
    queryKey: ["all-brands", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase.from("brands") as any)
        .select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const parentCategories = (categories as any[]).filter((c) => !c.parent_id);
  const subCategories = (categories as any[]).filter((c) => categoryId && c.parent_id === categoryId);
  const categoryById = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of categories as any[]) m.set(c.id, c);
    return m;
  }, [categories]);
  const brandById = useMemo(() => {
    const m = new Map<string, any>();
    for (const b of brands as any[]) m.set(b.id, b);
    return m;
  }, [brands]);

  const unitOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of products as any[]) {
      const u = p.main_unit || p.unit;
      if (u) set.add(u);
    }
    return Array.from(set).sort();
  }, [products]);

  const { data: soldMap = {} } = useQuery({
    queryKey: ["inventory-sold"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_items")
        .select("product_id, quantity, base_quantity, invoices!inner(type)")
        .not("product_id", "is", null);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data as any[]) ?? []) {
        const type = r.invoices?.type;
        const qty = Math.abs(Number(r.base_quantity ?? r.quantity ?? 0));
        if (!r.product_id || !qty) continue;
        if (type === "sale") map[r.product_id] = (map[r.product_id] || 0) + qty;
        else if (type === "sale_return") map[r.product_id] = (map[r.product_id] || 0) - qty;
      }
      return map;
    },
  });

  const { data: damagedMap = {} } = useQuery({
    queryKey: ["inventory-damaged"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("damaged_stock_items")
        .select("product_id, quantity, base_quantity")
        .not("product_id", "is", null);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data as any[]) ?? []) {
        const qty = Number(r.base_quantity ?? r.quantity ?? 0);
        if (!r.product_id || !qty) continue;
        map[r.product_id] = (map[r.product_id] || 0) + qty;
      }
      return map;
    },
  });

  const filteredProducts = useMemo(() => {
    return (products as any[]).filter((p) => {
      if (categoryId) {
        const cat = categoryById.get(p.category_id);
        // Match if product's category is the selected one OR a child of it
        const matches = p.category_id === categoryId || cat?.parent_id === categoryId;
        if (!matches) return false;
      }
      if (subCategoryId && p.category_id !== subCategoryId) return false;
      if (brandId && p.brand_id !== brandId) return false;
      if (unit) {
        const u = p.main_unit || p.unit;
        if (u !== unit) return false;
      }
      if (stockStatus) {
        const stock = Number(p.stock || 0);
        const threshold = Number(p.low_stock_threshold ?? 10);
        if (stockStatus === "in" && !(stock > threshold)) return false;
        if (stockStatus === "low" && !(stock > 0 && stock <= threshold)) return false;
        if (stockStatus === "out" && stock > 0) return false;
      }
      return true;
    });
  }, [products, categoryId, subCategoryId, brandId, unit, stockStatus, categoryById]);

  const rows = useMemo(
    () =>
      filteredProducts.map((p) => {
        const stockMain = toMainUnits(Number(p.stock || 0), p);
        const stockCost = stockMain * Number(p.cost || 0);
        const stockSell = stockMain * Number(p.price || 0);
        const soldBase = (soldMap as Record<string, number>)[p.id] || 0;
        const damagedBase = (damagedMap as Record<string, number>)[p.id] || 0;
        const cat = categoryById.get(p.category_id);
        const brand = brandById.get(p.brand_id);
        return {
          id: p.id,
          card: "",
          sku: p.sku || t("reports.dash"),
          name: p.name,
          category: cat?.name || t("reports.dash"),
          brand: brand?.name || t("reports.dash"),
          unit: p.main_unit || p.unit || t("reports.dash"),
          price: Number(p.price || 0).toFixed(2),
          stock: formatBaseQuantity(Number(p.stock || 0), p),
          stock_value_cost: stockCost,
          stock_value_sell: stockSell,
          potential_profit: stockSell - stockCost,
          sold_units: soldBase ? formatBaseQuantity(soldBase, p) : "0",
          damaged_units: damagedBase ? formatBaseQuantity(damagedBase, p) : "0",
        };
      }),
    [filteredProducts, soldMap, damagedMap, t, categoryById, brandById],
  );

  const totals = useMemo(() => {
    const cost = rows.reduce((s, r) => s + r.stock_value_cost, 0);
    const sell = rows.reduce((s, r) => s + r.stock_value_sell, 0);
    const profit = rows.reduce((s, r) => s + r.potential_profit, 0);
    const margin = cost > 0 ? ((profit / cost) * 100).toFixed(2) : "0.00";
    return { cost, sell, profit, margin };
  }, [rows]);

  const resetFilters = () => {
    setCategoryId(""); setSubCategoryId(""); setBrandId(""); setUnit(""); setStockStatus("");
  };

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("reports.inventory.title")} />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatCard label={t("reports.inventory.stock_at_cost")} value={cur(totals.cost)} />
        <StatCard label="مخزون آخر المدة (بسعر البيع)" value={cur(totals.sell)} accent="#3b82f6" />
        <StatCard label={t("reports.inventory.potential_profit")} value={cur(totals.profit)} accent="#10b981" />
        <StatCard label={t("reports.inventory.profit_margin")} value={`${totals.margin} %`} accent="#f59e0b" />
      </div>

      <div className="rounded-md p-3" style={{ border: "1px solid #e5e7eb", backgroundColor: "#ffffff" }}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label style={labelStyle}>المجموعة</label>
            <select style={inputStyle} value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubCategoryId(""); }}>
              <option value="">الكل</option>
              {parentCategories.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>المجموعة الفرعية</label>
            <select style={inputStyle} value={subCategoryId} onChange={(e) => setSubCategoryId(e.target.value)} disabled={!categoryId}>
              <option value="">الكل</option>
              {subCategories.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>الماركة</label>
            <select style={inputStyle} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">الكل</option>
              {(brands as any[]).map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>الوحدة</label>
            <select style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">الكل</option>
              {unitOptions.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>حالة المخزون</label>
            <select style={inputStyle} value={stockStatus} onChange={(e) => setStockStatus(e.target.value)}>
              <option value="">الكل</option>
              <option value="in">متوفر</option>
              <option value="low">منخفض</option>
              <option value="out">نفد</option>
            </select>
          </div>
        </div>
        {(categoryId || subCategoryId || brandId || unit || stockStatus) && (
          <button
            type="button"
            onClick={resetFilters}
            className="mt-2 text-xs"
            style={{ color: "#dc2626", textDecoration: "underline" }}
          >
            مسح الفلاتر
          </button>
        )}
      </div>

      <ReportTable
        rows={rows}
        initialCols={cols}
        rowKey={(r) => r.id}
        searchFields={(r) => `${r.sku} ${r.name} ${r.category} ${r.brand}`}
        cellFor={(r, k) => {
          if (k === "card") {
            return (
              <Link
                to="/products/$id/card"
                params={{ id: (r as any).id }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-white"
                style={{ backgroundColor: "#3b82f6" }}
              >
                <CreditCard className="h-3 w-3" /> كرت الصنف
              </Link>
            );
          }
          const v = (r as any)[k];
          if (typeof v === "number") return v.toFixed(2);
          return v;
        }}
        numericKeys={[
          "stock_value_cost",
          "stock_value_sell",
          "potential_profit",
        ]}
        exportName="inventory-report"
        printTitle="inventory-report"
      />
    </div>
  );
}
