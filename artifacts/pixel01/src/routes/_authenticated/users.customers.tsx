import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/products/PageHeader";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { DataCard } from "@/components/products/DataCard";
import { Plus } from "lucide-react";
import { ContactOptionsMenu } from "@/components/contacts/ContactOptionsMenu";


import { exportToCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { useContacts } from "@/hooks/use-contacts";
import { useCustomerGroups } from "@/hooks/use-customer-groups";
import { useContactBalances, computeContactDue } from "@/hooks/use-contact-balances";
import { AddContactDialog } from "@/components/contacts/AddContactDialog";

import { useI18n } from "@/lib/i18n";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";
import { useCan } from "@/lib/can";

export const Route = createFileRoute("/_authenticated/users/customers")({
  component: CustomersPage,
});

const BLUE = "#3b82f6";
const RED = "#ef4444";

function CustomersPage() {
  const { t, dir } = useI18n();
  const { can } = useCan();
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151", whiteSpace: "nowrap", textAlign: dir === "rtl" ? "right" : "left" };

  const initialCols: ColumnDef[] = useMemo(() => [
    { key: "opt", label: t("users.table.opt"), visible: true },
    { key: "contact_id", label: t("users.table.contact_id"), visible: true },
    { key: "business", label: t("users.table.business"), visible: true },
    { key: "name", label: t("users.table.name"), visible: true },
    { key: "group", label: t("users.table.group"), visible: true },
    { key: "opening_balance", label: t("users.table.opening_balance"), visible: true },
    { key: "advance_balance", label: t("users.table.advance_balance"), visible: true },
    { key: "created_at", label: t("users.table.created_at"), visible: true },
    { key: "address", label: t("users.table.address"), visible: true },
    { key: "mobile", label: t("users.table.mobile"), visible: true },
    { key: "unpaid_sales", label: t("users.table.unpaid_sales"), visible: true },
    { key: "sales_returns", label: t("users.table.sales_returns"), visible: true },
    { key: "pay_term", label: t("users.table.pay_term"), visible: true },
    { key: "custom_field_1", label: t("users.table.cf", { n: 1 }), visible: true },
    { key: "custom_field_2", label: t("users.table.cf", { n: 2 }), visible: true },
  ], [t]);

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState(initialCols);
  const [open, setOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [chk, setChk] = useState({ due: false, returns: false, advance: false, opening: false });

  const { data: rows = [] } = useContacts("customer", { includeInactive: showInactive });
  const { data: groups = [] } = useCustomerGroups();
  const { data: balances } = useContactBalances();
  
  
  const groupName = (id?: string) => (groups as any[]).find((g) => g.id === id)?.name ?? "";
  const balOf = (id: string) => balances?.get(id) ?? { total_sales: 0, unpaid_sales: 0, sales_returns: 0, total_purchases: 0, unpaid_purchases: 0, purchase_returns: 0, payments_in: 0, payments_out: 0 };
  const dueOf = (r: any) => computeContactDue(r, balances?.get(r.id));

  useEffect(() => setCols(initialCols), [initialCols]);

  const filtered = useMemo(
    () => (rows as any[]).filter((d) => {
      if (search && ![d.first_name, d.last_name, d.mobile, d.email, d.contact_id].filter(Boolean).join(" ").includes(search)) return false;
      const anyChk = chk.due || chk.returns || chk.advance || chk.opening;
      if (anyChk) {
        const b = balOf(d.id);
        const due = dueOf(d);
        const matches =
          (chk.due && due.due > 0) ||
          (chk.returns && b.sales_returns > 0) ||
          (chk.advance && due.totalCredit > 0) ||
          (chk.opening && Number(d.opening_balance ?? 0) !== 0);
        if (!matches) return false;
      }
      return true;
    }),
    [rows, search, chk, balances]
  );
  const { sorted: tableSorted, sort, setSort } = useTableSort(filtered as any);
  const sorted = useMemo(() => {
    const arr = [...(tableSorted as any[])];
    arr.sort((a, b) => {
      const ad = dueOf(a).due > 0 ? 0 : 1;
      const bd = dueOf(b).due > 0 ? 0 : 1;
      return ad - bd;
    });
    return arr;
  }, [tableSorted, balances]);
  useEffect(() => setPage(1), [search, perPage]);
  const pageSize = Number(perPage);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);

  const visible = cols.filter((c) => c.visible);
  const fullName = (r: any) => [r.first_name, r.last_name].filter(Boolean).join(" ");
  const nameCell = (r: any) => (
    <span className="inline-flex items-center gap-2">
      {fullName(r)}
      {r.is_active === false && <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-100 text-red-700">معطّل</span>}
    </span>
  );

  const cellFor = (r: any, key: string) => {
    switch (key) {
      case "name": return nameCell(r);
      case "business": return r.business_name ?? (r.business_type === "business" ? fullName(r) : "");
      case "group": return groupName(r.customer_group_id);
      case "created_at": return formatDateTime(r.created_at);
      case "opening_balance": return Number(r.opening_balance ?? 0).toFixed(2);
      case "advance_balance": return dueOf(r).totalCredit.toFixed(2);
      case "unpaid_sales": return dueOf(r).due.toFixed(2);
      case "sales_returns": return balOf(r.id).sales_returns.toFixed(2);
      default: return r[key] ?? "";
    }
  };

  const sumBal = (k: "unpaid_sales" | "sales_returns") =>
    sorted.reduce((s, r: any) => s + (k === "unpaid_sales" ? dueOf(r).due : balOf(r.id).sales_returns), 0).toFixed(2);
  const sumAdvance = () => sorted.reduce((s, r: any) => s + dueOf(r).totalCredit, 0).toFixed(2);

  const exportCsv = (n: string) =>
    exportToCsv(n, visible.filter((c) => c.key !== "opt").map((c) => c.label),
      sorted.map((r) => visible.filter((c) => c.key !== "opt").map((c) => cellFor(r, c.key))));

  const sumKey = (k: string) => sorted.reduce((s, r: any) => s + Number(r[k] ?? 0), 0).toFixed(2);

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("users.page.customers_title")} subtitle={t("users.page.customers_subtitle")} actions={
        can("customers", "create") ? (
          <button type="button" onClick={() => setOpen(true)} className="h-9 px-4 rounded-md text-sm flex items-center gap-2 text-white" style={{ backgroundColor: BLUE }}>
            <Plus className="h-4 w-4" /> {t("users.actions.add")}
          </button>
        ) : null
      } />
      <div className="flex flex-wrap items-center gap-3 px-2 py-2 rounded-md" style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb" }}>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={chk.due} onChange={(e) => setChk((s) => ({ ...s, due: e.target.checked }))} />
          بيع مستحق
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={chk.returns} onChange={(e) => setChk((s) => ({ ...s, returns: e.target.checked }))} />
          مرتجعات البيع
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={chk.advance} onChange={(e) => setChk((s) => ({ ...s, advance: e.target.checked }))} />
          رصيد مقدّم
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={chk.opening} onChange={(e) => setChk((s) => ({ ...s, opening: e.target.checked }))} />
          الرصيد الافتتاحي
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer ms-auto">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          عرض المعطّلين
        </label>
      </div>
      <DataCard>
        <TableToolbar
          search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={() => exportCsv("customers.csv")} onExportExcel={() => exportCsv("customers.xls")}
          printRef={printRef} printTitle="customers"
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))} />
        <div className="overflow-x-auto" ref={printRef}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
            <tbody>
              {pageRows.length === 0 ? <EmptyRow colSpan={visible.length} /> : pageRows.map((r: any) => {
                const due = dueOf(r).due;
                const rowStyle: React.CSSProperties = due > 0
                  ? { backgroundColor: "#fef2f2", borderInlineStart: "4px solid #ef4444" }
                  : {};
                return (
                  <tr key={r.id} style={rowStyle}>
                    {visible.map((c) => c.key === "opt" ? (
                      <td key={c.key} style={cellStyle}>
                        <ContactOptionsMenu contact={r} scope="customer" />
                      </td>
                    ) : <td key={c.key} style={cellStyle}>{cellFor(r, c.key)}</td>)}
                  </tr>
                );
              })}

            </tbody>

            {pageRows.length > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: "#f9fafb", fontWeight: 600 }}>
                  {visible.map((c) => {
                    if (c.key === "opening_balance") return <td key={c.key} style={cellStyle}>{sumKey(c.key)}</td>;
                    if (c.key === "advance_balance") return <td key={c.key} style={cellStyle}>{sumAdvance()}</td>;
                    if (c.key === "unpaid_sales" || c.key === "sales_returns") return <td key={c.key} style={cellStyle}>{sumBal(c.key)}</td>;
                    return <td key={c.key} style={cellStyle}>{c.key === "opt" ? t("users.totals.label") : ""}</td>;
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <TableFooter from={from} to={to} total={total} page={page} pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
      </DataCard>
      <AddContactDialog open={open} onOpenChange={setOpen} defaultType="customer" />
    </div>
  );
}

