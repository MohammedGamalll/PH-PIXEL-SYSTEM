import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/products/PageHeader";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { DataCard } from "@/components/products/DataCard";
import { exportToCsv } from "@/lib/csv";
import { useI18n } from "@/lib/i18n";
import { useSalesReps } from "@/hooks/use-sales-reps";
import { useContacts } from "@/hooks/use-contacts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/users/sales-rep-report")({
  component: SalesRepReportPage,
});

type TabKey = "sales" | "commission" | "expenses";

function SalesRepReportPage() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const { data: reps = [] } = useSalesReps();
  const { data: customers = [] } = useContacts("customer");

  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151", whiteSpace: "nowrap", textAlign: dir === "rtl" ? "right" : "left" };

  const TAB_COLS: Record<TabKey, ColumnDef[]> = useMemo(() => ({
    sales: [
      { key: "date", label: t("users.srr.col_date"), visible: true },
      { key: "invoice_no", label: t("users.srr.col_invoice"), visible: true },
      { key: "customer", label: t("users.srr.col_customer"), visible: true },
      { key: "pay_status", label: t("users.srr.col_pay_status"), visible: true },
      { key: "amount", label: t("users.srr.col_amount"), visible: true },
      { key: "payments", label: t("users.srr.col_payments"), visible: true },
      { key: "remaining", label: t("users.srr.col_remaining"), visible: true },
    ],
    commission: [
      { key: "date", label: t("users.srr.col_date"), visible: true },
      { key: "invoice_no", label: t("users.srr.col_invoice"), visible: true },
      { key: "amount", label: t("users.srr.col_amount"), visible: true },
      { key: "commission", label: t("users.srr.col_commission"), visible: true },
    ],
    expenses: [
      { key: "date", label: t("users.srr.col_date"), visible: true },
      { key: "category", label: t("users.srr.col_category"), visible: true },
      { key: "description", label: t("users.srr.col_description"), visible: true },
      { key: "amount", label: t("users.srr.col_amount"), visible: true },
    ],
  }), [t]);

  const [tab, setTab] = useState<TabKey>("sales");
  const [repId, setRepId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState<ColumnDef[]>(TAB_COLS.sales);
  const printRef = useRef<HTMLDivElement>(null);

  const switchTab = (k: TabKey) => {
    setTab(k);
    setCols(TAB_COLS[k]);
    setPage(1);
  };

  const rep = (reps as any[]).find((r) => r.id === repId);
  const commissionPct = Number(rep?.commission_percent || 0);

  const { data: invoices = [] } = useQuery({
    queryKey: ["srr-invoices", user?.id, repId],
    enabled: !!user,
    queryFn: async () => {
      let q = (supabase.from("invoices") as any)
        .select("id, invoice_number, issue_date, total, paid_amount, payment_status, status, customer_id, type, sales_rep_id")
        .in("type", ["sale", "sale_return"])
        .neq("status", "cancelled")
        .order("issue_date", { ascending: false });
      if (repId) q = q.eq("sales_rep_id", repId);
      else q = q.not("sales_rep_id", "is", null);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: expensesData = [] } = useQuery({
    queryKey: ["srr-expenses", user?.id, repId],
    enabled: !!user,
    queryFn: async () => {
      let q = (supabase.from("expenses") as any)
        .select("id, expense_date, amount, description, reason, category, category_id, sales_rep_id")
        .order("expense_date", { ascending: false });
      if (repId) q = q.eq("sales_rep_id", repId);
      else q = q.not("sales_rep_id", "is", null);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const customerName = (id: string | null) => {
    if (!id) return "—";
    const c = (customers as any[]).find((x) => x.id === id);
    if (!c) return "—";
    return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.business_name || "—";
  };

  const sign = (i: any) => (i.type === "sale_return" ? -1 : 1);
  const totalSales = (invoices as any[]).reduce((a, i) => a + sign(i) * Number(i.total || 0), 0);
  const totalPaid = (invoices as any[]).reduce((a, i) => a + sign(i) * Number(i.paid_amount || 0), 0);
  const totalRemaining = totalSales - totalPaid;
  const totalExpenses = (expensesData as any[]).reduce((a, e) => a + Number(e.amount || 0), 0);
  const totalCommission = totalSales * (commissionPct / 100);

  const fmt = (n: number) => `${t("users.totals.currency")} ${n.toFixed(2)}`;

  const rowsForTab = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (tab === "sales" || tab === "commission") {
      return (invoices as any[]).filter((i) => {
        if (!q) return true;
        return String(i.invoice_number || "").toLowerCase().includes(q) ||
          customerName(i.customer_id).toLowerCase().includes(q);
      });
    }
    return (expensesData as any[]).filter((e) => {
      if (!q) return true;
      return String(e.reason || e.description || "").toLowerCase().includes(q);
    });
  }, [tab, invoices, expensesData, search]);

  const visible = cols.filter((c) => c.visible);
  const per = Number(perPage) || 25;
  const total = rowsForTab.length;
  const pageCount = Math.max(1, Math.ceil(total / per));
  const slice = rowsForTab.slice((page - 1) * per, page * per);

  const exportCsv = (n: string) =>
    exportToCsv(n, visible.map((c) => c.label), slice.map((r) => visible.map((c) => cellOf(r, c.key))));

  const cellOf = (r: any, k: string): string => {
    if (tab === "sales") {
      if (k === "date") return String(r.issue_date || "");
      if (k === "invoice_no") return String(r.invoice_number || "");
      if (k === "customer") return customerName(r.customer_id);
      if (k === "pay_status") return String(r.payment_status || "");
      if (k === "amount") return Number(r.total || 0).toFixed(2);
      if (k === "payments") return Number(r.paid_amount || 0).toFixed(2);
      if (k === "remaining") return (Number(r.total || 0) - Number(r.paid_amount || 0)).toFixed(2);
    }
    if (tab === "commission") {
      if (k === "date") return String(r.issue_date || "");
      if (k === "invoice_no") return String(r.invoice_number || "");
      if (k === "amount") return Number(r.total || 0).toFixed(2);
      if (k === "commission") return (Number(r.total || 0) * (commissionPct / 100)).toFixed(2);
    }
    if (tab === "expenses") {
      if (k === "date") return String(r.expense_date || "");
      if (k === "category") return String(r.category || "");
      if (k === "description") return String(r.reason || r.description || "");
      if (k === "amount") return Number(r.amount || 0).toFixed(2);
    }
    return "";
  };

  const tabBtn = (k: TabKey, label: string) => {
    const active = tab === k;
    return (
      <button type="button" onClick={() => switchTab(k)} className="px-4 py-2 text-sm"
        style={{ color: active ? "#1d4ed8" : "#374151", borderBottom: active ? "2px solid #1d4ed8" : "2px solid transparent", fontWeight: active ? 600 : 400, backgroundColor: "transparent" }}>
        ⚙ {label}
      </button>
    );
  };

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("users.page.sales_rep_report_title")} />

      <DataCard>
        <label className="block mb-1.5 text-sm font-semibold" style={{ color: "#374151" }}>
          {t("users.page.sales_reps_title")}
        </label>
        <select value={repId} onChange={(e) => setRepId(e.target.value)}
          className="h-10 px-3 rounded-md text-sm w-full md:w-80 outline-none"
          style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151" }}>
          <option value="">—</option>
          {(reps as any[]).map((r) => (
            <option key={r.id} value={r.id}>{[r.prefix, r.first_name, r.last_name].filter(Boolean).join(" ")}</option>
          ))}
        </select>
      </DataCard>

      <DataCard>
        <div className="text-base font-semibold mb-2" style={{ color: "#111827" }}>{t("users.srr.summary")}</div>
        <div className="text-sm space-y-1" style={{ color: "#374151" }}>
          <div>{t("users.srr.summary_sales", { a: fmt(totalSales), b: fmt(0), c: fmt(totalSales) })}</div>
          <div>{t("users.srr.summary_expenses", { a: fmt(totalExpenses) })}</div>
        </div>
      </DataCard>

      <DataCard>
        <div className="flex items-center gap-1 mb-3" style={{ borderBottom: "1px solid #e5e7eb" }}>
          {tabBtn("sales", t("users.srr.tab_sales"))}
          {tabBtn("commission", t("users.srr.tab_commission"))}
          {tabBtn("expenses", t("users.srr.tab_expenses"))}
        </div>

        <TableToolbar
          search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={() => exportCsv(`sales-rep-${tab}.csv`)} onExportExcel={() => exportCsv(`sales-rep-${tab}.xls`)}
          printRef={printRef} printTitle={`sales-rep-${tab}`}
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))} />

        <div className="overflow-x-auto" ref={printRef}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><tr>{visible.map((c) => <th key={c.key} style={headStyle}>{c.label}</th>)}</tr></thead>
            <tbody>
              {slice.length === 0 ? (
                <EmptyRow colSpan={visible.length} />
              ) : (
                slice.map((r: any) => (
                  <tr key={r.id}>
                    {visible.map((c) => <td key={c.key} style={cellStyle}>{cellOf(r, c.key)}</td>)}
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              {tab === "sales" && (
                <tr style={{ backgroundColor: "#f3f4f6", fontWeight: 600 }}>
                  <td style={cellStyle} colSpan={Math.max(1, visible.length - 4)}>{t("users.totals.label")}</td>
                  <td style={cellStyle}></td>
                  <td style={cellStyle}>{fmt(totalSales)}</td>
                  <td style={cellStyle}>{fmt(totalPaid)}</td>
                  <td style={cellStyle}>{fmt(totalRemaining)}</td>
                </tr>
              )}
              {tab === "commission" && (
                <tr style={{ backgroundColor: "#f3f4f6", fontWeight: 600 }}>
                  <td style={cellStyle} colSpan={visible.length}>
                    {t("users.totals.label")} — {fmt(totalSales)} / {fmt(totalCommission)} ({commissionPct}%)
                  </td>
                </tr>
              )}
              {tab === "expenses" && (
                <tr style={{ backgroundColor: "#f3f4f6", fontWeight: 600 }}>
                  <td style={cellStyle} colSpan={visible.length}>{t("users.totals.label")} {fmt(totalExpenses)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
        <TableFooter from={total === 0 ? 0 : (page - 1) * per + 1} to={Math.min(page * per, total)} total={total} page={page} pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
      </DataCard>
    </div>
  );
}
