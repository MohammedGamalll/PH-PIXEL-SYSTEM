import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useRef, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useProductStockForCurrentWarehouse } from "@/hooks/use-warehouse-stock";
import {
  Receipt, FileText, ShoppingCart, DollarSign, ArrowLeftRight,
  Download, AlertTriangle, RotateCcw, CalendarIcon, Printer, FileSpreadsheet, type LucideIcon,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { DataCard } from "@/components/products/DataCard";
import { PendingOrdersTable, PendingShipmentsTable } from "@/components/dashboard/PendingTables";
import { ContactPaymentModal } from "@/components/sales/cashier/ContactPaymentModal";
import { useContactBalances, computeContactDue } from "@/hooks/use-contact-balances";
import { Wallet } from "lucide-react";
import { TreasuryWidget } from "@/components/dashboard/TreasuryWidget";
import * as csvExporter from "@/lib/csv";
import { printTableElement } from "@/lib/print-table";
import { formatBaseQuantity } from "@/lib/units";

export const Route = createFileRoute("/_authenticated/monitoring")({
  head: () => ({
    meta: [
      { title: "لوحة المتابعة" },
      { name: "description", content: "لوحة المتابعة — ملخص مالي ومبيعات" },
    ],
  }),
  component: MonitoringPage,
});

type Preset = "today" | "yesterday" | "7" | "30" | "month" | "custom";

function getRange(preset: Preset, custom: { from?: Date; to?: Date }) {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (preset === "today") return { start, end };
  if (preset === "yesterday") {
    start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999); return { start, end };
  }
  if (preset === "7") { start.setDate(start.getDate() - 6); return { start, end }; }
  if (preset === "30") { start.setDate(start.getDate() - 29); return { start, end }; }
  if (preset === "month") { start.setDate(1); return { start, end }; }
  if (preset === "custom" && custom.from) {
    const s = new Date(custom.from); s.setHours(0, 0, 0, 0);
    const e = new Date(custom.to ?? custom.from); e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }
  start.setDate(start.getDate() - 29); return { start, end };
}

type StatCard = { label: string; value: number; color: string; icon: LucideIcon };

