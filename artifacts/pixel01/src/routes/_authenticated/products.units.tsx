import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/products/PageHeader";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { DataCard } from "@/components/products/DataCard";
import { EntityDialog, type FieldDef } from "@/components/products/EntityDialog";
import { useUnits, useCreateUnit, useUpdateUnit, useDeleteUnit } from "@/hooks/use-product-meta";
import { Plus } from "lucide-react";
import { exportToCsv } from "@/lib/csv";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";

export const Route = createFileRoute("/_authenticated/products/units")({ component: UnitsPage });

const BLUE = "#3b82f6";
const RED = "#ef4444";
const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px" };

function UnitsPage() {
  const { t, dir } = useI18n();
  const headStyle: React.CSSProperties = {
    backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px",
    fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb",
  };

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState<ColumnDef[]>(() => [
    { key: "name", label: t("products.units.col.name"), visible: true },
    { key: "short_name", label: t("products.units.col.short"), visible: true },
    { key: "allow_fractions", label: t("products.units.col.fractions"), visible: true },
    { key: "opt", label: t("products.col.option"), visible: true },
  ]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const fields: FieldDef[] = [
    { type: "text", key: "name", label: t("products.units.col.name"), required: true, placeholder: t("products.units.col.name") },
    { type: "text", key: "short_name", label: t("products.units.short"), required: true, placeholder: t("products.units.short") },
    { type: "select", key: "allow_fractions", label: t("products.units.fractions"), required: true,
      options: [{ value: "yes", label: t("products.units.fractions_yes") }, { value: "no", label: t("products.units.fractions_no") }] },
    { type: "checkbox", key: "has_sub_units", label: t("products.units.has_sub") },
  ];

  const { data = [] } = useUnits();
  const create = useCreateUnit();
  const update = useUpdateUnit();
  const del = useDeleteUnit();

  const filtered = useMemo(
    () => data.filter((d: any) => !search || (d.name ?? "").includes(search) || (d.short_name ?? "").includes(search)),
    [data, search],
  );
  const { sorted, sort, setSort } = useTableSort(filtered as any);
  useEffect(() => setPage(1), [search, perPage]);
  const pageSize = Number(perPage);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const paged = sorted.slice(from === 0 ? 0 : from - 1, to);
  const visible = cols.filter((c) => c.visible);

  const exportCsv = (n: string) =>
    exportToCsv(n, visible.filter((c) => c.key !== "opt").map((c) => c.label),
      sorted.map((r: any) => visible.filter((c) => c.key !== "opt").map((c) => r[c.key] ?? "")));

  const onSubmit = async (values: Record<string, any>) => {
    const payload = {
      name: values.name?.trim(),
      short_name: values.short_name?.trim(),
      allow_fractions: values.allow_fractions || "no",
      has_sub_units: !!values.has_sub_units,
    };
    if (editing) await update.mutateAsync({ id: editing.id, values: payload });
    else await create.mutateAsync(payload);
    setOpen(false); setEditing(null);
  };

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader
        title={t("products.units.title")}
        subtitle={t("products.units.subtitle")}
        actions={
          <button type="button" onClick={() => { setEditing(null); setOpen(true); }}
            className="h-9 px-4 rounded-md text-sm flex items-center gap-2 text-white" style={{ backgroundColor: BLUE }}>
            <Plus className="h-4 w-4" /> {t("products.form.add_category")}
          </button>
        }
      />
      <DataCard>
        <div className="text-sm font-semibold mb-3" style={{ color: "#111827" }}>{t("products.units.all")}</div>
        <TableToolbar search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={() => exportCsv("units.csv")} onExportExcel={() => exportCsv("units.xls")}
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
            <tbody>
              {paged.length === 0 ? <EmptyRow colSpan={visible.length} /> : paged.map((r: any) => (
                <tr key={r.id}>
                  {visible.map((c) => (
                    <td key={c.key} style={cellStyle}>
                      {c.key === "opt" ? (
                        <div className="flex gap-2">
                          <button onClick={() => { setEditing(r); setOpen(true); }} className="h-8 px-3 rounded-md text-sm"
                            style={{ border: `1px solid ${BLUE}`, color: BLUE, backgroundColor: "#ffffff" }}>{t("products.action.edit")}</button>
                          <button onClick={async () => {
                            const { count, error } = await supabase
                              .from("products")
                              .select("id", { count: "exact", head: true })
                              .or(`main_unit.eq.${r.name},sub_unit_1.eq.${r.name},sub_unit_2.eq.${r.name}`);
                            if (error) { toast.error(error.message); return; }
                            if ((count ?? 0) > 0) { toast.error(t("products.toast.unit_used")); return; }
                            del.mutate(r.id);
                          }} className="h-8 px-3 rounded-md text-sm"
                            style={{ border: `1px solid ${RED}`, color: RED, backgroundColor: "#ffffff" }}>{t("products.action.delete")}</button>
                        </div>
                      ) : c.key === "allow_fractions" ? (r.allow_fractions === "yes" ? t("products.units.fractions_yes") : t("products.units.fractions_no")) : r[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TableFooter from={from} to={to} total={total} page={page} pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
      </DataCard>

      <EntityDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        title={editing ? t("products.units.edit_title") : t("products.units.add_title")} fields={fields}
        initial={editing ?? { allow_fractions: "no", has_sub_units: false }} onSubmit={onSubmit}
        submitting={create.isPending || update.isPending} />
    </div>
  );
}
