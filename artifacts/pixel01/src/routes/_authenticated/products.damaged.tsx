import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/products/PageHeader";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { DataCard } from "@/components/products/DataCard";
import { AddDamagedDialog } from "@/components/products/AddDamagedDialog";
import { Plus, Eye, Trash2 } from "lucide-react";
import { exportToCsv } from "@/lib/csv";
import { useI18n } from "@/lib/i18n";
import { useEmployeesMap } from "@/hooks/use-employees-map";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { revertDamagedStock } from "@/lib/damaged.functions";
import { useWarehouseContext } from "@/contexts/WarehouseContext";

export const Route = createFileRoute("/_authenticated/products/damaged")({ component: DamagedPage });

const BLUE = "#3b82f6";
const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px" };

function DamagedPage() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const headStyle: React.CSSProperties = {
    backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px",
    fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb",
  };
  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState<ColumnDef[]>(() => [
    { key: "damage_date", label: t("products.damaged.col.date"), visible: true },
    { key: "ref_number", label: t("products.damaged.col.ref"), visible: true },
    { key: "damage_type", label: t("products.damaged.col.type"), visible: true },
    { key: "total", label: t("products.damaged.col.total"), visible: true },
    { key: "recovered_total", label: t("products.damaged.col.recovered"), visible: true },
    { key: "reason", label: t("products.damaged.col.reason"), visible: true },
    { key: "added_by", label: "أنشئ بواسطة", visible: true },
    { key: "actions", label: "الإجراءات", visible: true },
  ]);
  const [addOpen, setAddOpen] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);
  const [viewItems, setViewItems] = useState<any[]>([]);
  const qc = useQueryClient();
  const { data: empMap = {} } = useEmployeesMap();

  const { data = [] } = useQuery({
    queryKey: ["damaged_stock"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("damaged_stock").select("*").order("damage_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { currentWarehouseId } = useWarehouseContext();
  const filtered = useMemo(() => data.filter((d: any) => {
    if (search && !JSON.stringify(d).includes(search)) return false;
    if (currentWarehouseId && d.warehouse_id && d.warehouse_id !== currentWarehouseId) return false;
    return true;
  }), [data, search, currentWarehouseId]);
  const { sorted, sort, setSort } = useTableSort(filtered as any);
  useEffect(() => setPage(1), [search, perPage]);
  const pageSize = Number(perPage);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const paged = sorted.slice(from === 0 ? 0 : from - 1, to);
  const visible = cols.filter((c) => c.visible);

  const del = useMutation({
    mutationFn: async (id: string) => {
      await revertDamagedStock({ data: { id } });
    },
    onSuccess: () => { toast.success("تم الحذف وإعادة الكميات وعكس القيد"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  const openView = async (row: any) => {
    setViewing(row);
    const { data: items } = await supabase.from("damaged_stock_items").select("*").eq("damaged_stock_id", row.id);
    setViewItems((items as any[]) ?? []);
  };

  const exportCsv = (n: string) =>
    exportToCsv(n, visible.filter((c) => c.key !== "actions").map((c) => c.label),
      sorted.map((r: any) => visible.filter((c) => c.key !== "actions").map((c) => r[c.key] ?? "")));

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader
        title={t("products.damaged.title")}
        actions={
          <button type="button" onClick={() => setAddOpen(true)} className="h-9 px-4 rounded-md text-sm flex items-center gap-2 text-white" style={{ backgroundColor: BLUE }}>
            <Plus className="h-4 w-4" /> {t("products.form.add_category")}
          </button>
        }
      />
      <DataCard>
        <div className="text-sm font-semibold mb-3" style={{ color: "#111827" }}>{t("products.damaged.all")}</div>
        <TableToolbar search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={() => exportCsv("damaged.csv")} onExportExcel={() => exportCsv("damaged.xls")}
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
            <tbody>
              {paged.length === 0 ? <EmptyRow colSpan={visible.length} /> : paged.map((r: any) => (
                <tr key={r.id}>
                  {visible.map((c) => (
                    <td key={c.key} style={cellStyle}>
                      {c.key === "damage_date" ? new Date(r.damage_date).toLocaleString(dir === "rtl" ? "ar-EG" : "en-US") :
                       c.key === "damage_type" ? (r.damage_type === "normal" ? t("products.damaged.type.normal") : t("products.damaged.type.abnormal")) :
                       c.key === "added_by" ? (r.created_by ? (empMap[r.created_by] ?? r.created_by_name_snapshot ?? "—") : (r.created_by_name_snapshot ?? "—")) :
                       c.key === "actions" ? (
                         <div style={{ display: "inline-flex", gap: 6 }}>
                           <button onClick={() => openView(r)} style={{ height: 28, padding: "0 8px", borderRadius: 4, color: "#fff", backgroundColor: "#3b82f6", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                             <Eye className="h-3 w-3" /> فحص
                           </button>
                           <button onClick={() => { if (confirm("سيتم حذف العملية وإعادة الكميات للمخزون. متابعة؟")) del.mutate(r.id); }} style={{ height: 28, padding: "0 8px", borderRadius: 4, color: "#fff", backgroundColor: "#dc2626", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                             <Trash2 className="h-3 w-3" /> مسح
                           </button>
                         </div>
                       ) :
                       (r[c.key] ?? "—")}
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
      <AddDamagedDialog open={addOpen} onOpenChange={setAddOpen} />
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent dir={dir} className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>تفاصيل العملية — {viewing?.ref_number || "—"}</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><b>التاريخ:</b> {new Date(viewing.damage_date).toLocaleString(dir === "rtl" ? "ar-EG" : "en-US")}</div>
                <div><b>النوع:</b> {viewing.damage_type === "normal" ? "طبيعي" : "غير طبيعي"}</div>
                <div><b>الإجمالي:</b> {viewing.total}</div>
                <div><b>المسترد:</b> {viewing.recovered_total}</div>
                <div className="col-span-2"><b>السبب:</b> {viewing.reason || "—"}</div>
              </div>
              <table className="w-full text-sm" style={{ borderCollapse: "collapse", border: "1px solid #e5e7eb" }}>
                <thead><tr style={{ background: "#f9fafb" }}>
                  <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>الصنف</th>
                  <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>الكمية</th>
                  <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>سعر</th>
                  <th style={{ padding: 8, border: "1px solid #e5e7eb" }}>إجمالي</th>
                </tr></thead>
                <tbody>
                  {viewItems.map((it) => (
                    <tr key={it.id}>
                      <td style={{ padding: 8, border: "1px solid #e5e7eb" }}>{it.product_name_snapshot || it.description}</td>
                      <td style={{ padding: 8, border: "1px solid #e5e7eb" }}>{it.quantity} {it.unit_name || ""}</td>
                      <td style={{ padding: 8, border: "1px solid #e5e7eb" }}>{Number(it.unit_price).toFixed(2)}</td>
                      <td style={{ padding: 8, border: "1px solid #e5e7eb" }}>{Number(it.total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
