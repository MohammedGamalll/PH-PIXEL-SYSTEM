import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/products/PageHeader";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { DataCard } from "@/components/products/DataCard";
import { Plus, Trash2 } from "lucide-react";
import { exportToCsv } from "@/lib/csv";
import { useExpenseCategories, useDeleteExpenseCategory } from "@/hooks/use-expense-categories";
import { AddExpenseCategoryDialog } from "@/components/expenses/AddExpenseCategoryDialog";
import { useI18n } from "@/lib/i18n";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";

export const Route = createFileRoute("/_authenticated/expenses/categories")({
  component: ExpenseCategoriesPage,
});

function ExpenseCategoriesPage() {
  const { t, dir } = useI18n();
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151", textAlign: dir === "rtl" ? "right" : "left" };

  const initialCols: ColumnDef[] = [
    { key: "name", label: t("expenses.table.name"), visible: true },
    { key: "code", label: t("expenses.table.code"), visible: true },
    { key: "opt", label: t("expenses.table.opt"), visible: true },
  ];

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState(initialCols);
  const [open, setOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const { data: rows = [] } = useExpenseCategories();
  const del = useDeleteExpenseCategory();

  const filtered = useMemo(() => (rows as any[]).filter((r) => !search || [r.name, r.code].filter(Boolean).join(" ").includes(search)), [rows, search]);
  const { sorted, sort, setSort } = useTableSort(filtered as any);
  useEffect(() => setPage(1), [search, perPage]);
  const pageSize = Number(perPage);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const visible = cols.filter((c) => c.visible);

  const cellFor = (r: any, key: string) => r[key] ?? "";

  const exportCsv = (n: string) =>
    exportToCsv(n, visible.filter((c) => c.key !== "opt").map((c) => c.label),
      sorted.map((r) => visible.filter((c) => c.key !== "opt").map((c) => cellFor(r, c.key))));

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("expenses.page.categories_title")} subtitle={t("expenses.page.categories_subtitle")} actions={
        <button type="button" onClick={() => setOpen(true)} className="h-9 px-4 rounded-md text-sm flex items-center gap-2 text-white" style={{ backgroundColor: "#6366f1" }}>
          <Plus className="h-4 w-4" /> {t("expenses.actions.add")}
        </button>
      } />
      <DataCard>
        <h3 className="text-sm font-bold mb-3" style={{ color: "#374151" }}>{t("expenses.page.categories_section")}</h3>
        <TableToolbar search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={() => exportCsv("expense-categories.csv")} onExportExcel={() => exportCsv("expense-categories.xls")}
          printRef={printRef} printTitle="expense-categories"
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))} />
        <div className="overflow-x-auto" ref={printRef}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
            <tbody>
              {pageRows.length === 0 ? <EmptyRow colSpan={visible.length} /> : pageRows.map((r: any) => (
                <tr key={r.id}>
                  {visible.map((c) => c.key === "opt" ? (
                    <td key={c.key} style={cellStyle}>
                      <button onClick={() => del.mutate(r.id)} className="h-8 w-8 inline-flex items-center justify-center" style={{ color: "#ef4444" }}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  ) : <td key={c.key} style={cellStyle}>{cellFor(r, c.key)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TableFooter from={from} to={to} total={total} page={page} pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
      </DataCard>
      <AddExpenseCategoryDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
