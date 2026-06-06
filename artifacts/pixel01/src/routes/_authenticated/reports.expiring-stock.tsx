import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/products/PageHeader";
import { ReportTable, StatCard } from "@/components/reports/ReportTable";
import type { ColumnDef } from "@/components/products/TableToolbar";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/reports/expiring-stock")({
  component: ExpiringStockPage,
});

type Range = "30" | "60" | "90" | "180" | "expired" | "all";

function ExpiringStockPage() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const [range, setRange] = useState<Range>("30");

  // Compute batches by aggregating purchase_items, invoice_items, damaged_stock_items per (product, expiry).
  const { data: batches = [] } = useQuery({
    queryKey: ["expiring-stock-batches", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [pi, ii, di, prods] = await Promise.all([
        (supabase.from("purchase_items") as any)
          .select("product_id, expiry_date, quantity, base_quantity, unit_price")
          .not("expiry_date", "is", null)
          .not("product_id", "is", null),
        (supabase.from("invoice_items") as any)
          .select("product_id, expiry_date, quantity, base_quantity, invoices!inner(type)")
          .not("expiry_date", "is", null)
          .not("product_id", "is", null),
        (supabase.from("damaged_stock_items") as any)
          .select("product_id, expiry_date, quantity, base_quantity")
          .not("expiry_date", "is", null)
          .not("product_id", "is", null),
        supabase.from("products").select("id,name,sku,main_unit,unit,cost"),
      ]);
      if (pi.error) throw pi.error;
      if (ii.error) throw ii.error;
      if (di.error) throw di.error;
      if (prods.error) throw prods.error;

      const prodMap = new Map<string, any>();
      for (const p of (prods.data as any[]) ?? []) prodMap.set(p.id, p);

      type Key = string; // `${product_id}|${expiry}`
      const map = new Map<Key, { product_id: string; expiry: string; qty: number; cost: number }>();
      const ensure = (pid: string, exp: string) => {
        const k = `${pid}|${exp}`;
        if (!map.has(k)) map.set(k, { product_id: pid, expiry: exp, qty: 0, cost: Number(prodMap.get(pid)?.cost || 0) });
        return map.get(k)!;
      };
      for (const r of (pi.data as any[]) ?? []) {
        ensure(r.product_id, r.expiry_date).qty += Number(r.base_quantity ?? r.quantity ?? 0);
      }
      for (const r of (ii.data as any[]) ?? []) {
        const q = Math.abs(Number(r.base_quantity ?? r.quantity ?? 0));
        const isReturn = r.invoices?.type === "sale_return";
        ensure(r.product_id, r.expiry_date).qty += isReturn ? q : -q;
      }
      for (const r of (di.data as any[]) ?? []) {
        ensure(r.product_id, r.expiry_date).qty -= Number(r.base_quantity ?? r.quantity ?? 0);
      }

      return Array.from(map.values()).map((b) => {
        const p = prodMap.get(b.product_id);
        return {
          id: `${b.product_id}|${b.expiry}`,
          product_id: b.product_id,
          name: p?.name ?? "—",
          sku: p?.sku ?? "—",
          unit: p?.main_unit || p?.unit || "—",
          quantity: b.qty,
          expiry: b.expiry,
          cost: b.cost,
        };
      });
    },
  });

  const filtered = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (batches as any[])
      .filter((b) => Number(b.quantity) > 0)
      .map((b) => {
        const exp = new Date(b.expiry);
        const diffDays = Math.floor((exp.getTime() - today.getTime()) / 86400000);
        return {
          ...b,
          days_left: diffDays,
          status: diffDays < 0 ? "منتهي" : diffDays <= 30 ? "وشيك" : diffDays <= 90 ? "قريب" : "ساري",
          value: Number(b.quantity) * Number(b.cost || 0),
        };
      })
      .filter((r) => {
        if (range === "all") return true;
        if (range === "expired") return r.days_left < 0;
        const days = Number(range);
        return r.days_left >= 0 && r.days_left <= days;
      })
      .sort((a, b) => a.days_left - b.days_left);
  }, [batches, range]);

  const totals = useMemo(() => {
    const expired = filtered.filter((r) => r.days_left < 0).length;
    const soon = filtered.filter((r) => r.days_left >= 0 && r.days_left <= 30).length;
    const value = filtered.reduce((s, r) => s + r.value, 0);
    return { expired, soon, value, total: filtered.length };
  }, [filtered]);

  const cols: ColumnDef[] = [
    { key: "sku", label: "SKU", visible: true },
    { key: "name", label: "اسم الصنف", visible: true },
    { key: "quantity", label: "الكمية المتبقية", visible: true },
    { key: "unit", label: "الوحدة", visible: true },
    { key: "expiry", label: "تاريخ الصلاحية", visible: true },
    { key: "days_left", label: "الأيام المتبقية", visible: true },
    { key: "status", label: "الحالة", visible: true },
    { key: "value", label: "قيمة المخزون", visible: true },
  ];

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("reports.expiring.title")} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="إجمالي الأصناف" value={String(totals.total)} accent="#3b82f6" />
        <StatCard label="منتهية الصلاحية" value={String(totals.expired)} accent="#ef4444" />
        <StatCard label="تنتهي خلال 30 يوم" value={String(totals.soon)} accent="#f59e0b" />
        <StatCard label="قيمة المخزون" value={t("reports.currency", { n: totals.value.toFixed(2) })} accent="#10b981" />
      </div>

      <div className="rounded-md p-3" style={{ border: "1px solid #e5e7eb", backgroundColor: "#ffffff" }}>
        <div className="flex flex-wrap items-center gap-3">
          <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>الفترة:</span>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="h-9 px-3 rounded-md text-sm outline-none"
            style={{ border: "1px solid #d1d5db", backgroundColor: "#fff" }}
          >
            <option value="30">خلال 30 يوم</option>
            <option value="60">خلال 60 يوم</option>
            <option value="90">خلال 90 يوم</option>
            <option value="180">خلال 180 يوم</option>
            <option value="expired">المنتهية فقط</option>
            <option value="all">الكل</option>
          </select>
        </div>
      </div>

      <ReportTable
        rows={filtered}
        initialCols={cols}
        rowKey={(r) => r.id}
        searchFields={(r) => `${r.sku} ${r.name}`}
        cellFor={(r, k) => {
          const v = (r as any)[k];
          if (k === "value") return Number(v).toFixed(2);
          if (k === "quantity") return Number(v).toFixed(2);
          if (k === "days_left") {
            const n = Number(v);
            const color = n < 0 ? "#dc2626" : n <= 30 ? "#d97706" : "#059669";
            return <span style={{ fontWeight: 700, color }}>{n}</span>;
          }
          if (k === "status") {
            const colors: Record<string, string> = {
              "منتهي": "#dc2626",
              "وشيك": "#d97706",
              "قريب": "#ca8a04",
              "ساري": "#059669",
            };
            return <span style={{ fontWeight: 700, color: colors[v] || "#374151" }}>{v}</span>;
          }
          return v ?? "—";
        }}
        numericKeys={["quantity", "value"]}
        exportName="expiring-stock-report"
        printTitle="تقرير صلاحية الأصناف"
      />
    </div>
  );
}
