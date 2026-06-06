import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/products/PageHeader";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { DataCard } from "@/components/products/DataCard";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csv";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useWarranties, useCreateWarranty, useDeleteWarranty } from "@/hooks/use-product-meta";
import { useI18n } from "@/lib/i18n";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";

export const Route = createFileRoute("/_authenticated/products/warranties")({
  component: WarrantiesPage,
});

const BLUE = "#3b82f6";
const RED = "#ef4444";
const DARK = "#111827";
const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151" };
const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db", backgroundColor: "#ffffff",
  borderRadius: 6, height: 38, padding: "0 10px", width: "100%", fontSize: 14, outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 13, color: "#374151", marginBottom: 4, display: "block" };

function WarrantiesPage() {
  const { t, dir } = useI18n();
  const headStyle: React.CSSProperties = {
    backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px",
    fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb",
  };
  const UNIT_LABEL: Record<string, string> = {
    day: t("products.warranties.unit.day"),
    month: t("products.warranties.unit.month"),
    year: t("products.warranties.unit.year"),
  };

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState<ColumnDef[]>(() => [
    { key: "name", label: t("products.warranties.col.name"), visible: true },
    { key: "description", label: t("products.warranties.col.desc"), visible: true },
    { key: "duration", label: t("products.warranties.col.duration"), visible: true },
    { key: "opt", label: t("products.col.option"), visible: true },
  ]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [duration, setDuration] = useState("");
  const [unit, setUnit] = useState("");

  const { data: rows = [] } = useWarranties();
  const create = useCreateWarranty();
  const del = useDeleteWarranty();

  const filtered = useMemo(
    () => (rows as any[]).filter((d) => !search || (d.name ?? "").includes(search)),
    [rows, search]
  );
  const { sorted, sort, setSort } = useTableSort(filtered as any);
  useEffect(() => setPage(1), [search, perPage]);
  const pageSize = Number(perPage);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const visible = cols.filter((c) => c.visible);

  const exportCsv = (n: string) =>
    exportToCsv(
      n,
      visible.map((c) => c.label),
      sorted.map((r: any) =>
        visible.map((c) => {
          if (c.key === "duration") return `${r.duration} ${UNIT_LABEL[r.duration_unit] ?? r.duration_unit}`;
          if (c.key === "opt") return "";
          return r[c.key] ?? "";
        })
      )
    );

  const reset = () => { setName(""); setDesc(""); setDuration(""); setUnit(""); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !duration || !unit) { toast.error(t("products.toast.fill_required")); return; }
    await create.mutateAsync({
      name: name.trim(),
      description: desc.trim() || null,
      duration: Number(duration),
      duration_unit: unit,
    });
    reset();
    setOpen(false);
  };

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader
        title={t("products.warranties.title")}
        actions={
          <button type="button" onClick={() => setOpen(true)}
            className="h-9 px-4 rounded-md text-sm flex items-center gap-2 text-white" style={{ backgroundColor: BLUE }}>
            <Plus className="h-4 w-4" /> {t("products.form.add_category")}
          </button>
        }
      />
      <DataCard>
        <div className="text-sm font-semibold mb-3" style={{ color: "#111827" }}>{t("products.warranties.all")}</div>
        <TableToolbar search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={() => exportCsv("warranties.csv")} onExportExcel={() => exportCsv("warranties.xls")}
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
            <tbody>
              {pageRows.length === 0 ? (
                <EmptyRow colSpan={visible.length} />
              ) : pageRows.map((r: any) => (
                <tr key={r.id}>
                  {visible.map((c) => {
                    if (c.key === "duration") return <td key={c.key} style={cellStyle}>{r.duration} {UNIT_LABEL[r.duration_unit] ?? r.duration_unit}</td>;
                    if (c.key === "opt") return (
                      <td key={c.key} style={cellStyle}>
                        <button onClick={() => toast.info(t("products.toast.edit_soon"))} className="h-8 w-8 inline-flex items-center justify-center" style={{ color: BLUE }}><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => del.mutate(r.id)} className="h-8 w-8 inline-flex items-center justify-center" style={{ color: RED }}><Trash2 className="h-4 w-4" /></button>
                      </td>
                    );
                    return <td key={c.key} style={cellStyle}>{r[c.key] ?? ""}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TableFooter from={from} to={to} total={total} page={page} pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
      </DataCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir={dir} className="max-w-md" style={{ backgroundColor: "#ffffff" }}>
          <DialogHeader><DialogTitle className="text-start" style={{ color: DARK }}>{t("products.warranties.add_title")}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label style={labelStyle}>{t("products.warranties.col.name")}:<span style={{ color: RED }}>*</span></label>
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("products.warranties.col.name")} />
            </div>
            <div>
              <label style={labelStyle}>{t("products.warranties.col.desc")}:</label>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("products.warranties.col.desc")}
                style={{ ...inputStyle, height: 80, padding: 8 }} />
            </div>
            <div>
              <label style={labelStyle}>{t("products.warranties.col.duration")}:<span style={{ color: RED }}>*</span></label>
              <div className="flex gap-2">
                <input type="number" min="1" style={inputStyle} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder={t("products.warranties.col.duration")} />
                <select style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="">{t("products.form.select_placeholder")}</option>
                  <option value="day">{t("products.warranties.unit.day")}</option>
                  <option value="month">{t("products.warranties.unit.month")}</option>
                  <option value="year">{t("products.warranties.unit.year")}</option>
                </select>
              </div>
            </div>
            <DialogFooter className="flex-row-reverse sm:flex-row-reverse gap-2">
              <button type="submit" disabled={create.isPending} className="h-10 px-5 rounded-md text-white text-sm" style={{ backgroundColor: BLUE }}>{t("products.form.save")}</button>
              <button type="button" onClick={() => setOpen(false)} className="h-10 px-5 rounded-md text-white text-sm" style={{ backgroundColor: DARK }}>{t("products.form.close")}</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
