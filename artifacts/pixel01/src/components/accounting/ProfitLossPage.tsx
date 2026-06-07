import { useMemo, useState } from "react";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { inputStyle } from "@/components/sales/cashier/win7";
import { useProfitLoss, type PnlEvent } from "@/hooks/use-pnl";
import { useI18n } from "@/lib/i18n";
import { DateInput } from "@/components/shared/DateInput";
import { Printer } from "lucide-react";
import { SortableHead } from "@/components/shared/SortableHead";
import { useTableSort } from "@/components/shared/useTableSort";

type TabKey =
  | "items" | "groups" | "brands" | "invoices" | "dates" | "customers" | "weekdays";

export function ProfitLossPage() {
  const { dir } = useI18n();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tab, setTab] = useState<TabKey>("items");
  const { data, isLoading } = useProfitLoss(from || undefined, to || undefined, "all");
  const fmt = (n: number) => `${(Number(n) || 0).toFixed(2)} ج.م`;
  const align = dir === "rtl" ? "right" : "left";

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title="الدخل (الربح / الخسارة)" />

      {/* Filters */}
      <DataCard className="border-gray-300">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-gray-600 flex flex-col gap-1">
            من تاريخ
            <DateInput value={from} onChange={setFrom} style={inputStyle} />
          </label>
          <label className="text-xs text-gray-600 flex flex-col gap-1">
            إلى تاريخ
            <DateInput value={to} onChange={setTo} style={inputStyle} />
          </label>
        </div>
      </DataCard>

      {/* Two-column summary grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SummaryCard
          headerBg="#fff7ed"
          rows={[
            { label: "إجمالي المشتريات (السعر الإجمالي)", value: fmt(data?.totalPurchases ?? 0), accent: true },
            { label: "رسوم شحن وتوصيل المشتريات", value: fmt(0) },
            { label: "نفقات إضافية للمشتريات", value: fmt(0) },
            { label: "تكاليف النقل الداخلي", value: fmt(0) },
            { label: "إجمالي مرجع المبيعات", value: fmt(data?.totalReturns ?? 0) },
            { label: "خصومات مبيعات مسموح بها", value: fmt(data?.totalDiscountAllowed ?? 0) },
            { label: "خصومات نقاط مكافأة العملاء", value: fmt(0) },
            { divider: true },
            { label: "مجموع المصاريف", value: fmt(data?.totalExpenses ?? 0) },
            { label: "مكاسب / نتائج عمليات الجرد", value: fmt(0) },
            { label: "إجمالي الرواتب", value: fmt(0) },
            { label: "إجمالي تكلفة الإنتاج", value: fmt(0) },
            { divider: true },
            { label: "مخزون أول المدة - الافتتاحي (بسعر الشراء)", value: fmt(data?.openingStockCost ?? 0), highlight: "#dcfce7" },
            { label: "مخزون أول المدة - الافتتاحي (بسعر البيع)", value: fmt(data?.openingStockSale ?? 0), highlight: "#dcfce7" },
          ]}
        />
        <SummaryCard
          headerBg="#eff6ff"
          rows={[
            { label: "إجمالي المبيعات (السعر الإجمالي)", value: fmt(data?.totalSales ?? 0), accent: true },
            { label: "رسوم شحن وتوصيل المبيعات", value: fmt(0) },
            { label: "رسوم قيمة مضافة", value: fmt(data?.totalTax ?? 0) },
            { label: "إجمالي المخزون التالف", value: fmt(data?.totalDamaged ?? 0) },
            { label: "إجمالي مرجع المشتريات", value: fmt(data?.totalPurchaseReturns ?? 0) },
            { label: "خصومات مشتريات مكتسبة", value: fmt(0) },
            { label: "شروحات تسوية السيستم", value: fmt(0) },
            { label: "إيرادات الموديولات المضافة", value: fmt(0) },
            { divider: true },
            { label: "مخزون آخر المدة (بسعر الشراء)", value: fmt(data?.closingStockCost ?? 0), highlight: "#dbeafe" },
            { label: "مخزون آخر المدة (بسعر البيع)", value: fmt(data?.closingStockSale ?? 0), highlight: "#dbeafe" },
          ]}
        />
      </div>

      {/* Equation cards */}
      <div className="space-y-2">
        <EquationCard
          color="#fef3c7" border="#f59e0b" textColor="#92400e"
          title="تكلفة البضاعة المباعة" value={fmt(data?.cogs ?? 0)}
          formula="تكلفة البضاعة المباعة = مجموع تكلفة الأصناف المباعة (محاسبة مستمرة)"
        />
        <EquationCard
          color="#dbeafe" border="#3b82f6" textColor="#1e40af"
          title="إجمالي الربح" value={fmt(data?.grossProfit ?? 0)}
          formula="إجمالي الربح = صافي المبيعات − تكلفة البضاعة المباعة"
        />
        <EquationCard
          color="#dcfce7" border="#10b981" textColor="#166534"
          title="صافي الربح" value={fmt(data?.netProfit ?? 0)}
          formula="صافي الربح = إجمالي الربح + خصومات مشتريات مكتسبة + مرجع المشتريات − المصاريف − التالف − خصومات المبيعات المسموح بها"
        />
      </div>

      {/* Tabs + Table */}
      <DataCard className="border-gray-300">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex flex-wrap gap-1">
            {([
              ["items", "الربح حسب الأصناف"],
              ["groups", "الربح حسب المجموعات"],
              ["brands", "الربح حسب الماركات"],
              ["invoices", "الربح حسب الفاتورة"],
              ["dates", "الربح حسب التاريخ"],
              ["customers", "الربح حسب العملاء"],
              ["weekdays", "الربح حسب أيام الأسبوع"],
            ] as [TabKey, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={tabBtn(tab === k)}>
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-white text-sm"
            style={{ background: "#6366f1", border: "1px solid #4f46e5" }}
          >
            <Printer className="h-4 w-4" /> طباعة
          </button>
        </div>

        <BreakdownTable
          events={data?.events ?? []}
          items={data?.items ?? []}
          tab={tab}
          isLoading={isLoading}
          align={align as "right" | "left"}
        />

        <div className="text-[11px] text-gray-500 mt-3 pt-2 border-t" style={{ borderColor: "#e5e7eb" }}>
          ملاحظة: يعتبر الربح حسب الأصناف / الفئات / العلامات التجارية مجرد خصم مصفى، لا يتم أخذ خصم الفاتورة في الاعتبار.
        </div>
      </DataCard>
    </div>
  );
}

type Row = { label?: string; value?: string; accent?: boolean; divider?: boolean; highlight?: string };

function SummaryCard({ headerBg, rows }: { headerBg: string; rows: Row[] }) {
  return (
    <div className="rounded-md overflow-hidden" style={{ border: "1px solid #e5e7eb", background: "#fff" }}>
      <div style={{ background: headerBg, height: 6 }} />
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map((r, i) => {
            if (r.divider) {
              return <tr key={i}><td colSpan={2} style={{ height: 6, background: "#f9fafb" }} /></tr>;
            }
            const bg = r.highlight || (r.accent ? "#ecfccb" : i % 2 === 0 ? "#fff" : "#fafafa");
            return (
              <tr key={i} style={{ background: bg }}>
                <td style={{ padding: "8px 12px", fontSize: 12, color: "#374151", borderBottom: "1px solid #f3f4f6" }}>
                  {r.label}
                </td>
                <td style={{ padding: "8px 12px", fontSize: 12, color: "#111827", fontWeight: 600, textAlign: "end", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" }}>
                  {r.value}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EquationCard({ color, border, textColor, title, value, formula }: {
  color: string; border: string; textColor: string; title: string; value: string; formula: string;
}) {
  return (
    <div className="rounded-md p-3" style={{ background: color, borderInlineStart: `4px solid ${border}` }}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div style={{ fontWeight: 700, color: textColor, fontSize: 15 }}>
          {title}: <span style={{ fontSize: 18 }}>{value}</span>
        </div>
      </div>
      <div className="text-[11px] mt-1" style={{ color: textColor, opacity: 0.85 }}>{formula}</div>
    </div>
  );
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px", fontSize: 12, fontWeight: 600,
    color: active ? "#fff" : "#374151",
    background: active ? "#1d4ed8" : "#f3f4f6",
    border: "1px solid " + (active ? "#1d4ed8" : "#d1d5db"),
    borderRadius: 4,
  };
}

function BreakdownTable({
  events, items, tab, isLoading, align,
}: {
  events: PnlEvent[];
  items: { product_id: string; name: string; profit: number }[];
  tab: TabKey;
  isLoading: boolean;
  align: "right" | "left";
}) {
  const headStyle: React.CSSProperties = {
    backgroundColor: "#f9fafb", color: "#374151", padding: "8px 10px",
    fontWeight: 600, textAlign: align, fontSize: 12, borderBottom: "1px solid #d1d5db",
  };
  const cellStyle: React.CSSProperties = {
    borderBottom: "1px solid #e5e7eb", padding: "6px 10px", color: "#374151", fontSize: 12,
  };

  const rows = useMemo(() => {
    if (tab === "items") {
      return items.map((it) => ({ key: it.product_id, label: it.name, value: it.profit }));
    }
    const groupBy = (keyFn: (e: PnlEvent) => { id: string; label: string }) => {
      const map = new Map<string, { id: string; label: string; value: number }>();
      for (const e of events) {
        const { id, label } = keyFn(e);
        const prev = map.get(id) ?? { id, label, value: 0 };
        prev.value += e.profit;
        map.set(id, prev);
      }
      return Array.from(map.values())
        .map((r) => ({ key: r.id, label: r.label, value: r.value }))
        .sort((a, b) => b.value - a.value);
    };
    switch (tab) {
      case "groups":   return groupBy((e) => ({ id: e.category_id || "none", label: e.category_name }));
      case "brands":   return groupBy((e) => ({ id: e.brand_id || "none", label: e.brand_name }));
      case "invoices": return groupBy((e) => ({ id: e.invoice_id, label: e.invoice_number }));
      case "dates":    return groupBy((e) => ({ id: e.issue_date, label: e.issue_date }));
      case "customers":return groupBy((e) => ({ id: e.customer_id || "cash", label: e.customer_name }));
      case "weekdays": {
        const names = ["الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
        const arr = groupBy((e) => {
          const d = new Date(e.issue_date);
          const i = d.getDay();
          return { id: String(i), label: names[i] };
        });
        return arr.sort((a, b) => Number(a.key) - Number(b.key));
      }
      default: return [];
    }
  }, [tab, events, items]);

  const { sorted, sort, setSort } = useTableSort(rows);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const labelHead =
    tab === "items" ? "الصنف" :
    tab === "groups" ? "المجموعة" :
    tab === "brands" ? "الماركة" :
    tab === "invoices" ? "الفاتورة" :
    tab === "dates" ? "التاريخ" :
    tab === "customers" ? "العميل" : "اليوم";

  const cols = [
    { key: "label", label: labelHead, visible: true },
    { key: "value", label: "إجمالي الربح", visible: true },
  ];

  return (
    <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #d1d5db" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <SortableHead cols={cols} headStyle={headStyle} sort={sort} onSort={setSort} nonSortable={[]} />
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={2} style={{ ...cellStyle, textAlign: "center" }}>جاري التحميل…</td></tr>
          ) : sorted.length === 0 ? (
            <tr><td colSpan={2} style={{ ...cellStyle, textAlign: "center", color: "#9ca3af" }}>لا توجد بيانات</td></tr>
          ) : sorted.map((r) => (
            <tr key={r.key}>
              <td style={cellStyle}>{r.label}</td>
              <td style={{ ...cellStyle, fontWeight: 600, color: r.value >= 0 ? "#166534" : "#991b1b" }}>
                {r.value.toFixed(2)} ج.م
              </td>
            </tr>
          ))}
          {sorted.length > 0 && (
            <tr style={{ background: "#f3f4f6" }}>
              <td style={{ ...cellStyle, fontWeight: 700 }}>المجموع</td>
              <td style={{ ...cellStyle, fontWeight: 700, color: total >= 0 ? "#166534" : "#991b1b" }}>
                {total.toFixed(2)} ج.م
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
