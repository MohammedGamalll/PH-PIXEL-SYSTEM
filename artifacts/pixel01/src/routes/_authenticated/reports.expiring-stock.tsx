import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/products/PageHeader";
import { ReportTable, StatCard } from "@/components/reports/ReportTable";
import type { ColumnDef } from "@/components/products/TableToolbar";
import { useI18n } from "@/lib/i18n";
import { batchStockValue, fetchExpiringBatches } from "@/lib/expiring-batches";
import { formatBaseQuantity } from "@/lib/units";

export const Route = createFileRoute("/_authenticated/reports/expiring-stock")({
  component: ExpiringStockPage,
});

type Range = "30" | "60" | "90" | "180" | "expired" | "all";

function ExpiringStockPage() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const [range, setRange] = useState<Range>("all");

  const { data: batches = [] } = useQuery({
    queryKey: ["expiring-stock-batches", user?.id],
    enabled: !!user,
    queryFn: fetchExpiringBatches,
  });

  const filtered = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (batches as any[])
      .map((b) => {
        const exp = new Date(b.expiry);
        const diffDays = Math.floor((exp.getTime() - today.getTime()) / 86400000);
        return {
          ...b,
          days_left: diffDays,
          status: diffDays < 0 ? "منتهي" : diffDays <= 30 ? "وشيك" : diffDays <= 90 ? "قريب" : "ساري",
          value: batchStockValue(b),
        };
      })
      .filter((r) => {
        if (range === "all") return true;
        if (range === "expired") return r.days_left < 0;
        const days = Number(range);
        return r.days_left >= 0 && r.days_left <= days && Number(r.quantity) > 0;
      })
      .filter((r) => {
        if (range === "all" || range === "expired") return true;
        return Number(r.quantity) > 0;
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
            <option value="all">الكل</option>
            <option value="30">خلال 30 يوم</option>
            <option value="60">خلال 60 يوم</option>
            <option value="90">خلال 90 يوم</option>
            <option value="180">خلال 180 يوم</option>
            <option value="expired">المنتهية فقط</option>
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
          if (k === "quantity") return formatBaseQuantity(Number(v), r as any);
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
