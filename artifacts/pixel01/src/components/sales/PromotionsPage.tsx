import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { exportToCsv, exportToXls } from "@/lib/csv";
import { useBrands, useCategories } from "@/hooks/use-product-meta";
import { usePromotions, useUpsertPromotion, useDeletePromotion, type Promotion } from "@/hooks/use-promotions";
import { PromotionFormModal } from "./PromotionFormModal";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";

export function PromotionsPage() {
  const { t, dir } = useI18n();
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #d1d5db" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #e5e7eb", padding: "10px 12px", color: "#374151" };

  const baseCols: ColumnDef[] = [
    { key: "name", label: t("sales.promo.col.name"), visible: true },
    { key: "products", label: t("sales.promo.col.products"), visible: true },
    { key: "category", label: t("sales.promo.col.category"), visible: true },
    { key: "brand", label: t("sales.promo.col.brand"), visible: true },
    { key: "priority", label: t("sales.promo.col.priority"), visible: true },
    { key: "amount", label: t("sales.promo.col.amount"), visible: true },
    { key: "ends_at", label: t("sales.promo.col.ends"), visible: true },
    { key: "starts_at", label: t("sales.promo.col.starts"), visible: true },
    { key: "is_active", label: t("sales.promo.col.status"), visible: true },
    { key: "opt", label: t("sales.cols.option"), visible: true },
  ];

  const { data: brands = [] } = useBrands();
  const { data: categories = [] } = useCategories();
  const { data: rows = [] } = usePromotions();
  const upsert = useUpsertPromotion();
  const del = useDeletePromotion();

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState(baseCols);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const brandName = (id: string | null) => (brands as any[]).find((b) => b.id === id)?.name || "—";
  const catName = (id: string | null) => (categories as any[]).find((c) => c.id === id)?.name || "—";

  const filtered = useMemo(
    () => (rows as Promotion[]).filter((r) => !search || r.name.includes(search)),
    [rows, search],
  );
  const { sorted, sort, setSort } = useTableSort(filtered as any);
  useEffect(() => setPage(1), [search, perPage]);

  const pageSize = Number(perPage);
  const totalRows = sorted.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const from = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(totalRows, page * pageSize);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const visible = cols.filter((c) => c.visible);

  const cellFor = (r: Promotion, key: string) => {
    if (key === "products") return r.product_ids.length ? t("sales.promo.items_count", { n: r.product_ids.length }) : t("sales.promo.all");
    if (key === "category") return catName(r.category_id);
    if (key === "brand") return brandName(r.brand_id);
    if (key === "amount") return r.discount_type === "percent" ? `${r.amount}%` : `${Number(r.amount).toFixed(2)} ج.م`;
    if (key === "starts_at" || key === "ends_at") return r[key]?.replace("T", " ").slice(0, 16) || "—";
    if (key === "is_active") return r.is_active ? t("sales.promo.active") : t("sales.promo.inactive");
    return (r as any)[key] ?? "";
  };

  const exportHeaders = visible.filter((c) => c.key !== "opt").map((c) => c.label);
  const exportRows = sorted.map((r) => visible.filter((c) => c.key !== "opt").map((c) => String(cellFor(r, c.key) ?? "")));

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("sales.titles.promotions")} />
      <DataCard className="border-gray-300">
        <div className="mb-3">
          <button onClick={() => { setEditing(null); setModalOpen(true); }}
            className="h-10 px-4 rounded-full text-sm flex items-center gap-2 text-white" style={{ backgroundColor: "#6366f1" }}>
            <Plus className="h-4 w-4" /> {t("sales.promo.add")}
          </button>
        </div>
        <TableToolbar
          search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={() => exportToCsv("promotions.csv", exportHeaders, exportRows)}
          onExportExcel={() => exportToXls("promotions.xls", exportHeaders, exportRows)}
          printRef={printRef} printTitle={t("sales.titles.promotions")}
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))}
        />
        <div className="overflow-x-auto rounded-md print-table-area" ref={printRef} style={{ border: "1px solid #d1d5db" }}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
            <tbody>
              {pageRows.length === 0 ? <EmptyRow colSpan={visible.length} /> : pageRows.map((r) => (
                <tr key={r.id}>
                  {visible.map((c) => c.key === "opt" ? (
                    <td key={c.key} style={cellStyle}>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(r); setModalOpen(true); }} className="h-8 px-2 inline-flex items-center gap-1 text-xs rounded text-white" style={{ backgroundColor: "#3b82f6" }}>
                          <Pencil className="h-3 w-3" /> {t("sales.actions.edit")}
                        </button>
                        <button onClick={() => del.mutate(r.id)} className="h-8 px-2 inline-flex items-center gap-1 text-xs rounded text-white" style={{ backgroundColor: "#dc2626" }}>
                          <Trash2 className="h-3 w-3" /> {t("sales.actions.delete")}
                        </button>
                      </div>
                    </td>
                  ) : <td key={c.key} style={cellStyle}>{cellFor(r, c.key)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TableFooter from={from} to={to} total={totalRows} page={page} pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
      </DataCard>

      <PromotionFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={editing}
        onSave={(p) => upsert.mutate(p)}
      />
    </div>
  );
}
