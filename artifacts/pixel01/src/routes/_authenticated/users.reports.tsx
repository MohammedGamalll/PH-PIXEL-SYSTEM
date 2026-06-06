import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/products/PageHeader";
import {
  TableToolbar,
  EmptyRow,
  TableFooter,
  type ColumnDef,
} from "@/components/products/TableToolbar";
import { DataCard } from "@/components/products/DataCard";
import { exportToCsv } from "@/lib/csv";
import { useContacts } from "@/hooks/use-contacts";
import { useCustomerGroups } from "@/hooks/use-customer-groups";
import { useI18n } from "@/lib/i18n";
import { useContactBalances, computeContactDue } from "@/hooks/use-contact-balances";

export const Route = createFileRoute("/_authenticated/users/reports")({
  component: ReportsPage,
});

type Row = {
  id: string;
  displayName: string;
  contact_id?: string;
  mobile?: string;
  total_purchases: number;
  purchase_returns: number;
  total_sales: number;
  sales_returns: number;
  opening_balance_due: number;
  debt: number;
};

const numericKeys = [
  "total_purchases",
  "purchase_returns",
  "total_sales",
  "sales_returns",
  "opening_balance_due",
  "debt",
] as const;

function fullName(r: any) {
  return (
    r.business_name ||
    [r.first_name, r.last_name].filter(Boolean).join(" ") ||
    r.contact_id ||
    "—"
  );
}