function MonitoringPage() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const userId = user?.id;
  const queryClient = useQueryClient();

  // Force-refresh customer/supplier debts on monitoring page enter
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["contact-balances"] });
    queryClient.invalidateQueries({ queryKey: ["monitoring-cust-contacts"] });
    queryClient.invalidateQueries({ queryKey: ["monitoring-supp-contacts"] });
    queryClient.invalidateQueries({ queryKey: ["monitoring-stats"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [pay, setPay] = useState<{ id: string; direction: "in" | "out" } | null>(null);

  const [preset, setPreset] = useState<Preset>("30");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const { start, end } = useMemo(() => getRange(preset, customRange), [preset, customRange]);
  const startISO = start.toISOString().slice(0, 10);
  const endISO = end.toISOString().slice(0, 10);

  const { data: stats } = useQuery({
    queryKey: ["monitoring-stats", userId, startISO, endISO],
    enabled: !!userId,
    queryFn: async () => {
      const [inv, pur, exp, salesRet, purRet, tx] = await Promise.all([
        supabase.from("invoices").select("id, total, paid_amount, status, issue_date, type")
          .in("type", ["sale", "sale_return"])
          .gte("issue_date", startISO).lte("issue_date", endISO),
        supabase.from("purchases").select("total, status, payment_status, due_amount, purchase_date")
          .gte("purchase_date", startISO).lte("purchase_date", endISO),
        supabase.from("expenses").select("amount, expense_date")
          .gte("expense_date", startISO).lte("expense_date", endISO),
        supabase.from("invoices").select("total, issue_date, type, status")
          .eq("type", "sale_return")
          .gte("issue_date", startISO).lte("issue_date", endISO),
        supabase.from("purchase_returns").select("total_amount, return_date")
          .gte("return_date", startISO).lte("return_date", endISO),
        // Treasury transactions = single source of truth for actual cash
        // movement across ALL treasury accounts / payment methods.
        // RLS (tt_select_own) scopes to current owner automatically.
        supabase.from("treasury_transactions")
          .select("type, amount, is_reversal, transaction_date")
          .gte("transaction_date", startISO).lte("transaction_date", endISO),
      ]);

      // Exclude cancelled invoices from every revenue/debt metric.
      const allInvoices = (inv.data ?? []).filter((i: any) => i.status !== "cancelled");
      const saleInvoices = allInvoices.filter((i: any) => i.type === "sale");
      const saleReturnInvoices = allInvoices.filter((i: any) => i.type === "sale_return");
      // Exclude cancelled purchases too.
      const purchases = (pur.data ?? []).filter((p: any) => p.status !== "cancelled");
      const expenses = exp.data ?? [];
      const sum = (arr: any[], k: string) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);

      const totalSales = sum(saleInvoices, "total");
      // Outstanding receivables = unpaid remainder per invoice (not full total).
      const dueSales = saleInvoices.reduce(
        (a, i: any) => a + Math.max(0, Number(i.total || 0) - Number(i.paid_amount || 0)),
        0,
      );
      const totalPurchases = sum(purchases, "total");
      const totalExpenses = sum(expenses, "amount");
      // Sales returns: use the non-cancelled subset from the second query, but
      // intersect with status filter to be safe.
      const salesReturns = ((salesRet.data ?? []) as any[])
        .filter((r) => r.status !== "cancelled")
        .reduce((a, r) => a + Number(r.total || 0), 0);
      const purchaseReturns = sum(purRet.data ?? [], "total_amount");

      // ---- COGS (Cost of Goods Sold) for accurate net income ----
      // Pull invoice_items cost snapshots for the non-cancelled sale +
      // sale_return invoices in this period. cost_at_time captures the unit
      // cost at the moment of sale, which is the correct COGS basis.
      const saleIds = saleInvoices.map((i: any) => i.id);
      const returnIds = saleReturnInvoices.map((i: any) => i.id);
      const allIds = [...saleIds, ...returnIds];
      let cogs = 0;
      let cogsReturns = 0;
      if (allIds.length > 0) {
        const typeById = new Map<string, string>();
        saleIds.forEach((id: string) => typeById.set(id, "sale"));
        returnIds.forEach((id: string) => typeById.set(id, "sale_return"));
        // Page through invoice_items in chunks of 500 ids to stay under URL limits.
        const items: any[] = [];
        for (let i = 0; i < allIds.length; i += 500) {
          const slice = allIds.slice(i, i + 500);
          const { data } = await supabase
            .from("invoice_items")
            .select("invoice_id, quantity, cost_at_time")
            .in("invoice_id", slice);
          items.push(...((data ?? []) as any[]));
        }
        for (const it of items) {
          const cost = Number(it.quantity || 0) * Number(it.cost_at_time || 0);
          if (typeById.get(it.invoice_id) === "sale_return") {
            cogsReturns += cost;
          } else {
            cogs += cost;
          }
        }
      }
      const netCOGS = cogs - cogsReturns;

      // Net income = Sales − Sales Returns − COGS − Expenses.
      // Purchases are NOT subtracted (they're inventory acquisitions, not
      // expenses; only the cost of items actually SOLD reduces profit).
      const netIncome = totalSales - salesReturns - netCOGS - totalExpenses;

      // Cash collected (net): all "in" treasury transactions minus the "out"
      // rows that are reversals of prior cash-in.
      const treasury = (tx.data ?? []) as any[];
      const cashIn = treasury
        .filter((t) => t.type === "in" && !t.is_reversal)
        .reduce((a, t) => a + Number(t.amount || 0), 0);
      const cashReversals = treasury
        .filter((t) => t.type === "out" && t.is_reversal)
        .reduce((a, t) => a + Number(t.amount || 0), 0);
      const totalPayments = Math.max(0, cashIn - cashReversals);

      return {
        totalSales, netIncome, dueSales, salesReturns,
        totalPurchases, purchaseReturns, totalExpenses, totalPayments,
        cogs: netCOGS,
      };
    },
  });


  const { data: salesSeries } = useQuery({
    queryKey: ["monitoring-sales-series", userId, startISO, endISO],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("total, issue_date")
        .gte("issue_date", startISO).lte("issue_date", endISO);
      return data ?? [];
    },
  });

  const { data: yearSeries } = useQuery({
    queryKey: ["monitoring-year-series", userId],
    enabled: !!userId,
    queryFn: async () => {
      const since = new Date(); since.setMonth(0, 1); since.setHours(0,0,0,0);
      const { data } = await supabase
        .from("invoices").select("total, issue_date")
        .gte("issue_date", since.toISOString().slice(0, 10));
      return data ?? [];
    },
  });

  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    const cursor = new Date(start);
    while (cursor <= end) {
      map.set(cursor.toISOString().slice(0, 10), 0);
      cursor.setDate(cursor.getDate() + 1);
    }
    (salesSeries ?? []).forEach((row: any) => {
      const key = String(row.issue_date).slice(0, 10);
      if (map.has(key)) map.set(key, (map.get(key) || 0) + Number(row.total || 0));
    });
    return Array.from(map.entries()).map(([k, v]) => ({ day: format(new Date(k), "dd MMM"), total: v }));
  }, [salesSeries, start, end]);

  const yearChart = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({ month: format(new Date(2024, i, 1), "MMM"), total: 0 }));
    (yearSeries ?? []).forEach((row: any) => {
      const d = new Date(row.issue_date); months[d.getMonth()].total += Number(row.total || 0);
    });
    return months;
  }, [yearSeries]);

  // Use the same balance engine as the cashier / contact pages so the
  // figures match across the app and 1000-row caps don't hide accounts.
  const { data: unifiedBalances } = useContactBalances();

  const fetchAllContacts = async (type: "customer" | "supplier") => {
    const out: any[] = [];
    const page = 1000;
    for (let i = 0; ; i++) {
      const from = i * page;
      const to = from + page - 1;
      const { data, error } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, business_name, opening_balance, advance_balance")
        .in("type", [type, "both"])
        .range(from, to);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      out.push(...rows);
      if (rows.length < page) break;
    }
    return out;
  };

  const { data: customerContacts = [] } = useQuery({
    queryKey: ["monitoring-cust-contacts", userId],
    enabled: !!userId,
    queryFn: () => fetchAllContacts("customer"),
  });
  const { data: supplierContacts = [] } = useQuery({
    queryKey: ["monitoring-supp-contacts", userId],
    enabled: !!userId,
    queryFn: () => fetchAllContacts("supplier"),
  });

  const customerDebts = useMemo(() => {
    return (customerContacts as any[])
      .map((c) => {
        const name = c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
        const info = computeContactDue(c, unifiedBalances?.get(c.id));
        return { id: c.id, name, due: info.due };
      })
      .filter((x) => x.due > 0.01)
      .sort((a, b) => b.due - a.due);
  }, [customerContacts, unifiedBalances]);

  const supplierDebts = useMemo(() => {
    return (supplierContacts as any[])
      .map((c) => {
        const name = c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
        const info = computeContactDue(c, unifiedBalances?.get(c.id));
        return { id: c.id, name, due: info.due };
      })
      .filter((x) => x.due > 0.01)
      .sort((a, b) => b.due - a.due);
  }, [supplierContacts, unifiedBalances]);


  const { data: deliveredShipments = [] } = useQuery({
    queryKey: ["monitoring-delivered-shipments", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: invs } = await supabase
        .from("invoices")
        .select("invoice_number, shipping_status, customer_id, issue_date")
        .in("shipping_status", ["delivered", "shipped"])
        .order("issue_date", { ascending: false })
        .limit(10);
      const ids = Array.from(new Set((invs ?? []).map((i: any) => i.customer_id).filter(Boolean)));
      let nameMap = new Map<string, string>();
      if (ids.length > 0) {
        const { data: cs } = await supabase.from("contacts").select("id, first_name, last_name, business_name").in("id", ids);
        for (const c of (cs ?? []) as any[]) {
          nameMap.set(c.id, c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "—");
        }
      }
      return (invs ?? []).map((i: any) => ({
        invoice_number: i.invoice_number,
        customer: i.customer_id ? (nameMap.get(i.customer_id) || "—") : "—",
        status: i.shipping_status === "delivered" ? "تم التسليم" : "تم الشحن",
      }));
    },
  });

  const { data: lowStock = [] } = useQuery({
    queryKey: ["monitoring-low-stock", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("name, stock, unit").order("stock", { ascending: true }).limit(10);
      return data ?? [];
    },
  });

  const cards: StatCard[] = [
    { label: isAr ? "إجمالي المبيعات" : "Total sales", value: stats?.totalSales ?? 0, color: "#3b82f6", icon: ShoppingCart },
    { label: isAr ? "صافي الأرباح (مبيعات − تكلفة البضاعة − مصروفات)" : "Net profit (sales − COGS − expenses)", value: stats?.netIncome ?? 0, color: "#10b981", icon: DollarSign },
    { label: isAr ? "المبيعات الآجلة (الباقي غير المدفوع)" : "Sales due (unpaid remainder)", value: stats?.dueSales ?? 0, color: "#f59e0b", icon: FileText },
    { label: isAr ? "إجمالي مرتجع المبيعات" : "Sales returns", value: stats?.salesReturns ?? 0, color: "#ef4444", icon: ArrowLeftRight },
    { label: isAr ? "المصروفات" : "Expenses", value: stats?.totalExpenses ?? 0, color: "#ef4444", icon: Receipt },
    { label: isAr ? "إجمالي مرتجع المشتريات" : "Purchase returns", value: stats?.purchaseReturns ?? 0, color: "#ef4444", icon: RotateCcw },
    { label: isAr ? "إجمالي المشتريات (لا يدخل في الربح)" : "Total purchases (not in profit)", value: stats?.totalPurchases ?? 0, color: "#3b82f6", icon: Download },
    { label: isAr ? "إجمالي التحصيلات النقدية" : "Total cash collected", value: stats?.totalPayments ?? 0, color: "#8b5cf6", icon: AlertTriangle },
  ];

  const fmt = (n: number) => `${n.toFixed(2)} ${isAr ? "ج.م" : "EGP"}`;

  const presetLabel: Record<Preset, string> = {
    today: "اليوم", yesterday: "الأمس", "7": "آخر 7 أيام",
    "30": "آخر 30 يوم", month: "هذا الشهر", custom: "مخصص",
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: "#111827" }}>
          {isAr ? "لوحة المتابعة" : "Monitoring"}
        </h1>
        <div className="flex items-center gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">اليوم</SelectItem>
              <SelectItem value="yesterday">الأمس</SelectItem>
              <SelectItem value="7">آخر 7 أيام</SelectItem>
              <SelectItem value="30">آخر 30 يوم</SelectItem>
              <SelectItem value="month">هذا الشهر</SelectItem>
              <SelectItem value="custom">مخصص</SelectItem>
            </SelectContent>
          </Select>
          {preset === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {customRange.from
                    ? `${format(customRange.from, "yyyy-MM-dd")}${customRange.to ? ` → ${format(customRange.to, "yyyy-MM-dd")}` : ""}`
                    : "اختر النطاق"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={{ from: customRange.from, to: customRange.to }}
                  onSelect={(r: any) => setCustomRange({ from: r?.from, to: r?.to })}
                  className="p-3 pointer-events-auto"
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          )}
          <span className="text-xs text-muted-foreground hidden md:inline">{presetLabel[preset]}</span>
        </div>
      </div>

      <TreasuryWidget />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <div key={i} className="rounded-lg p-3 flex items-center justify-between gap-3"
            style={{ backgroundColor: "#ffffff", borderRight: `4px solid ${c.color}`, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${c.color}1a`, color: c.color }}>
              <c.icon className="h-5 w-5" />
            </div>
            <div className="flex-1 text-right min-w-0">
              <div className="text-xs text-muted-foreground mb-1 truncate">{c.label}</div>
              <div className="text-base font-bold" style={{ color: "#111827" }}>{fmt(c.value)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DataCard>
          <h2 className="text-base font-bold mb-3" style={{ color: "#111827" }}>المبيعات في النطاق المحدد</h2>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#374151" }} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11, fill: "#374151" }} />
                <Tooltip contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8 }} />
                <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </DataCard>

        <DataCard>
          <h2 className="text-base font-bold mb-3" style={{ color: "#111827" }}>السنة المالية الحالية</h2>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={yearChart} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#374151" }} />
                <YAxis tick={{ fontSize: 11, fill: "#374151" }} />
                <Tooltip contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8 }} />
                <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </DataCard>
      </div>

      <StockAlertWidget />

      <ExpiringStockWidget />

      <ExpiredWarrantyWidget />

      <PendingPurchasesWidget />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DebtTable
          title="ديون العملاء"
          subjectLabel="العميل"
          actionLabel="تحصيل دفعة"
          actionColor="#16a34a"
          rows={customerDebts as any[]}
          fmt={fmt}
          onPay={(id) => setPay({ id, direction: "in" })}
        />
        <DebtTable
          title="ديون الموردين"
          subjectLabel="المورد"
          actionLabel="دفع للمورد"
          actionColor="#dc2626"
          rows={supplierDebts as any[]}
          fmt={fmt}
          onPay={(id) => setPay({ id, direction: "out" })}
        />
        <MiniTable title="الشحنات المسلَّمة" emptyMsg="لا توجد بيانات في الجدول"
          headers={["الفاتورة رقم", "اسم العميل", "حالة الشحن"]}
          rows={(deliveredShipments as any[]).map((d) => [d.invoice_number, d.customer, d.status])} />
      </div>

      <PendingOrdersTable />
      <PendingShipmentsTable />

      <ContactPaymentModal
        open={!!pay}
        direction={pay?.direction ?? "in"}
        initialContactId={pay?.id}
        lockContact
        onClose={() => setPay(null)}
      />
    </div>
  );
}

function ExpiringStockWidget() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [months, setMonths] = useState(24);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["expiring-stock-batches-widget", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { fetchExpiringBatches } = await import("@/lib/expiring-batches");
      return fetchExpiringBatches();
    },
  });

  const items = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date();
    end.setMonth(end.getMonth() + months);
    const endStr = end.toISOString().slice(0, 10);
    return (batches as any[]).filter(
      (b) => b.expiry >= today && b.expiry <= endStr,
    ).sort((a, b) => a.expiry.localeCompare(b.expiry));
  }, [batches, months]);

  const headers = ["#", isAr ? "الصنف" : "Product", isAr ? "المتبقي" : "Stock", isAr ? "تاريخ الانتهاء" : "Expiry", isAr ? "الأيام المتبقية" : "Days Left", isAr ? "سعر الشراء" : "Cost", isAr ? "سعر البيع" : "Price", isAr ? "الوحدة" : "Unit"];
  const rows = (items as any[]).map((p, i) => {
    const days = Math.ceil((new Date(p.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return [i + 1, p.name, formatBaseQuantity(Number(p.quantity || 0), p), p.expiry, days, Number(p.cost || 0), Number(p.price || 0), p.unit || "—"];
  });

  return (
    <div className="rounded-xl border border-gray-300 bg-white shadow-soft">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300 gap-2 flex-wrap" style={{ backgroundColor: "#fff7ed" }}>
        <div className="flex items-center gap-2" style={{ color: "#9a3412" }}>
          <CalendarIcon className="h-5 w-5" />
          <h2 className="font-semibold">{isAr ? "أصناف قاربت على انتهاء الصلاحية" : "Expiring Stock"}</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportBar
            onCsv={() => csvExporter.exportToCsv("expiring-stock.csv", headers, rows)}
            onXls={() => csvExporter.exportToXls("expiring-stock.xls", headers, rows)}
            onPrint={() => printTableElement(printRef.current, isAr ? "أصناف قاربت على انتهاء الصلاحية" : "Expiring Stock")}
          />
          <span className="text-xs" style={{ color: "#9a3412" }}>{isAr ? "خلال" : "Within"}</span>
          <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 6, 9, 12, 18, 24, 36, 60].map((m) => (
                <SelectItem key={m} value={String(m)}>{m} {isAr ? "شهر" : "month(s)"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs" style={{ color: "#9a3412" }}>
            {isAr ? `${items.length} صنف` : `${items.length} items`}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto" ref={printRef}>
        {isLoading ? (
          <div className="p-4 text-sm text-gray-500">{isAr ? "جارٍ التحميل…" : "Loading…"}</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">
            {isAr ? "لا توجد أصناف قاربت على الانتهاء" : "No expiring items"}
          </div>
        ) : (
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }} dir={isAr ? "rtl" : "ltr"}>
            <thead style={{ backgroundColor: "#f3f4f6" }}>
              <tr>
                {headers.map((h) => (
                  <th key={h} className="text-right p-2" style={{ border: "1px solid #d1d5db", color: "#374151" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(items as any[]).slice(0, 20).map((p: any, i: number) => {
                const days = Math.ceil((new Date(p.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const bg = days <= 30 ? "#fecaca" : days <= 60 ? "#fed7aa" : "#fef3c7";
                const fg = days <= 30 ? "#991b1b" : days <= 60 ? "#9a3412" : "#92400e";
                return (
                  <tr key={p.id}>
                    <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{i + 1}</td>
                    <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{p.name}</td>
                    <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{formatBaseQuantity(Number(p.quantity || 0), p)}</td>
                    <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{p.expiry}</td>
                    <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>
                      <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: bg, color: fg }}>
                        {days} {isAr ? "يوم" : "days"}
                      </span>
                    </td>
                    <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{Number(p.cost || 0).toFixed(2)}</td>
                    <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{Number(p.price || 0).toFixed(2)}</td>
                    <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{p.unit || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PendingPurchasesWidget() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const printRef = useRef<HTMLDivElement>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["pending-purchases", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: purs } = await (supabase.from("purchases") as any)
        .select("id, ref_no, purchase_date, status, payment_status, total, paid_amount, supplier_id")
        .in("status", ["pending", "ordered", "received"])
        .order("purchase_date", { ascending: false })
        .limit(10);
      const ids = Array.from(new Set((purs ?? []).map((p: any) => p.supplier_id).filter(Boolean)));
      let nameMap = new Map<string, string>();
      if (ids.length > 0) {
        const { data: sups } = await (supabase.from("suppliers") as any).select("id, name").in("id", ids);
        for (const s of (sups ?? []) as any[]) nameMap.set(s.id, s.name || "—");
      }
      return (purs ?? []).map((p: any) => ({
        ref_no: p.ref_no || "—",
        date: p.purchase_date,
        supplier: p.supplier_id ? (nameMap.get(p.supplier_id) || "—") : "—",
        status: p.status,
        payment_status: p.payment_status,
        total: Number(p.total || 0),
        due: Number(p.total || 0) - Number(p.paid_amount || 0),
      }));
    },
  });

  const fmt = (n: number) => `${n.toFixed(2)} ${isAr ? "ج.م" : "EGP"}`;
  const statusLabel: Record<string, string> = { pending: "قيد الانتظار", ordered: "تم الطلب", received: "تم الاستلام" };
  const headers = [isAr ? "المرجع" : "Ref", isAr ? "التاريخ" : "Date", isAr ? "المورد" : "Supplier", isAr ? "الحالة" : "Status", isAr ? "الإجمالي" : "Total", isAr ? "المستحق" : "Due"];
  const rows = (items as any[]).map((p) => [p.ref_no, p.date, p.supplier, statusLabel[p.status] || p.status, p.total, p.due]);

  return (
    <div className="rounded-xl border border-gray-300 bg-white shadow-soft">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300 gap-2 flex-wrap" style={{ backgroundColor: "#eff6ff" }}>
        <div className="flex items-center gap-2" style={{ color: "#1e40af" }}>
          <Download className="h-5 w-5" />
          <h2 className="font-semibold">{isAr ? "طلبيات الشراء الحالية" : "Pending Purchase Orders"}</h2>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <ExportBar
            onCsv={() => csvExporter.exportToCsv("pending-purchases.csv", headers, rows)}
            onXls={() => csvExporter.exportToXls("pending-purchases.xls", headers, rows)}
            onPrint={() => printTableElement(printRef.current, isAr ? "طلبيات الشراء الحالية" : "Pending Purchases")}
          />
          <span className="text-xs" style={{ color: "#1e40af" }}>
            {isAr ? `${items.length} طلبية` : `${items.length} orders`}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto" ref={printRef}>
        {isLoading ? (
          <div className="p-4 text-sm text-gray-500">{isAr ? "جارٍ التحميل…" : "Loading…"}</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">{isAr ? "لا توجد طلبيات حالية" : "No pending orders"}</div>
        ) : (
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }} dir={isAr ? "rtl" : "ltr"}>
            <thead style={{ backgroundColor: "#f3f4f6" }}>
              <tr>
                {headers.map((h) => (
                  <th key={h} className="text-right p-2" style={{ border: "1px solid #d1d5db", color: "#374151" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(items as any[]).map((p, i) => (
                <tr key={i}>
                  <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{p.ref_no}</td>
                  <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{p.date}</td>
                  <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{p.supplier}</td>
                  <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>
                    <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: "#dbeafe", color: "#1e40af" }}>
                      {statusLabel[p.status] || p.status}
                    </span>
                  </td>
                  <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{fmt(p.total)}</td>
                  <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{fmt(p.due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


function StockAlertWidget() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const printRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState<number | "all">(25);
  const [page, setPage] = useState(1);

  const { data: pwsMap = {} } = useProductStockForCurrentWarehouse();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["stock-alert", user?.id, pwsMap],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase.from("products") as any)
        .select("id, name, stock, low_stock_threshold, unit, cost, price, main_unit, sub_unit_1, sub_unit_1_ratio, sub_unit_2, sub_unit_2_ratio");
      if (error) throw error;
      return (data ?? [])
        .map((p: any) => ({ ...p, stock: pwsMap[p.id] ?? Number(p.stock ?? 0) }))
        .filter((p: any) => Number(p.stock || 0) <= Number(p.low_stock_threshold ?? 10))
        .sort((a: any, b: any) => Number(a.stock || 0) - Number(b.stock || 0));
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items as any[];
    return (items as any[]).filter((p: any) => String(p.name || "").toLowerCase().includes(q));
  }, [items, search]);

  const total = filtered.length;
  const effectiveSize = pageSize === "all" ? Math.max(total, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(total / effectiveSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * effectiveSize;
  const pageItems = filtered.slice(pageStart, pageStart + effectiveSize);

  useEffect(() => { setPage(1); }, [search, pageSize, total]);

  const headers = ["#", isAr ? "الصنف" : "Product", isAr ? "المتبقي" : "Remaining", isAr ? "حد التنبيه" : "Threshold", isAr ? "سعر الشراء" : "Cost", isAr ? "سعر البيع" : "Price"];
  const rows = filtered.map((p, i) => [i + 1, p.name, formatBaseQuantity(Number(p.stock || 0), p), p.low_stock_threshold ?? 10, Number(p.cost || 0), Number(p.price || 0)]);

  const sizeOptions: Array<number | "all"> = [10, 25, 50, 100, 500, 1000, "all"];

  return (
    <div className="rounded-xl border border-gray-300 bg-white shadow-soft">
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-gray-300 gap-2 flex-wrap"
        style={{ backgroundColor: "#fef2f2" }}
      >
        <div className="flex items-center gap-2" style={{ color: "#991b1b" }}>
          <AlertTriangle className="h-5 w-5" />
          <h2 className="font-semibold">
            {isAr ? "تقرير تنبيه المخزون" : "Stock Alert Report"}
          </h2>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <ExportBar
            onCsv={() => csvExporter.exportToCsv("stock-alert.csv", headers, rows)}
            onXls={() => csvExporter.exportToXls("stock-alert.xls", headers, rows)}
            onPrint={() => printTableElement(printRef.current, isAr ? "تقرير تنبيه المخزون" : "Stock Alert")}
          />
          <span className="text-xs" style={{ color: "#7f1d1d" }}>
            {isAr ? `${total} صنف` : `${total} items`}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap px-4 py-2 border-b border-gray-200" style={{ backgroundColor: "#fafafa" }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isAr ? "بحث بالاسم…" : "Search…"}
          className="h-8 px-2 rounded border border-gray-300 text-sm flex-1 min-w-[150px]"
        />
        <label className="text-xs flex items-center gap-1" style={{ color: "#374151" }}>
          {isAr ? "عرض:" : "Show:"}
          <select
            value={String(pageSize)}
            onChange={(e) => setPageSize(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="h-8 px-2 rounded border border-gray-300 text-sm"
          >
            {sizeOptions.map((s) => (
              <option key={String(s)} value={String(s)}>{s === "all" ? (isAr ? "الكل" : "All") : s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto" ref={printRef}>
        {isLoading ? (
          <div className="p-4 text-sm text-gray-500">{isAr ? "جارٍ التحميل…" : "Loading…"}</div>
        ) : total === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">
            {isAr ? "لا توجد أصناف تحت حد التنبيه" : "No items below threshold"}
          </div>
        ) : (
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }} dir={isAr ? "rtl" : "ltr"}>
            <thead style={{ backgroundColor: "#f3f4f6" }}>
              <tr>
                {headers.map((h) => (
                  <th key={h} className="text-right p-2" style={{ border: "1px solid #d1d5db", color: "#374151" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p: any, i: number) => {
                const stock = Number(p.stock || 0);
                const isOut = stock <= 0;
                return (
                  <tr key={p.id}>
                    <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{pageStart + i + 1}</td>
                    <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{p.name}</td>
                    <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>
                      <span className="px-2 py-0.5 rounded text-xs font-semibold"
                        style={{ backgroundColor: isOut ? "#fecaca" : "#fef3c7", color: isOut ? "#991b1b" : "#92400e" }}>
                        {formatBaseQuantity(stock, p)}
                      </span>
                    </td>
                    <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{p.low_stock_threshold ?? 10}</td>
                    <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{Number(p.cost || 0).toFixed(2)}</td>
                    <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{Number(p.price || 0).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {total > 0 && pageSize !== "all" && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 text-xs" style={{ color: "#374151" }}>
          <span>{isAr ? `صفحة ${safePage} من ${totalPages}` : `Page ${safePage} / ${totalPages}`}</span>
          <div className="flex gap-1">
            <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40">{isAr ? "السابق" : "Prev"}</button>
            <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40">{isAr ? "التالي" : "Next"}</button>
          </div>
        </div>
      )}
    </div>
  );
}


function ExpiredWarrantyWidget() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const printRef = useRef<HTMLDivElement>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["expired-warranty-v2", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await (supabase.from("invoice_items") as any)
        .select("id, description, product_id, product_name_snapshot, warranty_end_date, quantity, invoices!inner(invoice_number, issue_date, customer_id, type)")
        .not("warranty_end_date", "is", null)
        .lt("warranty_end_date", today)
        .order("warranty_end_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = (data ?? []).filter((r: any) => r.invoices?.type === "sale");
      const ids = Array.from(new Set(rows.map((r: any) => r.invoices?.customer_id).filter(Boolean))) as string[];
      let nameMap = new Map<string, string>();
      if (ids.length > 0) {
        const { data: cs } = await supabase.from("contacts").select("id, first_name, last_name, business_name").in("id", ids);
        for (const c of (cs ?? []) as any[]) {
          nameMap.set(c.id, c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "—");
        }
      }
      const productIds = Array.from(new Set(rows.map((r: any) => r.product_id).filter(Boolean))) as string[];
      let prodMap = new Map<string, { cost: number; price: number }>();
      if (productIds.length > 0) {
        const { data: prods } = await (supabase.from("products") as any).select("id, cost, price").in("id", productIds);
        for (const p of (prods ?? []) as any[]) prodMap.set(p.id, { cost: Number(p.cost || 0), price: Number(p.price || 0) });
      }
      return rows.map((r: any) => {
        const pp = r.product_id ? prodMap.get(r.product_id) : undefined;
        return {
          id: r.id,
          name: r.product_name_snapshot || r.description,
          invoice_number: r.invoices?.invoice_number,
          customer: r.invoices?.customer_id ? (nameMap.get(r.invoices.customer_id) || "—") : "—",
          warranty_end_date: r.warranty_end_date,
          cost: pp?.cost ?? null,
          price: pp?.price ?? null,
          days_passed: Math.ceil((Date.now() - new Date(r.warranty_end_date).getTime()) / (1000 * 60 * 60 * 24)),
        };
      });
    },
  });

  const headers = ["#", isAr ? "الصنف" : "Product", isAr ? "الفاتورة" : "Invoice", isAr ? "العميل" : "Customer", isAr ? "نهاية الضمان" : "Warranty End", isAr ? "سعر الشراء" : "Cost", isAr ? "سعر البيع" : "Price", isAr ? "أيام منذ الانتهاء" : "Days Past"];
  const rows = (items as any[]).map((r, i) => [i + 1, r.name, r.invoice_number, r.customer, r.warranty_end_date, r.cost ?? "—", r.price ?? "—", r.days_passed]);

  return (
    <div className="rounded-xl border border-gray-300 bg-white shadow-soft">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300 gap-2 flex-wrap" style={{ backgroundColor: "#fef2f2" }}>
        <div className="flex items-center gap-2" style={{ color: "#991b1b" }}>
          <AlertTriangle className="h-5 w-5" />
          <h2 className="font-semibold">{isAr ? "أصناف خارج الضمان" : "Out of Warranty"}</h2>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <ExportBar
            onCsv={() => csvExporter.exportToCsv("expired-warranty.csv", headers, rows)}
            onXls={() => csvExporter.exportToXls("expired-warranty.xls", headers, rows)}
            onPrint={() => printTableElement(printRef.current, isAr ? "أصناف خارج الضمان" : "Expired Warranty")}
          />
          <span className="text-xs" style={{ color: "#7f1d1d" }}>
            {isAr ? `${items.length} صنف` : `${items.length} items`}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto" ref={printRef}>
        {isLoading ? (
          <div className="p-4 text-sm text-gray-500">{isAr ? "جارٍ التحميل…" : "Loading…"}</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">
            {isAr ? "لا توجد أصناف خارج الضمان" : "No items out of warranty"}
          </div>
        ) : (
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }} dir={isAr ? "rtl" : "ltr"}>
            <thead style={{ backgroundColor: "#f3f4f6" }}>
              <tr>
                {headers.map((h) => (
                  <th key={h} className="text-right p-2" style={{ border: "1px solid #d1d5db", color: "#374151" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(items as any[]).slice(0, 20).map((r: any, i: number) => (
                <tr key={r.id}>
                  <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{i + 1}</td>
                  <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{r.name}</td>
                  <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{r.invoice_number}</td>
                  <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{r.customer}</td>
                  <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{r.warranty_end_date}</td>
                  <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{r.cost != null ? Number(r.cost).toFixed(2) : "—"}</td>
                  <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{r.price != null ? Number(r.price).toFixed(2) : "—"}</td>
                  <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>
                    <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: "#fecaca", color: "#991b1b" }}>
                      {r.days_passed} {isAr ? "يوم" : "days"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function MiniTable({ title, headers, rows, emptyMsg }: {
  title: string; headers: string[]; rows: (string | number)[][]; emptyMsg: string;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const safeName = title.replace(/[^\w\u0600-\u06FF-]+/g, "_");
  return (
    <DataCard>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h3 className="text-sm font-bold" style={{ color: "#111827" }}>{title}</h3>
        <ExportBar
          onCsv={() => csvExporter.exportToCsv(`${safeName}.csv`, headers, rows)}
          onXls={() => csvExporter.exportToXls(`${safeName}.xls`, headers, rows)}
          onPrint={() => printTableElement(printRef.current, title)}
        />
      </div>
      <div className="overflow-x-auto" ref={printRef}>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} style={{ backgroundColor: "#f9fafb", color: "#374151", padding: "8px 10px", fontWeight: 600, textAlign: "right", fontSize: 12, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={headers.length} className="text-center py-6 text-sm" style={{ color: "#6b7280" }}>{emptyMsg}</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} style={{ borderBottom: "1px solid #f3f4f6", padding: "8px 10px", color: "#374151" }}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataCard>
  );
}

function DebtTable({ title, subjectLabel, actionLabel, actionColor, rows, fmt, onPay }: {
  title: string;
  subjectLabel: string;
  actionLabel: string;
  actionColor: string;
  rows: { id: string; name: string; due: number }[];
  fmt: (n: number) => string;
  onPay: (id: string) => void;
}) {
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "8px 10px", fontWeight: 600, textAlign: "right", fontSize: 12, borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 1 };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "8px 10px", color: "#374151" };
  const printRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(s));
  }, [rows, search]);
  const total = useMemo(() => filtered.reduce((s, r) => s + r.due, 0), [filtered]);
  const headers = [subjectLabel, "الرصيد المستحق"];
  const expRows = filtered.map((r) => [r.name, r.due]);
  const safeName = title.replace(/[^\w\u0600-\u06FF-]+/g, "_");
  return (
    <DataCard>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
        <h3 className="text-sm font-bold" style={{ color: "#111827" }}>{title}</h3>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم..."
            className="h-8 px-2 text-sm rounded-md border w-full sm:w-auto sm:min-w-[160px]"
            style={{ borderColor: "#d1d5db" }}
          />
          <ExportBar
            onCsv={() => csvExporter.exportToCsv(`${safeName}.csv`, headers, expRows)}
            onXls={() => csvExporter.exportToXls(`${safeName}.xls`, headers, expRows)}
            onPrint={() => printTableElement(printRef.current, title)}
          />
        </div>
      </div>
      <div className="text-xs mb-2" style={{ color: "#6b7280" }}>
        إجمالي الديون: <span style={{ color: actionColor, fontWeight: 700 }}>{fmt(total)}</span>
        <span className="mx-2">•</span>
        عدد {subjectLabel}: <span style={{ fontWeight: 700 }}>{filtered.length}</span>
      </div>

      <div className="w-full overflow-x-auto" ref={printRef} style={{ maxHeight: 360 }}>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 420 }}>
          <thead>
            <tr>
              <th style={headStyle}>{subjectLabel}</th>
              <th style={headStyle}>الرصيد المستحق</th>
              <th style={{ ...headStyle, textAlign: "center" }}>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={3} className="text-center py-6 text-sm" style={{ color: "#6b7280" }}>لا توجد بيانات</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id}>
                <td style={cellStyle}>{r.name}</td>
                <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>{fmt(r.due)}</td>
                <td style={{ ...cellStyle, textAlign: "center" }}>
                  <button
                    onClick={() => onPay(r.id)}
                    className="h-8 px-2 sm:px-3 inline-flex items-center gap-1 rounded-md text-xs text-white whitespace-nowrap"
                    style={{ backgroundColor: actionColor }}
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{actionLabel}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataCard>
  );
}

// Reusable export/print toolbar for monitoring widgets
function ExportBar({ onCsv, onXls, onPrint }: { onCsv: () => void; onXls: () => void; onPrint: () => void }) {
  const btn: React.CSSProperties = {
    height: 30, padding: "0 10px", borderRadius: 6, fontSize: 12,
    border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151",
    display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer",
  };
  return (
    <div className="flex items-center gap-2 no-print">
      <button type="button" onClick={onCsv} style={btn}><FileText className="h-3.5 w-3.5" /> CSV</button>
      <button type="button" onClick={onXls} style={btn}><FileSpreadsheet className="h-3.5 w-3.5" /> Excel</button>
      <button type="button" onClick={onPrint} style={btn}><Printer className="h-3.5 w-3.5" /> طباعة</button>
    </div>
  );
}

export { ExportBar as _ExportBar };

