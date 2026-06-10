import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useBrands, useCategories, useUnits } from "@/hooks/use-product-meta";
import { PageHeader } from "@/components/products/PageHeader";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { DataCard } from "@/components/products/DataCard";
import { ProductFilters, emptyFilters, type ProductFiltersState } from "@/components/products/ProductFilters";
import { Plus, Download, Trash2, Barcode as BarcodeIcon, Pencil, Eye, MoreVertical, Star } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csv";
import { exportSingleSheet } from "@/lib/excel-export";
import { ProductDetailsDialog } from "@/components/products/ProductDetailsDialog";
import { formatBaseQuantity, toMainUnits, baseUnitName } from "@/lib/units";
import { useI18n } from "@/lib/i18n";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";
import { normalizeArabic } from "@/lib/search";
import { useProductStockForCurrentWarehouse } from "@/hooks/use-warehouse-stock";
import { useCan } from "@/lib/can";
import { useWarehouseContext } from "@/contexts/WarehouseContext";
import { getQuickItemIds, toggleQuickItem } from "@/lib/quick-items";

export const Route = createFileRoute("/_authenticated/products/")({ component: AllProductsPage });


const BLUE = "#3b82f6";
const RED = "#ef4444";
const YELLOW = "#eab308";

function AllProductsPage() {
  const { user } = useAuth();
  const { t, dir } = useI18n();
  const { can } = useCan();

  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    (supabase.rpc as any)("recalc_product_stock")
      .then(() => {
        qc.invalidateQueries({ queryKey: ["product_warehouse_stock"] });
        qc.invalidateQueries({ queryKey: ["products"] });
      })
      .catch(() => {});
  }, [qc]);

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"all" | "stock">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [colsAll, setColsAll] = useState<ColumnDef[]>(() => [
    { key: "name", label: t("products.col.name"), visible: true },
    { key: "name_en", label: t("products.col.name_en"), visible: true },
    { key: "cost", label: t("products.col.cost"), visible: true },
    { key: "previous_cost", label: t("products.col.previous_cost"), visible: false },
    { key: "price", label: t("products.col.price"), visible: true },
    { key: "previous_price", label: t("products.col.previous_price"), visible: false },
    { key: "stock", label: t("products.col.stock"), visible: true },
    { key: "category", label: t("products.col.category"), visible: true },
    { key: "sku", label: t("products.col.sku"), visible: true },
  ]);
  const [colsStock, setColsStock] = useState<ColumnDef[]>(() => [
    { key: "sku", label: t("products.col.sku_short"), visible: true },
    { key: "name", label: t("products.col.name"), visible: true },
    { key: "variant", label: t("products.col.variant"), visible: true },
    { key: "category", label: t("products.col.category"), visible: true },
    { key: "price", label: t("products.col.price"), visible: true },
    { key: "stock", label: t("products.col.stock"), visible: true },
    { key: "stockValueCost", label: t("products.col.stock_value_cost"), visible: true },
    { key: "stockValuePrice", label: t("products.col.stock_value_price"), visible: true },
    { key: "potentialProfit", label: t("products.col.potential_profit"), visible: true },
    { key: "soldUnits", label: t("products.col.sold_units"), visible: true },
    { key: "transferredUnits", label: t("products.col.transferred_units"), visible: false },
    { key: "damagedUnits", label: t("products.col.damaged_units"), visible: true },
  ]);
  const [filters, setFilters] = useState<ProductFiltersState>(emptyFilters);
  const [detailsProduct, setDetailsProduct] = useState<any | null>(null);
  const [quickItemIds, setQuickItemIds] = useState<string[]>([]);

  useEffect(() => {
    const load = () => setQuickItemIds(getQuickItemIds());
    load();
    window.addEventListener("quick-items-changed", load as EventListener);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("quick-items-changed", load as EventListener);
      window.removeEventListener("storage", load);
    };
  }, []);

  const { data: productsRaw = [] } = useQuery({
    queryKey: ["products"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const { data: pwsMap = {} } = useProductStockForCurrentWarehouse();
  const { currentWarehouseId } = useWarehouseContext();
  const products = useMemo(
    () => (productsRaw as any[]).map((p) => ({ ...p, stock: currentWarehouseId ? (pwsMap[p.id] ?? 0) : Number(p.stock ?? 0) })),
    [productsRaw, pwsMap, currentWarehouseId],
  );

  const { data: soldMap = {} } = useQuery<Record<string, number>>({
    queryKey: ["products-sold-map", currentWarehouseId ?? "all"],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("invoice_items")
        .select("product_id, quantity, base_quantity, invoices!inner(type, warehouse_id)")
        .not("product_id", "is", null);
      if (currentWarehouseId) q = q.eq("invoices.warehouse_id", currentWarehouseId);
      const { data, error } = await q;
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data as any[]) ?? []) {
        const type = r.invoices?.type;
        const qty = Math.abs(Number(r.base_quantity ?? r.quantity ?? 0));
        if (!r.product_id || !qty) continue;
        if (type === "sale") map[r.product_id] = (map[r.product_id] || 0) + qty;
        else if (type === "sale_return") map[r.product_id] = (map[r.product_id] || 0) - qty;
      }
      return map;
    },
  });

  const { data: damagedMap = {} } = useQuery<Record<string, number>>({
    queryKey: ["products-damaged-map", currentWarehouseId ?? "all"],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("damaged_stock_items")
        .select("product_id, quantity, base_quantity, damaged_stock!inner(warehouse_id)")
        .not("product_id", "is", null);
      if (currentWarehouseId) q = q.eq("damaged_stock.warehouse_id", currentWarehouseId);
      const { data, error } = await q;
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data as any[]) ?? []) {
        const qty = Number(r.base_quantity ?? r.quantity ?? 0);
        if (!r.product_id || !qty) continue;
        map[r.product_id] = (map[r.product_id] || 0) + qty;
      }
      return map;
    },
  });

  const { data: brands = [] } = useBrands();
  const { data: cats = [] } = useCategories();
  const { data: units = [] } = useUnits();
  const catName = (id: string | null) => (cats.find((c: any) => c.id === id) as any)?.name ?? "—";

  const del = useMutation({
    mutationFn: async (ids: string[]) => {
      // Snapshot each product into soft_deletes
      const { data: rows } = await (supabase.from("products") as any).select("*").in("id", ids);
      if (rows && (rows as any[]).length > 0) {
        const ownerId = (rows as any[])[0]?.owner_id;
        if (ownerId) {
          await (supabase.from("soft_deletes") as any).insert(
            (rows as any[]).map((r: any) => ({
              owner_id: ownerId,
              entity_type: "product",
              entity_id: r.id,
              entity_label: r.name,
              snapshot: r,
              deleted_by: user?.id ?? null,
            }))
          );
        }
      }
      const { error } = await supabase.from("products").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["soft-deletes"] });
      setSelected([]);
      toast.success("تم الحذف");
    },
    onError: (e: any) => {
      toast.error(e?.message || "تعذر حذف الصنف");
    },
  });

  const setActive = useMutation({
    mutationFn: async ({ ids, active }: { ids: string[]; active: boolean }) => {
      const { error } = await (supabase.from("products") as any).update({ is_active: active }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      setSelected([]);
      toast.success(vars.active ? "تم تفعيل المحدد" : "تم إلغاء تفعيل المحدد");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => products.filter((p: any) => {
    if (search) {
      const q = normalizeArabic(search);
      const hay = `${normalizeArabic(p.name)} ${normalizeArabic(p.name_en)} ${normalizeArabic(p.sku)}`;
      if (!hay.includes(q)) return false;
    }
    if (filters.categoryId && p.category_id !== filters.categoryId) return false;
    if (filters.unitId && p.unit_id !== filters.unitId) return false;
    if (filters.brandId && p.brand_id !== filters.brandId) return false;
    return true;
  }), [products, search, filters]);
  const { sorted, sort, setSort } = useTableSort(filtered as any);
  useEffect(() => setPage(1), [search, perPage, tab, filters]);

  const pageSize = Number(perPage);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const paged = sorted.slice(from === 0 ? 0 : from - 1, to);

  const cols = tab === "all" ? colsAll : colsStock;
  const setCols = tab === "all" ? setColsAll : setColsStock;
  const visible = cols.filter((c) => c.visible);
  const allChecked = paged.length > 0 && paged.every((p: any) => selected.includes(p.id));

  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px" };
  const headStyle: React.CSSProperties = {
    backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px",
    fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb",
  };

  const cellValue = (p: any, key: string) => {
    const cost = Number(p.cost ?? 0); const price = Number(p.price ?? 0); const stock = Number(p.stock ?? 0);
    const stockMain = toMainUnits(stock, p);
    switch (key) {
      case "name": return (
        <span className="inline-flex items-center gap-2">
          <span>{p.name}</span>
          {quickItemIds.includes(p.id) && (
            <span
              title="صنف سريع"
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1"
              style={{ backgroundColor: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}
            >
              <Star className="h-3 w-3" /> سريع
            </span>
          )}
          {p.is_active === false && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
              style={{ backgroundColor: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" }}>
              {t("products.inactive")}
            </span>
          )}
        </span>
      );
      case "name_en": return p.name_en || "—";
      case "sku": return p.sku || "—";
      case "variant": return "—";
      case "cost": return cost.toFixed(2);
      case "previous_cost": return p.previous_cost != null ? Number(p.previous_cost).toFixed(2) : "—";
      case "price": return price.toFixed(2);
      case "previous_price": return p.previous_price != null ? Number(p.previous_price).toFixed(2) : "—";
      case "stock": return formatBaseQuantity(stock, p);
      case "category": return catName(p.category_id);
      case "stockValueCost": return `${t("products.details.currency")} ${(cost * stockMain).toFixed(2)}`;
      case "stockValuePrice": return `${t("products.details.currency")} ${(price * stockMain).toFixed(2)}`;
      case "potentialProfit": return `${t("products.details.currency")} ${((price - cost) * stockMain).toFixed(2)}`;
      case "soldUnits": {
        const v = (soldMap as Record<string, number>)[p.id] || 0;
        return v > 0 ? formatBaseQuantity(v, p) : `0 ${baseUnitName(p)}`;
      }
      case "damagedUnits": {
        const v = (damagedMap as Record<string, number>)[p.id] || 0;
        return v > 0 ? formatBaseQuantity(v, p) : `0 ${baseUnitName(p)}`;
      }
      case "transferredUnits": return `0 ${baseUnitName(p)}`;
      default: return "—";
    }
  };

  const exportCsv = (filename: string) => {
    const headers = visible.map((c) => c.label);
    const rows = filtered.map((p: any) =>
      visible.map((c) => {
        if (c.key === "name") return p.name;
        const v = cellValue(p, c.key);
        return typeof v === "string" || typeof v === "number" ? v : String(v ?? "");
      })
    );
    if (filename.endsWith(".xls") || filename.endsWith(".xlsx")) {
      const objects = rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
      exportSingleSheet(filename.replace(/\.xls$/, ".xlsx"), objects, "Products");
    } else {
      exportToCsv(filename, headers, rows);
    }
  };

  // Summary row totals for stock tab
  const totals = useMemo(() => {
    if (tab !== "stock") return null;
    let cost = 0, price = 0, profit = 0, stock = 0;
    filtered.forEach((p: any) => {
      const c = Number(p.cost ?? 0), pr = Number(p.price ?? 0), s = Number(p.stock ?? 0);
      const sm = toMainUnits(s, p);
      cost += c * sm; price += pr * sm; profit += (pr - c) * sm; stock += s;
    });
    return { cost, price, profit, stock };
  }, [tab, filtered]);

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader
        title={t("products.title")}
        subtitle={t("products.subtitle")}
        actions={
          <>
            {can("products", "create") && (
              <Link to="/products/add" className="h-9 px-4 rounded-md text-sm flex items-center gap-2 text-white" style={{ backgroundColor: BLUE }}>
                <Plus className="h-4 w-4" /> {t("products.add")}
              </Link>
            )}
            {can("products", "print") && (
              <button type="button" onClick={() => exportCsv("products.xls")}
                className="h-9 px-4 rounded-md text-sm flex items-center gap-2"
                style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151" }}>
                <Download className="h-4 w-4" /> {t("products.download_excel")}
              </button>
            )}

            {can("products", "create") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-9 px-3 rounded-md text-sm flex items-center gap-1"
                    style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151" }}
                  >
                    <MoreVertical className="h-4 w-4" /> خيارات
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => navigate({ to: "/products/import-opening-stock" })}>
                    إضافة كميات افتتاحية
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

          </>

        }
      />

      <DataCard>
        <div className="flex items-center justify-end gap-2 pb-2 mb-3" style={{ borderBottom: "1px solid #e5e7eb" }}>
          <ProductFilters value={filters} onChange={setFilters} />
        </div>

        <div className="flex gap-1 mb-3">
          <button onClick={() => setTab("all")} className="px-4 py-2 text-sm rounded-t-md"
            style={{ borderBottom: tab === "all" ? `2px solid ${BLUE}` : "2px solid transparent",
              color: tab === "all" ? BLUE : "#6b7280", fontWeight: tab === "all" ? 600 : 400 }}>{t("products.tab.all")}</button>
          <button onClick={() => setTab("stock")} className="px-4 py-2 text-sm rounded-t-md"
            style={{ borderBottom: tab === "stock" ? `2px solid ${BLUE}` : "2px solid transparent",
              color: tab === "stock" ? BLUE : "#6b7280", fontWeight: tab === "stock" ? 600 : 400 }}>{t("products.tab.stock")}</button>
        </div>

        <TableToolbar search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={can("products", "print") ? () => exportCsv("products.csv") : undefined as any}
          onExportExcel={can("products", "print") ? () => exportCsv("products.xls") : undefined as any}
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))} />


        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {tab === "all" && (
                  <th style={{ ...headStyle, width: 40 }}>
                    <input type="checkbox" checked={allChecked}
                      onChange={(e) => {
                        if (e.target.checked) setSelected(Array.from(new Set([...selected, ...paged.map((p: any) => p.id)])));
                        else setSelected(selected.filter((id) => !paged.find((p: any) => p.id === id)));
                      }} />
                  </th>
                )}
                {tab === "stock" && <th style={headStyle}>{t("products.col.option")}</th>}
                {visible.map((c) => (
                  <th key={c.key} style={headStyle}>
                    <button
                      type="button"
                      onClick={() => {
                        const next = sort.key === c.key
                          ? (sort.dir === "asc" ? { key: c.key, dir: "desc" as const } : { key: "", dir: null as any })
                          : { key: c.key, dir: "asc" as const };
                        setSort(next);
                      }}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      style={{ background: "transparent", border: 0, cursor: "pointer", color: "inherit", font: "inherit", padding: 0 }}
                    >
                      {c.label}
                      <span style={{ fontSize: 10, opacity: sort.key === c.key ? 1 : 0.35 }}>
                        {sort.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  </th>
                ))}
                {tab === "all" && <th style={headStyle}>{t("products.col.option")}</th>}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <EmptyRow colSpan={visible.length + (tab === "all" ? 2 : 1)} />
              ) : paged.map((p: any) => {
                const checked = selected.includes(p.id);
                return (
                  <tr key={p.id}>
                    {tab === "all" && (
                      <td style={cellStyle}>
                        <input type="checkbox" checked={checked}
                          onChange={(e) => setSelected((s) => e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id))} />
                      </td>
                    )}
                    {tab === "stock" && (
                      <td style={cellStyle}>
                        <Link to="/products/$id/card" params={{ id: p.id }}
                          className="h-8 px-3 rounded-md text-sm inline-flex items-center"
                          style={{ border: `1px solid ${BLUE}`, color: BLUE, backgroundColor: "#ffffff" }}>{t("products.item_card")}</Link>
                      </td>
                    )}
                    {visible.map((c) => <td key={c.key} style={cellStyle}>{cellValue(p, c.key)}</td>)}
                    {tab === "all" && (
                      <td style={cellStyle}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="h-8 px-3 rounded-md text-sm inline-flex items-center gap-1"
                              style={{ border: "1px solid #d1d5db", color: "#374151", backgroundColor: "#ffffff" }}
                            >
                              <MoreVertical className="h-4 w-4" /> خيارات
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setDetailsProduct(p)}>
                              <Eye className="h-4 w-4 me-2" style={{ color: "#16a34a" }} />
                              {t("products.action.details")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => navigate({ to: "/products/$id/card", params: { id: p.id } })}>
                              <Eye className="h-4 w-4 me-2" style={{ color: BLUE }} />
                              {t("products.item_card")}
                            </DropdownMenuItem>

                            {can("products", "print") && (
                              <DropdownMenuItem onSelect={() => navigate({ to: "/products/print-labels", search: { productId: p.id, qty: 1 } })}>
                                <BarcodeIcon className="h-4 w-4 me-2" style={{ color: BLUE }} />
                                {t("products.action.print_label")}
                              </DropdownMenuItem>
                            )}
                            {can("products", "edit") && (
                              <DropdownMenuItem onSelect={() => navigate({ to: "/products/$id/edit", params: { id: p.id } })}>
                                <Pencil className="h-4 w-4 me-2" style={{ color: YELLOW }} />
                                {t("products.action.edit")}
                              </DropdownMenuItem>
                            )}
                            {can("products", "create") && (
                              <DropdownMenuItem
                                onSelect={() => {
                                  const enabled = toggleQuickItem(p.id);
                                  toast.success(enabled ? "تمت الإضافة للأصناف السريعة" : "تمت الإزالة من الأصناف السريعة");
                                  setQuickItemIds(getQuickItemIds());
                                }}
                              >
                                <Star className="h-4 w-4 me-2" style={{ color: "#f59e0b" }} />
                                {quickItemIds.includes(p.id) ? "إزالة من الأصناف السريعة" : "إضافة للأصناف السريعة"}
                              </DropdownMenuItem>
                            )}
                            {can("products", "create") && (
                              <DropdownMenuItem onSelect={() => navigate({ to: "/products/import-opening-stock", search: { productId: p.id } as any })}>
                                <Plus className="h-4 w-4 me-2" style={{ color: BLUE }} />
                                إضافة كميات افتتاحية
                              </DropdownMenuItem>
                            )}
                            {can("products", "delete") && (
                              <DropdownMenuItem onSelect={() => del.mutate([p.id])} style={{ color: RED }}>
                                <Trash2 className="h-4 w-4 me-2" />
                                {t("products.action.delete") || "حذف"}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>

                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                );
              })}
              {tab === "stock" && totals && paged.length > 0 && (
                <tr style={{ backgroundColor: "#f9fafb", fontWeight: 600 }}>
                  <td style={cellStyle}></td>
                  <td style={cellStyle} colSpan={6}>{t("toolbar.show")}:</td>
                  <td style={cellStyle}>{totals.stock.toFixed(2)}</td>
                  <td style={cellStyle}>{t("products.details.currency")} {totals.cost.toFixed(2)}</td>
                  <td style={cellStyle}>{t("products.details.currency")} {totals.price.toFixed(2)}</td>
                  <td style={cellStyle}>{t("products.details.currency")} {totals.profit.toFixed(2)}</td>
                  <td style={cellStyle} colSpan={6}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {tab === "all" && (can("products", "delete") || can("products", "edit")) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {can("products", "delete") && (
              <button onClick={() => { if (selected.length) del.mutate(selected); else toast.error(t("products.toast.none_selected")); }}
                className="h-8 px-3 rounded-md text-sm" style={{ border: `1px solid ${RED}`, color: RED, backgroundColor: "#ffffff" }}>
                {t("products.action.delete_selected")}
              </button>
            )}
            {can("products", "edit") && (
              <button onClick={() => { if (selected.length) setActive.mutate({ ids: selected, active: false }); else toast.error(t("products.toast.none_selected")); }}
                className="h-8 px-3 rounded-md text-sm" style={{ border: `1px solid ${YELLOW}`, color: YELLOW, backgroundColor: "#ffffff" }}>
                {t("products.action.deactivate_selected")}
              </button>
            )}
            {can("products", "edit") && (
              <button onClick={() => { if (selected.length) setActive.mutate({ ids: selected, active: true }); else toast.error(t("products.toast.none_selected")); }}
                className="h-8 px-3 rounded-md text-sm" style={{ border: "1px solid #16a34a", color: "#16a34a", backgroundColor: "#ffffff" }}>
              {t("products.action.activate_selected")}
              </button>
            )}
          </div>
        )}


        <TableFooter from={from} to={to} total={total} page={page} pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
      </DataCard>

      
      <ProductDetailsDialog open={!!detailsProduct} onOpenChange={(v) => !v && setDetailsProduct(null)} product={detailsProduct} />
    </div>
  );
}
