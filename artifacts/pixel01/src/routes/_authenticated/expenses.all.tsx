import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/products/PageHeader";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { DataCard } from "@/components/products/DataCard";
import { ChevronDown, Plus, Pencil, Trash2, Eye } from "lucide-react";
import { exportToCsv } from "@/lib/csv";
import { exportSingleSheet } from "@/lib/excel-export";
import { useExpenses, useDeleteExpense } from "@/hooks/use-expenses-new";
import { useExpenseCategories } from "@/hooks/use-expense-categories";
import { useContacts } from "@/hooks/use-contacts";
import { useEmployeesMap } from "@/hooks/use-employees-map";
import { FilterBar, type FilterField } from "@/components/shared/FilterBar";
import { useI18n } from "@/lib/i18n";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ExpensePaymentsModal } from "@/components/expenses/ExpensePaymentsModal";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";
import { useWarehouseContext } from "@/contexts/WarehouseContext";
import { formatDateTime } from "@/lib/format";
import { useCan } from "@/lib/can";

export const Route = createFileRoute("/_authenticated/expenses/all")({
  component: AllExpensesPage,
});

function AllExpensesPage() {
  const { t, dir } = useI18n();
  const { can } = useCan();

  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151", textAlign: dir === "rtl" ? "right" : "left" };

  const initialCols: ColumnDef[] = [
    { key: "opt", label: t("expenses.table.opt"), visible: true },
    { key: "expense_date", label: t("expenses.table.date"), visible: true },
    { key: "ref_no", label: t("expenses.table.ref"), visible: true },
    { key: "category_name", label: t("expenses.table.category"), visible: true },
    { key: "payment_status", label: t("expenses.table.payment_status"), visible: true },
    { key: "amount", label: t("expenses.table.amount"), visible: true },
    { key: "due_amount", label: t("expenses.table.due_amount"), visible: true },
    { key: "spent_by", label: t("expenses.table.spent_by"), visible: true },
    { key: "spent_to_name", label: t("expenses.table.spent_to"), visible: true },
    { key: "reason", label: t("expenses.table.reason"), visible: true },
    { key: "added_by", label: t("expenses.table.added_by"), visible: true },
  ];

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState(initialCols);
  const printRef = useRef<HTMLDivElement>(null);
  const { data: rows = [] } = useExpenses();
  const { data: cats = [] } = useExpenseCategories();
  const { data: contacts = [] } = useContacts("both");
  const del = useDeleteExpense();
  const { data: empMap = {} } = useEmployeesMap();
  const [paymentsExpense, setPaymentsExpense] = useState<any | null>(null);

  const [filters, setFilters] = useState({ from: "", to: "", branch_id: "", payment_status: "", category_id: "", spent_to: "" });

  const catName = (id?: string | null) => (cats as any[]).find((c) => c.id === id)?.name ?? "";
  const conName = (id?: string | null) => {
    const c = (contacts as any[]).find((x) => x.id === id);
    return c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || c.business_name || "" : "";
  };

  const { currentWarehouseId } = useWarehouseContext();
  const filtered = useMemo(() => (rows as any[]).filter((r) => {
    if (search && ![r.ref_no, r.reason, r.description].filter(Boolean).join(" ").includes(search)) return false;
    const d = r.expense_date;
    if (filters.from && (!d || d < filters.from)) return false;
    if (filters.to && (!d || d > filters.to)) return false;
    if (filters.branch_id && r.branch_id !== filters.branch_id) return false;
    if (filters.payment_status && r.payment_status !== filters.payment_status) return false;
    if (filters.category_id && r.category_id !== filters.category_id) return false;
    if (filters.spent_to && r.spent_to !== filters.spent_to) return false;
    if (currentWarehouseId && r.warehouse_id && r.warehouse_id !== currentWarehouseId) return false;
    return true;
  }), [rows, search, filters, currentWarehouseId]);
  const { sorted, sort, setSort } = useTableSort(filtered as any);
  useEffect(() => setPage(1), [search, perPage, filters]);

  const filterFields: FilterField[] = [
    { type: "date", key: "from", label: t("expenses.filters.from"), value: filters.from },
    { type: "date", key: "to", label: t("expenses.filters.to"), value: filters.to },
    { type: "select", key: "payment_status", label: t("expenses.filters.payment_status"), value: filters.payment_status, options: [
      { value: "paid", label: t("expenses.pay_status.paid") },
      { value: "partial", label: t("expenses.pay_status.partial") },
      { value: "pending", label: t("expenses.pay_status.pending") },
      { value: "due", label: t("expenses.pay_status.due") },
    ] },
    { type: "select", key: "category_id", label: t("expenses.filters.category"), value: filters.category_id, options: (cats as any[]).map((c) => ({ value: c.id, label: c.name })) },
    { type: "select", key: "spent_to", label: t("expenses.filters.spent_to"), value: filters.spent_to, options: (contacts as any[]).map((c) => ({ value: c.id, label: conName(c.id) || "—" })) },
  ];
  const pageSize = Number(perPage);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const visible = cols.filter((c) => c.visible);
  const sumAmount = sorted.reduce((s, r) => s + Number(r.amount || 0), 0);
  const sumDue = sorted.reduce((s, r) => s + Number(r.due_amount || 0), 0);
  const cur = t("expenses.totals.currency");

  const cellFor = (r: any, key: string) => {
    if (key === "expense_date") {
      const datePart = r.expense_date ? String(r.expense_date).slice(0, 10) : "";
      const timePart = r.created_at ? formatDateTime(r.created_at).slice(11) : "";
      return [datePart, timePart].filter(Boolean).join(" ");
    }
    if (key === "category_name") return catName(r.category_id);
    if (key === "spent_to_name") return r.spent_to ? (conName(r.spent_to) || "—") : "زبون نقدي";
    if (key === "amount" || key === "due_amount") return `${Number(r[key] ?? 0).toFixed(2)} ${cur}`;
    if (key === "payment_status") {
      const label = r.payment_status ? t(`expenses.pay_status.${r.payment_status}`) : "";
      const colors: Record<string, [string, string]> = { paid: ["#dcfce7", "#065f46"], partial: ["#fef3c7", "#92400e"], pending: ["#dbeafe", "#1e40af"], due: ["#fee2e2", "#991b1b"] };
      const [bg, fg] = colors[r.payment_status] || ["#f3f4f6", "#374151"];
      return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, backgroundColor: bg, color: fg, fontSize: 12, fontWeight: 600 }}>{label}</span>;
    }
    if (key === "added_by") return r.created_by ? (empMap[r.created_by] ?? r.created_by_name_snapshot ?? "—") : (r.created_by_name_snapshot ?? "—");
    return r[key] ?? "";
  };

  const exportCsv = (n: string) => {
    const cols2 = visible.filter((c) => c.key !== "opt");
    const headers = cols2.map((c) => c.label);
    const rows = sorted.map((r) => cols2.map((c) => cellFor(r, c.key)));
    if (n.endsWith(".xls") || n.endsWith(".xlsx")) {
      const objects = rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
      exportSingleSheet(n.replace(/\.xls$/, ".xlsx"), objects, "Expenses");
    } else {
      exportToCsv(n, headers, rows);
    }
  };

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("expenses.page.all_title")} actions={
        can("expenses", "create") ? (
          <Link to="/expenses/add" className="h-9 px-4 rounded-md text-sm flex items-center gap-2 text-white" style={{ backgroundColor: "#6366f1" }}>
            <Plus className="h-4 w-4" /> {t("expenses.actions.add")}
          </Link>
        ) : null
      } />

      <DataCard>
        <h3 className="text-sm font-bold mb-3" style={{ color: "#374151" }}>{t("expenses.page.all_section")}</h3>
        <FilterBar
          fields={filterFields}
          onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
          onReset={() => setFilters({ from: "", to: "", branch_id: "", payment_status: "", category_id: "", spent_to: "" })}
        />
        <TableToolbar search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={can("expenses", "print") ? () => exportCsv("expenses.csv") : undefined as any}
          onExportExcel={can("expenses", "print") ? () => exportCsv("expenses.xls") : undefined as any}
          printRef={printRef} printTitle="expenses"
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))} />

        <div className="overflow-x-auto" ref={printRef}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
            <tbody>
              {pageRows.length === 0 ? <EmptyRow colSpan={visible.length} /> : pageRows.map((r: any) => (
                <tr key={r.id}>
                  {visible.map((c) => {
                    if (c.key === "opt") {
                      return (
                        <td key={c.key} style={cellStyle}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="h-8 px-3 inline-flex items-center gap-1 rounded text-white text-xs"
                                style={{ backgroundColor: "#3b82f6" }}
                              >
                                خيارات <ChevronDown className="h-3 w-3" />
                              </button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align={dir === "rtl" ? "start" : "end"}>
                              <DropdownMenuItem onClick={() => setPaymentsExpense(r)}>
                                <Eye className="h-4 w-4 mr-2" /> عرض المدفوعات
                              </DropdownMenuItem>
                              {can("expenses", "edit") && (
                                <DropdownMenuItem asChild>
                                  <Link to="/expenses/edit/$id" params={{ id: r.id }}>
                                    <Pencil className="h-4 w-4 mr-2" /> تعديل
                                  </Link>
                                </DropdownMenuItem>
                              )}
                              {can("expenses", "delete") && (
                                <DropdownMenuItem onClick={() => { if (confirm("هل تريد حذف هذا المصروف؟")) del.mutate(r.id); }} className="text-red-600">
                                  <Trash2 className="h-4 w-4 mr-2" /> حذف
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>

                          </DropdownMenu>
                        </td>
                      );
                    }
                    if (c.key === "payment_status") {
                      const s = r.payment_status as string;
                      const colors: Record<string, { bg: string; fg: string }> = {
                        paid: { bg: "#dcfce7", fg: "#15803d" },
                        partial: { bg: "#fef3c7", fg: "#a16207" },
                        pending: { bg: "#fee2e2", fg: "#b91c1c" },
                        due: { bg: "#fecaca", fg: "#991b1b" },
                      };
                      const col = colors[s] || { bg: "#f3f4f6", fg: "#374151" };
                      return (
                        <td key={c.key} style={cellStyle}>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: col.bg, color: col.fg }}>
                            {s ? t(`expenses.pay_status.${s}`) : "—"}
                          </span>
                        </td>
                      );
                    }
                    return <td key={c.key} style={cellStyle}>{cellFor(r, c.key)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <td colSpan={Math.max(1, visible.length - 2)} style={{ ...cellStyle, fontWeight: 700 }}>{t("expenses.totals.label")}</td>
                <td style={{ ...cellStyle, fontWeight: 700 }}>{sumAmount.toFixed(2)} {cur}</td>
                <td style={{ ...cellStyle, fontWeight: 700 }}>{sumDue.toFixed(2)} {cur}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <TableFooter from={from} to={to} total={total} page={page} pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
      </DataCard>
      <ExpensePaymentsModal open={!!paymentsExpense} expense={paymentsExpense} onClose={() => setPaymentsExpense(null)} />
    </div>
  );
}