function ReportsPage() {
  const { t, dir } = useI18n();
  const headStyle: React.CSSProperties = {
    backgroundColor: "#f9fafb",
    color: "#374151",
    padding: "10px 12px",
    fontWeight: 600,
    textAlign: dir === "rtl" ? "right" : "left",
    fontSize: 13,
    borderBottom: "1px solid #e5e7eb",
    whiteSpace: "nowrap",
  };
  const cellStyle: React.CSSProperties = {
    borderBottom: "1px solid #f3f4f6",
    padding: "10px 12px",
    color: "#374151",
    whiteSpace: "nowrap",
    textAlign: dir === "rtl" ? "right" : "left",
  };

  const initialCols: ColumnDef[] = useMemo(() => [
    { key: "displayName", label: t("users.table.contacts"), visible: true },
    { key: "total_purchases", label: t("users.table.total_purchases"), visible: true },
    { key: "purchase_returns", label: t("users.table.purchase_returns"), visible: true },
    { key: "total_sales", label: t("users.table.total_sales"), visible: true },
    { key: "sales_returns", label: t("users.table.sales_returns"), visible: true },
    { key: "opening_balance_due", label: t("users.table.opening_due"), visible: true },
    { key: "debt", label: t("users.table.debt"), visible: true },
  ], [t]);

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState(initialCols);
  const [groupFilter, setGroupFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "customer" | "supplier" | "both">("");
  const [contactFilter, setContactFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => setCols(initialCols), [initialCols]);

  const { data: customers = [] } = useContacts("customer");
  const { data: suppliers = [] } = useContacts("supplier");
  const { data: groups = [] } = useCustomerGroups();
  const { user } = useAuth();
  const { data: balances } = useContactBalances();

  // Aggregate sales/purchases per contact for the real numbers.
  const { data: salesAgg } = useQuery({
    queryKey: ["users-reports", "sales-agg", dateFrom, dateTo],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("invoices").select("customer_id,total,paid_amount,type,issue_date");
      if (dateFrom) q = q.gte("issue_date", dateFrom);
      if (dateTo) q = q.lte("issue_date", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: purchasesAgg } = useQuery({
    queryKey: ["users-reports", "purchases-agg", dateFrom, dateTo],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("purchases").select("supplier_id,total,paid_amount,purchase_date");
      if (dateFrom) q = q.gte("purchase_date", dateFrom);
      if (dateTo) q = q.lte("purchase_date", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: purchaseReturnsAgg } = useQuery({
    queryKey: ["users-reports", "purchase-returns-agg", dateFrom, dateTo],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("purchase_returns").select("purchase_id,total_amount,return_date");
      if (dateFrom) q = q.gte("return_date", dateFrom);
      if (dateTo) q = q.lte("return_date", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      // join to supplier via purchases
      const ids = Array.from(new Set((data ?? []).map((r: any) => r.purchase_id).filter(Boolean)));
      if (ids.length === 0) return [] as Array<{ supplier_id: string | null; total_amount: number }>;
      const { data: ps } = await supabase
        .from("purchases").select("id,supplier_id").in("id", ids);
      const psMap = new Map((ps ?? []).map((p: any) => [p.id, p.supplier_id]));
      return (data ?? []).map((r: any) => ({
        supplier_id: psMap.get(r.purchase_id) ?? null,
        total_amount: Number(r.total_amount) || 0,
      }));
    },
  });

  const aggregates = useMemo(() => {
    const totals = new Map<string, {
      total_sales: number; sales_returns: number;
      total_purchases: number; purchase_returns: number;
      debt: number;
    }>();
    const ensure = (id: string) => {
      let v = totals.get(id);
      if (!v) { v = { total_sales: 0, sales_returns: 0, total_purchases: 0, purchase_returns: 0, debt: 0 }; totals.set(id, v); }
      return v;
    };
    for (const inv of (salesAgg ?? []) as any[]) {
      if (!inv.customer_id) continue;
      const v = ensure(inv.customer_id);
      const total = Number(inv.total) || 0;
      const paid = Number(inv.paid_amount) || 0;
      if (inv.type === "sale_return") {
        v.sales_returns += total;
        v.debt -= Math.max(total - paid, 0);
      } else if (inv.type === "sale") {
        v.total_sales += total;
        v.debt += Math.max(total - paid, 0);
      }
    }
    for (const p of (purchasesAgg ?? []) as any[]) {
      if (!p.supplier_id) continue;
      const v = ensure(p.supplier_id);
      const total = Number(p.total) || 0;
      const paid = Number(p.paid_amount) || 0;
      v.total_purchases += total;
      v.debt -= Math.max(total - paid, 0); // we owe supplier → negative debt
    }
    for (const r of (purchaseReturnsAgg ?? []) as any[]) {
      if (!r.supplier_id) continue;
      const v = ensure(r.supplier_id);
      v.purchase_returns += Number(r.total_amount) || 0;
      v.debt += Number(r.total_amount) || 0;
    }
    return totals;
  }, [salesAgg, purchasesAgg, purchaseReturnsAgg]);

  const rows: Row[] = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of [...(customers as any[]), ...(suppliers as any[])]) {
      map.set(r.id, r);
    }
    return Array.from(map.values()).map((r) => {
      const agg = aggregates.get(r.id) ?? { total_sales: 0, sales_returns: 0, total_purchases: 0, purchase_returns: 0, debt: 0 };
      // Use unified computeContactDue for the net balance (includes opening, payments, returns)
      const { gross } = computeContactDue(r, balances?.get(r.id));
      return {
        id: r.id,
        displayName: fullName(r),
        contact_id: r.contact_id,
        mobile: r.mobile,
        total_purchases: agg.total_purchases,
        purchase_returns: agg.purchase_returns,
        total_sales: agg.total_sales,
        sales_returns: agg.sales_returns,
        opening_balance_due: Number(r.opening_balance ?? 0),
        debt: gross,
        _type: r.type,
        _group_id: r.customer_group_id,
      };
    });
  }, [customers, suppliers, aggregates, balances]);

  const filtered = useMemo(
    () =>
      rows.filter((r: any) => {
        if (search && ![r.displayName, r.contact_id, r.mobile].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase())) return false;
        if (typeFilter && r._type !== typeFilter && r._type !== "both") return false;
        if (groupFilter && r._group_id !== groupFilter) return false;
        if (contactFilter && r.id !== contactFilter) return false;
        return true;
      }),
    [rows, search, typeFilter, groupFilter, contactFilter],
  );

  useEffect(() => setPage(1), [search, perPage, typeFilter, groupFilter, contactFilter, dateFrom, dateTo]);

  const pageSize = Number(perPage);
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const visible = cols.filter((c) => c.visible);

  const sums = useMemo(() => {
    const out: Record<string, number> = {};
    for (const k of numericKeys) {
      out[k] = filtered.reduce((s, r) => s + (r[k] ?? 0), 0);
    }
    return out;
  }, [filtered]);

  const cellFor = (r: Row, key: string): string => {
    if (key === "displayName") return r.displayName;
    if ((numericKeys as readonly string[]).includes(key)) {
      const val = Number((r as any)[key] ?? 0);
      if (key === "debt") {
        if (val > 0.004) return `${val.toFixed(2)} (عليه)`;
        if (val < -0.004) return `${Math.abs(val).toFixed(2)} (له)`;
        return "0.00";
      }
      return val.toFixed(2);
    }
    return "";
  };

  const debtColor = (r: Row) => {
    if (r.debt > 0.004) return "#dc2626";
    if (r.debt < -0.004) return "#16a34a";
    return undefined;
  };

  const exportCsv = (name: string) =>
    exportToCsv(
      name,
      visible.map((c) => c.label),
      filtered.map((r) => visible.map((c) => cellFor(r, c.key))),
    );

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("users.page.reports_title")} />
      <div className="rounded-md p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" style={{ border: "1px solid #e5e7eb", backgroundColor: "#ffffff" }}>
        <div className="min-w-0">
          <label style={{ fontSize: 12, color: "#374151", marginBottom: 4, display: "block" }}>{t("users.table.group") || "Group"}</label>
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", borderRadius: 6, height: 36, padding: "0 8px", width: "100%", fontSize: 13, color: "#374151" }}>
            <option value="">{t("users.filters.all")}</option>
            {(groups as any[]).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label style={{ fontSize: 12, color: "#374151", marginBottom: 4, display: "block" }}>{t("users.table.type") || "Type"}</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", borderRadius: 6, height: 36, padding: "0 8px", width: "100%", fontSize: 13, color: "#374151" }}>
            <option value="">{t("users.filters.all")}</option>
            <option value="customer">{t("users.tabs.customers") || "Customer"}</option>
            <option value="supplier">{t("users.tabs.suppliers") || "Supplier"}</option>
            <option value="both">{t("users.tabs.both") || "Both"}</option>
          </select>
        </div>
        <div className="min-w-0">
          <label style={{ fontSize: 12, color: "#374151", marginBottom: 4, display: "block" }}>{t("users.table.contacts")}</label>
          <select value={contactFilter} onChange={(e) => setContactFilter(e.target.value)} style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", borderRadius: 6, height: 36, padding: "0 8px", width: "100%", fontSize: 13, color: "#374151" }}>
            <option value="">{t("users.filters.all")}</option>
            {[...(customers as any[]), ...(suppliers as any[])].map((c) => (
              <option key={c.id} value={c.id}>{c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label style={{ fontSize: 12, color: "#374151", marginBottom: 4, display: "block" }}>{t("reports.col.date") || "Date Range"}</label>
          <div className="flex flex-col sm:flex-row gap-1">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", borderRadius: 6, height: 36, padding: "0 8px", width: "100%", fontSize: 13, color: "#374151", minWidth: 0 }} />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", borderRadius: 6, height: 36, padding: "0 8px", width: "100%", fontSize: 13, color: "#374151", minWidth: 0 }} />
          </div>
        </div>
      </div>

      <DataCard>
        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          perPage={perPage}
          onPerPageChange={setPerPage}
          onExportCsv={() => exportCsv("contacts-additional-reports.csv")}
          onExportExcel={() => exportCsv("contacts-additional-reports.xls")}
          printRef={printRef}
          printTitle="contacts-additional-reports"
          columns={cols}
          onToggleColumn={(k) =>
            setCols((s) =>
              s.map((c) => (c.key === k ? { ...c, visible: !c.visible } : c)),
            )
          }
        />
        <div className="overflow-x-auto" ref={printRef}>
          <table
            className="w-full text-sm"
            style={{ borderCollapse: "collapse" }}
          >
            <thead>
              <tr>
                {visible.map((c) => (
                  <th key={c.key} style={headStyle}>
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {c.key === "debt" && (
                        <Info className="h-3.5 w-3.5" style={{ color: "#3b82f6" }} />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <EmptyRow colSpan={visible.length} />
              ) : (
                pageRows.map((r) => (
                  <tr key={r.id}>
                    {visible.map((c) => (
                      <td key={c.key} style={{
                        ...cellStyle,
                        ...(c.key === "debt" && debtColor(r) ? { color: debtColor(r), fontWeight: 600 } : {}),
                      }}>
                        {cellFor(r, c.key)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: "#f9fafb", fontWeight: 600 }}>
                {visible.map((c) => {
                  if (c.key === "displayName")
                    return (
                      <td key={c.key} style={cellStyle}>
                        {t("users.totals.label")}
                      </td>
                    );
                  if ((numericKeys as readonly string[]).includes(c.key))
                    return (
                      <td key={c.key} style={cellStyle}>
                        {(sums[c.key] ?? 0).toFixed(2)}
                      </td>
                    );
                  return <td key={c.key} style={cellStyle} />;
                })}
              </tr>
            </tfoot>
          </table>
        </div>
        <TableFooter
          from={from}
          to={to}
          total={total}
          page={page}
          pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
        />
      </DataCard>
    </div>
  );
}
