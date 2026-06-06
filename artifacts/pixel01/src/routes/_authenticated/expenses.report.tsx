import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/products/PageHeader";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { DataCard } from "@/components/products/DataCard";
import { exportToCsv } from "@/lib/csv";
import { useExpenses } from "@/hooks/use-expenses-new";
import { useExpenseCategories } from "@/hooks/use-expense-categories";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useI18n } from "@/lib/i18n";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";

export const Route = createFileRoute("/_authenticated/expenses/report")({
  component: ExpensesReportPage,
});

function ExpensesReportPage() {
  const { t, dir } = useI18n();
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151", textAlign: dir === "rtl" ? "right" : "left" };

  const { data: rows = [] } = useExpenses();
  const { data: cats = [] } = useExpenseCategories();
  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const printRef = useRef<HTMLDivElement>(null);

  const initialCols: ColumnDef[] = [
    { key: "category_name", label: t("expenses.report.col_category"), visible: true },
    { key: "total", label: t("expenses.report.col_total"), visible: true },
  ];
  const [cols, setCols] = useState(initialCols);

  const grouped = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows as any[]) {
      const id = r.category_id || "_none";
      map.set(id, (map.get(id) || 0) + Number(r.amount || 0));
    }
    return Array.from(map.entries()).map(([id, total]) => ({
      id,
      category_name: id === "_none" ? t("expenses.report.uncategorized") : ((cats as any[]).find((c) => c.id === id)?.name || "—"),
      total,
    }));
  }, [rows, cats, t]);

  const filtered = useMemo(() => grouped.filter((g) => !search || g.category_name.includes(search)), [grouped, search]);
  const { sorted, sort, setSort } = useTableSort(filtered as any);
  const visible = cols.filter((c) => c.visible);
  const pageSize = Number(perPage);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const sumTotal = sorted.reduce((s, r) => s + Number(r.total || 0), 0);
  const cur = t("expenses.totals.currency");

  const cellFor = (r: any, key: string) => key === "total" ? `${Number(r.total).toFixed(2)} ${cur}` : r[key];
  const exportCsv = (n: string) =>
    exportToCsv(n, visible.map((c) => c.label), sorted.map((r) => visible.map((c) => cellFor(r, c.key))));

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("expenses.page.report_title")} />
      <DataCard>
        <h3 className="text-center text-sm font-semibold mb-2" style={{ color: "#374151" }}>{t("expenses.report.chart_title")}</h3>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={grouped}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="category_name" tick={{ fontSize: 12, fill: "#374151" }} />
              <YAxis tick={{ fontSize: 12, fill: "#374151" }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="total" name={t("expenses.report.col_total")} fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </DataCard>

      <DataCard>
        <TableToolbar search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={() => exportCsv("expenses-report.csv")} onExportExcel={() => exportCsv("expenses-report.xls")}
          printRef={printRef} printTitle="expenses-report"
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))} />
        <div className="overflow-x-auto" ref={printRef}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
            <tbody>
              {pageRows.length === 0 ? <EmptyRow colSpan={visible.length} /> : pageRows.map((r: any) => (
                <tr key={r.id}>{visible.map((c) => <td key={c.key} style={cellStyle}>{cellFor(r, c.key)}</td>)}</tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <td style={{ ...cellStyle, fontWeight: 700 }}>{t("expenses.totals.total")}</td>
                <td style={{ ...cellStyle, fontWeight: 700 }}>{sumTotal.toFixed(2)} {cur}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <TableFooter from={from} to={to} total={total} page={page} pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
      </DataCard>
    </div>
  );
}
