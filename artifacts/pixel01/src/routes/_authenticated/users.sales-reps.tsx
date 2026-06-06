import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/products/PageHeader";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { DataCard } from "@/components/products/DataCard";
import { Plus, Trash2 } from "lucide-react";
import { exportToCsv } from "@/lib/csv";
import { useSalesReps, useDeleteSalesRep } from "@/hooks/use-sales-reps";
import { AddSalesRepDialog } from "@/components/contacts/AddSalesRepDialog";

import { useI18n } from "@/lib/i18n";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";

export const Route = createFileRoute("/_authenticated/users/sales-reps")({
  component: SalesRepsPage,
});

const BLUE = "#3b82f6";
const RED = "#ef4444";

function SalesRepsPage() {
  const { t, dir } = useI18n();
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151", textAlign: dir === "rtl" ? "right" : "left" };

  const initialCols: ColumnDef[] = useMemo(() => [
    { key: "opt", label: t("users.table.opt"), visible: true },
    { key: "name", label: t("users.table.name"), visible: true },
    { key: "email", label: t("users.table.email"), visible: true },
    { key: "phone", label: t("users.table.phone"), visible: true },
    { key: "address", label: t("users.table.address"), visible: true },
    { key: "commission_percent", label: t("users.table.commission_percent"), visible: true },
  ], [t]);

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState(initialCols);
  const [open, setOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const { data: rows = [] } = useSalesReps();
  const del = useDeleteSalesRep();

  useEffect(() => setCols(initialCols), [initialCols]);

  const filtered = useMemo(() => (rows as any[]).filter((d) => !search || [d.first_name, d.last_name, d.email, d.phone].filter(Boolean).join(" ").includes(search)), [rows, search]);
  const { sorted, sort, setSort } = useTableSort(filtered as any);
  useEffect(() => setPage(1), [search, perPage]);
  const pageSize = Number(perPage);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const visible = cols.filter((c) => c.visible);

  const cellFor = (r: any, key: string) => {
    if (key === "name") return [r.prefix, r.first_name, r.last_name].filter(Boolean).join(" ");
    if (key === "commission_percent") return Number(r.commission_percent ?? 0).toFixed(2);
    return r[key] ?? "";
  };

  const exportCsv = (n: string) =>
    exportToCsv(n, visible.filter((c) => c.key !== "opt").map((c) => c.label),
      sorted.map((r) => visible.filter((c) => c.key !== "opt").map((c) => cellFor(r, c.key))));

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("users.page.sales_reps_title")} actions={
        <button type="button" onClick={() => setOpen(true)} className="h-9 px-4 rounded-md text-sm flex items-center gap-2 text-white" style={{ backgroundColor: BLUE }}>
          <Plus className="h-4 w-4" /> {t("users.actions.add")}
        </button>
      } />
      
      <DataCard>
        <TableToolbar
          search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={() => exportCsv("sales-reps.csv")} onExportExcel={() => exportCsv("sales-reps.xls")}
          printRef={printRef} printTitle="sales-reps"
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))} />
        <div className="overflow-x-auto" ref={printRef}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
            <tbody>
              {pageRows.length === 0 ? <EmptyRow colSpan={visible.length} /> : pageRows.map((r: any) => (
                <tr key={r.id}>
                  {visible.map((c) => c.key === "opt" ? (
                    <td key={c.key} style={cellStyle}>
                      <button onClick={() => del.mutate(r.id)} className="h-8 w-8 inline-flex items-center justify-center" style={{ color: RED }}>
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
      <AddSalesRepDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
