import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { FilterBar, type FilterField } from "@/components/shared/FilterBar";
import { exportToCsv, exportToXls } from "@/lib/csv";
import { exportSingleSheet } from "@/lib/excel-export";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useContacts } from "@/hooks/use-contacts";
import { formatBaseQuantity } from "@/lib/units";
import { ArrowUpDown } from "lucide-react";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";
import { InvoiceDetailsModal } from "./InvoiceDetailsModal";
import { useInvoicePrint } from "@/hooks/use-invoice-print";

function useDetailedRows() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sales-detailed-report"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase.from("invoice_items") as any).select(`
        id, quantity, base_quantity, unit_price, discount_amount, total, created_at, expiry_date,
        product:products(id, name, sku, stock, main_unit, sub_unit_1, sub_unit_1_ratio, sub_unit_2, sub_unit_2_ratio, category_id, brand_id),
        invoice:invoices!inner(id, invoice_number, issue_date, created_at, payment_method, payment_status, paid_amount, total, customer_id, type, tax, subtotal, shipping_status, notes)
      `).limit(2000);
      if (error) throw error;
      return ((data as any[]) || []).filter((r) => r.invoice?.type === "sale");
    },
  });
}

function useHistoricalStockMap(items: any[]) {
  const { user } = useAuth();
  const productIds = useMemo(
    () => Array.from(new Set(items.map((it) => it.product?.id).filter(Boolean))),
    [items],
  );
  return useQuery({
    queryKey: ["historical-stock", productIds.sort().join(",")],
    enabled: !!user && productIds.length > 0,
    queryFn: async () => {
      const { data: prods } = await (supabase.from("products") as any)
        .select("id, stock").in("id", productIds);
      const currentStock = new Map<string, number>();
      ((prods as any[]) || []).forEach((p) => currentStock.set(p.id, Number(p.stock || 0)));

      type Mov = { product_id: string; ts: number; delta: number; key?: string };
      const movs: Mov[] = [];

      const [invItems, purItems, prItems, dmgItems] = await Promise.all([
        (supabase.from("invoice_items") as any)
          .select("id, product_id, quantity, base_quantity, created_at, invoice:invoices!inner(type, issue_date)")
          .in("product_id", productIds),
        (supabase.from("purchase_items") as any)
          .select("id, product_id, quantity, base_quantity, created_at, purchase:purchases!inner(purchase_date)")
          .in("product_id", productIds),
        (supabase.from("purchase_return_items") as any)
          .select("id, product_id, quantity, base_quantity, created_at, purchase_return:purchase_returns!inner(return_date)")
          .in("product_id", productIds),
        (supabase.from("damaged_stock_items") as any)
          .select("id, product_id, quantity, base_quantity, created_at, damaged_stock:damaged_stock!inner(damage_date)")
          .in("product_id", productIds),
      ]);

      const tOf = (createdAt: string | null, dateOnly: string | null) => {
        if (createdAt) return new Date(createdAt).getTime();
        if (dateOnly) return new Date(dateOnly + "T00:00:00").getTime();
        return 0;
      };

      ((invItems.data as any[]) || []).forEach((r) => {
        const q = Math.abs(Number(r.base_quantity ?? r.quantity ?? 0));
        const ts = tOf(r.created_at, r.invoice?.issue_date);
        if (r.invoice?.type === "sale") {
          movs.push({ product_id: r.product_id, ts, delta: -q, key: `inv:${r.id}` });
        } else if (r.invoice?.type === "sale_return") {
          movs.push({ product_id: r.product_id, ts, delta: +q });
        }
      });
      ((purItems.data as any[]) || []).forEach((r) => {
        const q = Math.abs(Number(r.base_quantity ?? r.quantity ?? 0));
        movs.push({ product_id: r.product_id, ts: tOf(r.created_at, r.purchase?.purchase_date), delta: +q });
      });
      ((prItems.data as any[]) || []).forEach((r) => {
        const q = Math.abs(Number(r.base_quantity ?? r.quantity ?? 0));
        movs.push({ product_id: r.product_id, ts: tOf(r.created_at, r.purchase_return?.return_date), delta: -q });
      });
      ((dmgItems.data as any[]) || []).forEach((r) => {
        const q = Math.abs(Number(r.base_quantity ?? r.quantity ?? 0));
        movs.push({ product_id: r.product_id, ts: tOf(r.created_at, r.damaged_stock?.damage_date), delta: -q });
      });

      const stockAfter = new Map<string, number>();
      const byProduct = new Map<string, Mov[]>();
      movs.forEach((m) => {
        if (!byProduct.has(m.product_id)) byProduct.set(m.product_id, []);
        byProduct.get(m.product_id)!.push(m);
      });
      byProduct.forEach((arr, pid) => {
        arr.sort((a, b) => b.ts - a.ts);
        let running = currentStock.get(pid) ?? 0;
        for (const m of arr) {
          if (m.key) stockAfter.set(m.key.slice(4), running);
          running = running - m.delta;
        }
      });
      return stockAfter;
    },
  });
}

/** Fetch latest purchase per product before a date, for "with purchase" tab. */
function usePurchaseLookup(productIds: string[]) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["purchase-lookup", productIds.sort().join(",")],
    enabled: !!user && productIds.length > 0,
    queryFn: async () => {
      const { data: pi } = await (supabase.from("purchase_items") as any)
        .select("product_id, expiry_date, purchase:purchases!inner(id, purchase_number, ref_no, purchase_date, supplier_id, supplier_name_snapshot)")
        .in("product_id", productIds);
      const { data: sups } = await (supabase.from("contacts") as any)
        .select("id, first_name, last_name, business_name")
        .in("type", ["supplier", "both"]);
      const supMap = new Map<string, string>();
      ((sups as any[]) || []).forEach((s: any) => {
        const name = [s.first_name, s.last_name].filter(Boolean).join(" ") || s.business_name || "";
        if (name) supMap.set(s.id, name);
      });
      return { items: ((pi as any[]) || []), supMap };
    },
  });
}

function useCategoriesMap() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["categories-map"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase.from("categories") as any).select("id, name");
      const m = new Map<string, string>();
      ((data as any[]) || []).forEach((c) => m.set(c.id, c.name));
      return m;
    },
  });
}

function useBrandsMap() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["brands-map"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase.from("brands") as any).select("id, name");
      const m = new Map<string, string>();
      ((data as any[]) || []).forEach((b) => m.set(b.id, b.name));
      return m;
    },
  });
}

export function DetailedSalesReportPage() {
  const { t, dir, lang } = useI18n();
  const isAr = lang === "ar";
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #d1d5db" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #e5e7eb", padding: "10px 12px", color: "#374151" };

  const TABS = [
    { key: "detailed", label: t("sales.report.tab_detailed") },
    { key: "with_purchase", label: t("sales.report.tab_with_purchase") },
    { key: "summary", label: t("sales.report.tab_summary") },
    { key: "by_category", label: t("sales.report.tab_by_category") },
    { key: "by_brand", label: t("sales.report.tab_by_brand") },
  ];

  const baseCols: ColumnDef[] = [
    { key: "product_name", label: t("sales.report.col.item"), visible: true },
    { key: "sku", label: t("sales.report.col.sku"), visible: true },
    { key: "customer", label: t("sales.cols.customer"), visible: true },
    { key: "contact_id", label: t("sales.report.col.contact_id"), visible: true },
    { key: "invoice_number", label: t("sales.cols.invoice_no"), visible: true },
    { key: "issue_date", label: t("sales.cols.date"), visible: true, dirLabels: { desc: isAr ? "الأحدث" : "Newest", asc: isAr ? "الأقدم" : "Oldest" } },
    { key: "quantity", label: t("sales.form.qty"), visible: true },
    { key: "current_stock", label: "المخزون بعد الفاتورة", visible: true },
    { key: "unit_price", label: t("sales.items.col.unit_price"), visible: true },
    { key: "discount", label: t("sales.cashier.discount"), visible: true },
    { key: "tax", label: t("sales.cashier.tax"), visible: true },
    { key: "price_with_tax", label: t("sales.form.tax_inclusive"), visible: true },
    { key: "total", label: t("sales.cols.total"), visible: true },
    { key: "payment_method", label: t("sales.cols.payment_method"), visible: true },
  ];

  const { data: items = [] } = useDetailedRows();
  const { data: stockMap } = useHistoricalStockMap(items as any[]);
  const { data: customers = [] } = useContacts("customer");
  const { data: categoriesMap } = useCategoriesMap();
  const { data: brandsMap } = useBrandsMap();
  const productIds = useMemo(
    () => Array.from(new Set((items as any[]).map((it) => it.product?.id).filter(Boolean))),
    [items],
  );
  const { data: purchaseLookup } = usePurchaseLookup(productIds);

  const [tab, setTab] = useState("detailed");
  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState(baseCols);
  const [filters, setFilters] = useState({ from: "", to: "", customer_id: "" });
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "qty_desc" | "total_desc" | "product">("date_desc");
  const printRef = useRef<HTMLDivElement>(null);
  const [viewInvoice, setViewInvoice] = useState<any | null>(null);
  const [selectedRowIdx, setSelectedRowIdx] = useState(0);
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});


  const custMap = useMemo(() => {
    const m = new Map<string, any>();
    (customers as any[]).forEach((c) => m.set(c.id, c));
    return m;
  }, [customers]);

  const custName = (id?: string | null) => {
    const c = id ? custMap.get(id) : null;
    return c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || c.business_name || c.contact_id : t("sales.filters.cash_customer");
  };

  const { onModalPrint, printNode } = useInvoicePrint({
    customerName: (inv) => custName(inv?.customer_id) || inv?.customer_name_snapshot || "",
  });

  const enriched = useMemo(() => (items as any[]).map((it) => {
    const inv = it.invoice;
    const qty = Number(it.quantity || 0);
    const price = Number(it.unit_price || 0);
    const discount = Number(it.discount_amount || 0);
    const total = Number(it.total || qty * price - discount);
    const invTax = Number(inv?.tax || 0);
    const invSub = Number(inv?.subtotal || 1);
    const lineTax = invSub > 0 ? (total / invSub) * invTax : 0;
    return {
      id: it.id,
      product_id: it.product?.id,
      product: it.product,
      product_name: it.product?.name || "—",
      sku: it.product?.sku || "—",
      current_stock: it.product
        ? formatBaseQuantity(Number(stockMap?.get(it.id) ?? it.product.stock ?? 0), it.product)
        : "—",
      customer: custName(inv?.customer_id),
      contact_id: inv?.customer_id ? custMap.get(inv.customer_id)?.contact_id || "—" : "—",
      invoice_number: inv?.invoice_number,
      issue_date: inv?.created_at || (inv?.issue_date ? `${inv.issue_date}T00:00:00` : null),
      issue_date_only: inv?.issue_date,
      issue_datetime: inv?.created_at || (inv?.issue_date ? `${inv.issue_date}T00:00:00` : null),
      issue_date_ts: inv?.created_at ? new Date(inv.created_at).getTime() : (inv?.issue_date ? new Date(inv.issue_date).getTime() : 0),
      quantity: qty,
      base_quantity: Number(it.base_quantity ?? qty),
      unit_price: price,
      discount,
      tax: lineTax,
      price_with_tax: total + lineTax,
      total,
      payment_method: inv?.payment_method === "cash" ? t("sales.pay.cash") : (inv?.payment_method || "—"),
      _customer_id: inv?.customer_id,
      _expiry: it.expiry_date,
      _invoice: inv,
    };
  }), [items, customers, stockMap]);

  const filtered = useMemo(() => {
    let rows = enriched.filter((r) => {
      if (search && ![r.product_name, r.sku, r.customer, r.invoice_number].filter(Boolean).join(" ").includes(search)) return false;
      // Date filter falls back to created_at when issue_date is missing.
      // filters.from/to may be YYYY-MM-DD or YYYY-MM-DDTHH:mm (datetime-local) — normalize to date-only.
      const cmpDate = r.issue_date_only || (r._invoice?.created_at ? r._invoice.created_at.slice(0, 10) : "");
      const fromD = filters.from ? filters.from.slice(0, 10) : "";
      const toD = filters.to ? filters.to.slice(0, 10) : "";
      if (fromD && (!cmpDate || cmpDate < fromD)) return false;
      if (toD && (!cmpDate || cmpDate > toD)) return false;
      if (filters.customer_id && r._customer_id !== filters.customer_id) return false;
      return true;
    });
    switch (sortBy) {
      case "date_desc": rows = rows.slice().sort((a, b) => b.issue_date_ts - a.issue_date_ts); break;
      case "date_asc": rows = rows.slice().sort((a, b) => a.issue_date_ts - b.issue_date_ts); break;
      case "qty_desc": rows = rows.slice().sort((a, b) => b.quantity - a.quantity); break;
      case "total_desc": rows = rows.slice().sort((a, b) => b.total - a.total); break;
      case "product": rows = rows.slice().sort((a, b) => String(a.product_name).localeCompare(String(b.product_name))); break;
    }
    return rows;
  }, [enriched, search, filters, sortBy]);
  const { sorted, sort, setSort } = useTableSort(filtered as any);
  useEffect(() => setPage(1), [search, perPage, filters, tab, sortBy]);

  // Quick date presets — use local-time YYYY-MM-DD
  const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const setRange = (fromD: Date, toD: Date) => setFilters((f) => ({ ...f, from: fmtDate(fromD), to: fmtDate(toD) }));
  const presetToday = () => { const t = new Date(); setRange(t, t); };
  const presetYesterday = () => { const t = new Date(); t.setDate(t.getDate() - 1); setRange(t, t); };
  const presetThisWeek = () => { const t = new Date(); const s = new Date(t); s.setDate(t.getDate() - 6); setRange(s, t); };
  const presetThisMonth = () => { const t = new Date(); const s = new Date(t.getFullYear(), t.getMonth(), 1); setRange(s, t); };

  const filterFields: FilterField[] = [
    { type: "date", key: "from", label: t("sales.filters.from"), value: filters.from },
    { type: "date", key: "to", label: t("sales.filters.to"), value: filters.to },
    { type: "select", key: "customer_id", label: t("sales.filters.customer"), value: filters.customer_id, options: (customers as any[]).map((c) => ({ value: c.id, label: custName(c.id) })) },
  ];

  const pageSize = Number(perPage);
  const totalRows = sorted.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const from = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(totalRows, page * pageSize);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const visible = cols.filter((c) => c.visible);

  useEffect(() => {
    setSelectedRowIdx(0);
  }, [page, search, filters, sort, tab]);

  useEffect(() => {
    if (tab !== "detailed") return;
    const isEditable = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (node as any).isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (tab !== "detailed" || pageRows.length === 0) return;
      if (isEditable(e.target)) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedRowIdx((prev) => Math.min(pageRows.length - 1, prev + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedRowIdx((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, pageRows]);

  useEffect(() => {
    if (tab !== "detailed") return;
    rowRefs.current[selectedRowIdx]?.scrollIntoView({ block: "nearest" });
  }, [selectedRowIdx, tab]);

  const sumQty = sorted.reduce((s, r) => s + r.quantity, 0);
  const sumDiscount = sorted.reduce((s, r) => s + r.discount, 0);
  const sumTotal = sorted.reduce((s, r) => s + r.total, 0);

  const fmt = (n: number) => `${n.toFixed(2)} ج.م`;
  const fmtDateTime = (val: string | null | undefined) => {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const pad = (n: number) => String(n).padStart(2, "0");
    const time = d.toLocaleTimeString(isAr ? "ar-EG" : "en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`;
  };
  const cellFor = (r: any, key: string) => {
    if (["unit_price", "discount", "tax", "price_with_tax", "total"].includes(key)) return fmt(Number(r[key] || 0));
    if (key === "quantity") return `${r.quantity.toFixed(2)} ${t("sales.report.unit")}`;
    if (key === "issue_date") return fmtDateTime(r.issue_datetime);
    return r[key] ?? "";
  };

  // ===== Tab: With Purchase =====
  const withPurchaseRows = useMemo(() => {
    if (!purchaseLookup) return sorted.map((r) => ({ ...r, ref_purchase: "—", supplier: "—" }));
    return sorted.map((r) => {
      const candidates = (purchaseLookup.items as any[]).filter((p) => p.product_id === r.product_id);
      // match by expiry first, else latest purchase <= invoice date
      let picked: any = null;
      if (r._expiry) picked = candidates.find((c) => c.expiry_date === r._expiry);
      if (!picked) {
        const before = candidates
          .filter((c) => !r.issue_date_only || (c.purchase?.purchase_date && c.purchase.purchase_date <= r.issue_date_only))
          .sort((a, b) => String(b.purchase?.purchase_date || "").localeCompare(String(a.purchase?.purchase_date || "")));
        picked = before[0] || candidates[0];
      }
      return {
        ...r,
        supplier: picked?.purchase?.supplier_id
          ? (purchaseLookup.supMap.get(picked.purchase.supplier_id) || picked?.purchase?.supplier_name_snapshot || "بدون مورد")
          : (picked?.purchase?.supplier_name_snapshot || "بدون مورد"),
      };
    });
  }, [filtered, purchaseLookup]);

  // ===== Tab: Summary (group by product + date) =====
  const summaryRows = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of filtered) {
      const key = `${r.product_id}_${r.issue_date_only}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          id: key, product: r.product, sku: r.sku,
          issue_date: r.issue_date_only, qty: r.quantity, base_qty: r.base_quantity, total: r.total,
          stock_now: r.product ? Number(r.product.stock || 0) : 0,
        });
      } else {
        existing.qty += r.quantity;
        existing.base_qty += r.base_quantity;
        existing.total += r.total;
      }
    }
    return Array.from(map.values());
  }, [filtered]);

  // ===== Tab: By Category =====
  const byCategoryRows = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of filtered) {
      const catId = r.product?.category_id || "_none";
      const existing = map.get(catId);
      if (!existing) {
        map.set(catId, { id: catId, name: catId === "_none" ? "غير مصنف" : (categoriesMap?.get(catId) || "—"), qty: r.quantity, total: r.total });
      } else {
        existing.qty += r.quantity;
        existing.total += r.total;
      }
    }
    return Array.from(map.values());
  }, [filtered, categoriesMap]);

  // ===== Tab: By Brand =====
  const byBrandRows = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of filtered) {
      const bId = r.product?.brand_id || "_none";
      const existing = map.get(bId);
      if (!existing) {
        map.set(bId, { id: bId, name: bId === "_none" ? "أي علامة تجارية" : (brandsMap?.get(bId) || "—"), qty: r.quantity, total: r.total });
      } else {
        existing.qty += r.quantity;
        existing.total += r.total;
      }
    }
    return Array.from(map.values());
  }, [filtered, brandsMap]);

  const exportHeaders = visible.map((c) => c.label);
  const exportRows = sorted.map((r) => visible.map((c) => String(cellFor(r, c.key))));

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("sales.titles.detailed_report")} />
      <DataCard className="border-gray-300">
        <FilterBar fields={filterFields}
          onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
          onReset={() => setFilters({ from: "", to: "", customer_id: "" })} />

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs text-gray-500">نطاق سريع:</span>
          <button type="button" onClick={presetToday} className="h-8 px-3 rounded text-xs border border-gray-300 bg-white hover:bg-gray-50">اليوم</button>
          <button type="button" onClick={presetYesterday} className="h-8 px-3 rounded text-xs border border-gray-300 bg-white hover:bg-gray-50">الأمس</button>
          <button type="button" onClick={presetThisWeek} className="h-8 px-3 rounded text-xs border border-gray-300 bg-white hover:bg-gray-50">آخر 7 أيام</button>
          <button type="button" onClick={presetThisMonth} className="h-8 px-3 rounded text-xs border border-gray-300 bg-white hover:bg-gray-50">هذا الشهر</button>
          <button type="button" onClick={() => setFilters((f) => ({ ...f, from: "", to: "" }))} className="h-8 px-3 rounded text-xs border border-gray-300 bg-white hover:bg-gray-50 text-red-600">مسح التاريخ</button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 text-sm">
            <ArrowUpDown className="h-4 w-4" style={{ color: "#6b7280" }} />
            <span style={{ color: "#374151", fontWeight: 600 }}>ترتيب حسب:</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
              className="h-9 px-3 rounded-md text-sm"
              style={{ border: "1px solid #d1d5db", backgroundColor: "#fff" }}>
              <option value="date_desc">التاريخ — الأحدث أولاً</option>
              <option value="date_asc">التاريخ — الأقدم أولاً</option>
              <option value="qty_desc">الكمية — الأكبر</option>
              <option value="total_desc">الإجمالي — الأكبر</option>
              <option value="product">الصنف (أبجدي)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 border-b mb-3" style={{ borderColor: "#e5e7eb" }}>
          {TABS.map((tb) => (
            <button key={tb.key} onClick={() => setTab(tb.key)}
              className="px-3 py-2 text-sm flex items-center gap-2"
              style={{
                color: tab === tb.key ? "#2563eb" : "#374151",
                borderBottom: tab === tb.key ? "2px solid #2563eb" : "2px solid transparent",
                fontWeight: tab === tb.key ? 600 : 500,
              }}>
              ☰ {tb.label}
            </button>
          ))}
        </div>

        {tab === "detailed" && (
          <>
            <TableToolbar
              search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
              onExportCsv={() => exportToCsv("sales-detailed.csv", exportHeaders, exportRows)}
              onExportExcel={() => {
                const objects = exportRows.map((r) => Object.fromEntries(exportHeaders.map((h, i) => [h, r[i]])));
                exportSingleSheet("sales-detailed.xlsx", objects, "Sales");
              }}
              printRef={printRef} printTitle={t("sales.titles.detailed_report")}
              columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))}
            />
            <div className="overflow-x-auto rounded-md print-table-area" ref={printRef} style={{ border: "1px solid #d1d5db" }}>
              <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 800 }}>
                <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
                <tbody>
                  {pageRows.length === 0 ? <EmptyRow colSpan={visible.length} /> : pageRows.map((r, idx) => (
                    <tr
                      key={r.id}
                      ref={(el) => { rowRefs.current[idx] = el; }}
                      onClick={() => {
                        setSelectedRowIdx(idx);
                        if (r._invoice) setViewInvoice(r._invoice);
                      }}
                      style={{
                        cursor: "pointer",
                        backgroundColor: idx === selectedRowIdx ? "#dbeafe" : undefined,
                      }}
                    >
                      {visible.map((c) => <td key={c.key} style={cellStyle}>{cellFor(r, c.key)}</td>)}
                    </tr>
                  ))}
                </tbody>
                {pageRows.length > 0 && (
                  <tfoot>
                    <tr style={{ backgroundColor: "#f3f4f6" }}>
                      {visible.map((c) => {
                        if (c.key === "quantity") return <td key={c.key} style={{ ...cellStyle, fontWeight: 700 }}>{sumQty.toFixed(2)} {t("sales.report.unit")}</td>;
                        if (c.key === "discount") return <td key={c.key} style={{ ...cellStyle, fontWeight: 700 }}>{sumDiscount.toFixed(2)}</td>;
                        if (c.key === "total") return <td key={c.key} style={{ ...cellStyle, fontWeight: 700 }}>{sumTotal.toFixed(2)} ج.م</td>;
                        if (c.key === "product_name") return <td key={c.key} style={{ ...cellStyle, fontWeight: 700 }}>{t("sales.report.total_label")}</td>;
                        return <td key={c.key} style={cellStyle}></td>;
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <TableFooter from={from} to={to} total={totalRows} page={page} pageCount={pageCount}
              onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
          </>
        )}

        {tab === "with_purchase" && (
          <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #d1d5db" }}>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 800 }}>
              <thead><tr>
                <th style={headStyle}>صنف</th>
                <th style={headStyle}>SKU الباركود</th>
                <th style={headStyle}>اسم العميل</th>
                <th style={headStyle}>الفاتورة رقم.</th>
                <th style={headStyle}>تاريخ</th>
                <th style={headStyle}>اسم المورد</th>
                <th style={headStyle}>الكمية</th>
              </tr></thead>
              <tbody>
                {withPurchaseRows.length === 0 ? <EmptyRow colSpan={7} /> : withPurchaseRows.map((r) => (
                  <tr key={r.id}>
                    <td style={cellStyle}>{r.product_name}</td>
                    <td style={cellStyle}>{r.sku}</td>
                    <td style={cellStyle}>{r.customer}</td>
                    <td style={cellStyle}>
                      {r._invoice ? (
                        <button
                          type="button"
                          onClick={() => setViewInvoice(r._invoice)}
                          style={{ background: "transparent", border: "none", padding: 0, color: "#1d4ed8", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
                        >
                          {r.invoice_number}
                        </button>
                      ) : (
                        r.invoice_number
                      )}
                    </td>
                    <td style={cellStyle}>{fmtDateTime(r.issue_datetime)}</td>
                    <td style={cellStyle}>{r.supplier}</td>
                    <td style={cellStyle}>{r.product ? formatBaseQuantity(r.base_quantity, r.product) : r.quantity.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "summary" && (
          <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #d1d5db" }}>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 600 }}>
              <thead><tr>
                <th style={headStyle}>صنف</th>
                <th style={headStyle}>SKU الباركود</th>
                <th style={headStyle}>تاريخ</th>
                <th style={headStyle}>المخزون الحالي</th>
                <th style={headStyle}>مجموع الوحدات المباعة</th>
                <th style={headStyle}>المجموع</th>
              </tr></thead>
              <tbody>
                {summaryRows.length === 0 ? <EmptyRow colSpan={6} /> : summaryRows.map((r) => (
                  <tr key={r.id}>
                    <td style={cellStyle}>{r.product?.name || "—"}</td>
                    <td style={cellStyle}>{r.sku}</td>
                    <td style={cellStyle}>{r.issue_date}</td>
                    <td style={cellStyle}>{r.product ? formatBaseQuantity(r.stock_now, r.product) : "—"}</td>
                    <td style={cellStyle}>{r.product ? formatBaseQuantity(r.base_qty, r.product) : r.qty.toFixed(2)}</td>
                    <td style={cellStyle}>{fmt(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              {summaryRows.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: "#f3f4f6" }}>
                    <td colSpan={4} style={{ ...cellStyle, fontWeight: 700 }}>المجموع:</td>
                    <td style={{ ...cellStyle, fontWeight: 700 }}>{summaryRows.reduce((s, r) => s + r.qty, 0).toFixed(2)} وحدة</td>
                    <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(summaryRows.reduce((s, r) => s + r.total, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {tab === "by_category" && (
          <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #d1d5db" }}>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 500 }}>
              <thead><tr>
                <th style={headStyle}>اسم المجموعة</th>
                <th style={headStyle}>مجموع الوحدات المباعة</th>
                <th style={headStyle}>المجموع</th>
              </tr></thead>
              <tbody>
                {byCategoryRows.length === 0 ? <EmptyRow colSpan={3} /> : byCategoryRows.map((r) => (
                  <tr key={r.id}>
                    <td style={cellStyle}>{r.name}</td>
                    <td style={cellStyle}>{r.qty.toFixed(2)}</td>
                    <td style={cellStyle}>{fmt(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              {byCategoryRows.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: "#f3f4f6" }}>
                    <td style={{ ...cellStyle, fontWeight: 700 }}>المجموع:</td>
                    <td style={{ ...cellStyle, fontWeight: 700 }}>{byCategoryRows.reduce((s, r) => s + r.qty, 0).toFixed(2)}</td>
                    <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(byCategoryRows.reduce((s, r) => s + r.total, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {tab === "by_brand" && (
          <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #d1d5db" }}>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 500 }}>
              <thead><tr>
                <th style={headStyle}>الماركة</th>
                <th style={headStyle}>مجموع الوحدات المباعة</th>
                <th style={headStyle}>المجموع</th>
              </tr></thead>
              <tbody>
                {byBrandRows.length === 0 ? <EmptyRow colSpan={3} /> : byBrandRows.map((r) => (
                  <tr key={r.id}>
                    <td style={cellStyle}>{r.name}</td>
                    <td style={cellStyle}>{r.qty.toFixed(2)}</td>
                    <td style={cellStyle}>{fmt(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              {byBrandRows.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: "#f3f4f6" }}>
                    <td style={{ ...cellStyle, fontWeight: 700 }}>المجموع:</td>
                    <td style={{ ...cellStyle, fontWeight: 700 }}>{byBrandRows.reduce((s, r) => s + r.qty, 0).toFixed(2)}</td>
                    <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(byBrandRows.reduce((s, r) => s + r.total, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </DataCard>

      <InvoiceDetailsModal
        open={!!viewInvoice}
        onOpenChange={(v) => !v && setViewInvoice(null)}
        invoice={viewInvoice}
        customerName={viewInvoice ? custName(viewInvoice.customer_id) : ""}
        onPrint={viewInvoice ? onModalPrint(viewInvoice, () => setViewInvoice(null)) : () => {}}
      />
      {printNode}
    </div>
  );
}
