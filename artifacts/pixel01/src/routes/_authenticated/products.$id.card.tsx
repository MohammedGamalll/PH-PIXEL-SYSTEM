import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { ReportTable, StatCard } from "@/components/reports/ReportTable";
import type { ColumnDef } from "@/components/products/TableToolbar";
import { formatBaseQuantity } from "@/lib/units";
import { useI18n } from "@/lib/i18n";
import { useProductBatches } from "@/hooks/use-product-batches";
import { BatchChips } from "@/components/products/BatchChips";
import { InvoiceDetailsModal } from "@/components/sales/InvoiceDetailsModal";
import { useInvoicePrint } from "@/hooks/use-invoice-print";
import { PurchaseDetailsModal } from "@/components/purchases/PurchaseDetailsModal";
import { ArrowRight, Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/products/$id/card")({
  component: ItemCardPage,
});

type Movement = {
  id: string;
  type: string;
  date: string;
  ref: string;
  refLink?: { to: string; params: Record<string, string> } | null;
  invoiceId?: string | null;
  purchaseId?: string | null;
  party: string;
  qty: number;
  qtyLabel: string;
  delta: number;
  expiry: string;
  _sort: string;
};

const EXPIRY_WARN_DAYS = 30;

function ItemCardPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { t, dir, lang } = useI18n();
  const locale = lang === "ar" ? "ar-EG" : "en-US";
  const fmtDate = (s?: string | null) =>
    s
      ? new Date(s).toLocaleString(locale, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
  const fmtDay = (s?: string | null) =>
    s
      ? new Date(s).toLocaleDateString(locale, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "";

  const { data: product } = useQuery({
    queryKey: ["product-card", id],
    enabled: !!user,
    queryFn: async () => {
      const { data: prod, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!prod) return null;
      let categoryName: string | null = null;
      let brandName: string | null = null;
      if ((prod as any).category_id) {
        const { data: c } = await (supabase.from("categories") as any)
          .select("name")
          .eq("id", (prod as any).category_id)
          .maybeSingle();
        categoryName = c?.name ?? null;
      }
      if ((prod as any).brand_id) {
        const { data: b } = await (supabase.from("brands") as any)
          .select("name")
          .eq("id", (prod as any).brand_id)
          .maybeSingle();
        brandName = b?.name ?? null;
      }
      let warranty: any = null;
      if ((prod as any).warranty_id) {
        const { data: w } = await (supabase.from("warranties") as any)
          .select("name,duration,duration_unit")
          .eq("id", (prod as any).warranty_id)
          .maybeSingle();
        warranty = w ?? null;
      }
      return { ...(prod as any), categoryName, brandName, warranty };
    },
  });

  const { data: bundle } = useQuery({
    queryKey: ["item-card-bundle", id],
    enabled: !!user,
    queryFn: async () => {
      const [
        pItems,
        iItems,
        dItems,
        purchases,
        invoices,
        damaged,
        contacts,
        suppliers,
        pReturns,
        prItems,
        btSrc,
        btTgt,
        srItems,
        srHeaders,
        excItems,
      ] = await Promise.all([
        (supabase.from("purchase_items") as any)
          .select(
            "id,purchase_id,quantity,base_quantity,unit_name,unit_price,total,expiry_date",
          )
          .eq("product_id", id),
        (supabase.from("invoice_items") as any)
          .select(
            "id,invoice_id,quantity,base_quantity,unit_name,unit_price,total,expiry_date",
          )
          .eq("product_id", id),
        (supabase.from("damaged_stock_items") as any)
          .select(
            "id,damaged_stock_id,quantity,base_quantity,unit_name,unit_price,total,expiry_date",
          )
          .eq("product_id", id),
        (supabase.from("purchases") as any).select(
          "id,purchase_number,ref_no,purchase_date,supplier_id,supplier_name_snapshot,notes,created_at,is_opening,created_by_name_snapshot",
        ),
        (supabase.from("invoices") as any).select(
          "id,invoice_number,issue_date,type,is_returned_from_id,customer_id,customer_name_snapshot,created_at,created_by_name_snapshot",
        ),

        (supabase.from("damaged_stock") as any).select(
          "id,ref_number,damage_date,damage_type,reason,created_at",
        ),
        (supabase.from("contacts") as any).select(
          "id,first_name,last_name,business_name",
        ),
        (supabase.from("suppliers") as any).select("id,name"),
        (supabase.from("purchase_returns") as any).select(
          "id,ref_no,return_date,purchase_id,total_amount,created_at",
        ),
        (supabase.from("purchase_return_items") as any)
          .select(
            "id,purchase_return_id,quantity,base_quantity,unit_name,unit_price,total",
          )
          .eq("product_id", id),
        (supabase.from("inventory_branch_transfer_items") as any)
          .select(
            "id,transfer_id,quantity,base_quantity,unit_name,inventory_branch_transfers!inner(id,transfer_date,created_at,target_name_snapshot,created_by_name_snapshot)",
          )
          .eq("source_product_id", id),
        (supabase.from("inventory_branch_transfer_items") as any)
          .select(
            "id,transfer_id,quantity,base_quantity,unit_name,inventory_branch_transfers!inner(id,transfer_date,created_at,target_name_snapshot,created_by_name_snapshot)",
          )
          .eq("target_product_id", id),
        (supabase.from("standalone_return_items") as any)
          .select(
            "id,standalone_return_id,quantity,base_quantity,unit_price,total,expiry_date",
          )
          .eq("product_id", id),
        (supabase.from("standalone_returns") as any).select(
          "id,reference_no,return_type,return_date,reason,created_at,created_by_name_snapshot",
        ),
        (supabase.from as any)("item_exchange_items")
          .select(
            "id,exchange_id,direction,quantity,base_quantity,unit_price,total,expiry_date,item_exchanges!inner(id,reference,exchange_date,notes,created_at)",
          )
          .eq("product_id", id),
      ]);
      for (const r of [
        pItems,
        iItems,
        dItems,
        purchases,
        invoices,
        damaged,
        pReturns,
      ]) {
        if (r.error) throw r.error;
      }
      return {
        pItems: pItems.data ?? [],
        iItems: iItems.data ?? [],
        dItems: dItems.data ?? [],
        purchases: purchases.data ?? [],
        invoices: invoices.data ?? [],
        damaged: damaged.data ?? [],
        contacts: contacts.data ?? [],
        suppliers: suppliers.data ?? [],
        pReturns: pReturns.data ?? [],
        prItems: prItems.data ?? [],
        btSrc: btSrc.data ?? [],
        btTgt: btTgt.data ?? [],
        srItems: srItems.data ?? [],
        srHeaders: srHeaders.data ?? [],
        excItems: excItems.data ?? [],
      };
    },
  });

  const expiryCell = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round(
      (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    const label = fmtDay(iso);
    if (diffDays < 0) return `⛔ ${label} (${t("products.card.expired")})`;
    if (diffDays <= EXPIRY_WARN_DAYS)
      return `⚠️ ${label} (${t("products.card.expiry_warn")})`;
    return label;
  };

  const { rows, stats } = useMemo(() => {
    const emptyStats = {
      purchased: 0,
      sold: 0,
      salesReturn: 0,
      purchaseReturnCount: 0,
      purchaseReturnQty: 0,
      damaged: 0,
      current: 0,
    };
    if (!bundle || !product)
      return { rows: [] as Movement[], stats: emptyStats };

    const purchMap = new Map<string, any>(
      bundle.purchases.map((p: any) => [p.id, p]),
    );
    const invMap = new Map<string, any>(
      bundle.invoices.map((i: any) => [i.id, i]),
    );
    const dmgMap = new Map<string, any>(
      bundle.damaged.map((d: any) => [d.id, d]),
    );
    const partyMap = new Map<string, string>();
    for (const c of bundle.contacts as any[]) {
      partyMap.set(
        c.id,
        c.business_name ||
          [c.first_name, c.last_name].filter(Boolean).join(" "),
      );
    }
    const supMap = new Map<string, string>();
    for (const s of bundle.suppliers as any[]) supMap.set(s.id, s.name);

    // Build set of purchase_ids that contained this product (for purchase-return matching)
    const productPurchaseIds = new Set<string>();
    for (const it of bundle.pItems as any[])
      productPurchaseIds.add(it.purchase_id);

    const out: Movement[] = [];
    let purchased = 0,
      sold = 0,
      salesReturn = 0,
      purchaseReturnCount = 0,
      purchaseReturnQty = 0,
      damaged = 0;

    const adjLabel = lang === "ar" ? "تسوية جرد" : "Stock adjustment";

    for (const it of bundle.pItems as any[]) {
      const p = purchMap.get(it.purchase_id);
      if (!p) continue;
      const baseQty = Number(it.base_quantity ?? it.quantity ?? 0);
      const pn = String(p.purchase_number || "");
      const isAdjustment = pn.startsWith("ADJ+") || pn.startsWith("ADJB");
      const isOpening = !isAdjustment && (pn.startsWith("OS") || p.is_opening);
      purchased += baseQty;
      out.push({
        id: `p-${it.id}`,
        type: isAdjustment
          ? adjLabel
          : isOpening
            ? t("products.card.opening")
            : t("products.card.purchase"),
        date: fmtDate(p.created_at ?? p.purchase_date),
        ref: p.purchase_number || p.ref_no || "",
        purchaseId: isAdjustment || isOpening ? null : p.id,
        party:
          p.supplier_name_snapshot ||
          (p.supplier_id
            ? supMap.get(p.supplier_id) || partyMap.get(p.supplier_id) || ""
            : "") ||
          "بدون مورد",
        qty: baseQty,
        qtyLabel: `${it.quantity} ${it.unit_name || ""}`.trim(),
        delta: baseQty,
        expiry: expiryCell(it.expiry_date),
        _sort: p.created_at ?? p.purchase_date ?? "",
      });
    }

    for (const it of bundle.iItems as any[]) {
      const inv = invMap.get(it.invoice_id);
      if (!inv) continue;
      const baseQty = Math.abs(Number(it.base_quantity ?? it.quantity ?? 0));
      const isReturn = inv.type === "sale_return" || !!inv.is_returned_from_id;
      if (isReturn) salesReturn += baseQty;
      else sold += baseQty;
      out.push({
        id: `i-${it.id}`,
        type: isReturn
          ? t("products.card.sale_return")
          : t("products.card.sale"),
        date: fmtDate(inv.created_at ?? inv.issue_date),
        ref: inv.invoice_number || "",
        invoiceId: inv.id,
        party:
          inv.customer_name_snapshot ||
          (inv.customer_id ? partyMap.get(inv.customer_id) || "" : "") ||
          "نقدي",
        qty: baseQty,
        qtyLabel:
          `${Math.abs(Number(it.quantity ?? 0))} ${it.unit_name || ""}`.trim(),
        delta: isReturn ? baseQty : -baseQty,
        expiry: expiryCell(it.expiry_date),
        _sort: inv.created_at ?? inv.issue_date ?? "",
      });
    }

    for (const it of bundle.dItems as any[]) {
      const d = dmgMap.get(it.damaged_stock_id);
      const baseQty = Number(it.base_quantity ?? it.quantity ?? 0);
      damaged += baseQty;
      const isAdjustment =
        d?.damage_type === "stock_adjustment" ||
        String(d?.ref_number || "").startsWith("ADJ-");
      out.push({
        id: `d-${it.id}`,
        type: isAdjustment ? adjLabel : t("products.card.damaged"),
        date: fmtDate(d?.created_at ?? d?.damage_date),
        ref: d?.ref_number || "",
        party: d?.reason || d?.created_by_name_snapshot || "تسوية مخزون",
        qty: baseQty,
        qtyLabel: `${Number(it.quantity ?? 0)} ${it.unit_name || ""}`.trim(),
        delta: -baseQty,
        expiry: expiryCell(it.expiry_date),
        _sort: d?.created_at ?? d?.damage_date ?? "",
      });
    }

    // Purchase returns: resolve the header from the separately-fetched
    // purchase_returns list (no PostgREST embed, which would fail without a FK).
    const prHdrMap = new Map<string, any>(
      ((bundle as any).pReturns || []).map((h: any) => [h.id, h]),
    );
    for (const it of (bundle as any).prItems as any[]) {
      const h = prHdrMap.get(it.purchase_return_id) ?? {};
      const baseQty = Number(it.base_quantity ?? it.quantity ?? 0);
      const p = h.purchase_id ? purchMap.get(h.purchase_id) : null;
      purchaseReturnCount += 1;
      purchaseReturnQty += baseQty;
      out.push({
        id: `pr-${it.id}`,
        type: t("products.card.purchase_return"),
        date: fmtDate(h.created_at ?? h.return_date),
        ref: h.ref_no || "",
        purchaseId: h.purchase_id || null,
        party:
          p?.supplier_name_snapshot ||
          (p?.supplier_id
            ? supMap.get(p.supplier_id) || partyMap.get(p.supplier_id) || ""
            : "") ||
          "بدون مورد",
        qty: baseQty,
        qtyLabel: `${Number(it.quantity ?? 0)} ${it.unit_name || ""}`.trim(),
        delta: -baseQty,
        expiry: "—",
        _sort: h.created_at ?? h.return_date ?? "",
      });
    }

    // Standalone (free) returns
    const srHdrMap = new Map<string, any>(
      ((bundle as any).srHeaders || []).map((h: any) => [h.id, h]),
    );
    let standaloneSalesRet = 0,
      standalonePurchRet = 0;
    for (const it of ((bundle as any).srItems || []) as any[]) {
      const h = srHdrMap.get(it.standalone_return_id);
      if (!h) continue;
      // Use the persisted base_quantity so the selected unit is honoured.
      const baseQty = Math.abs(Number(it.base_quantity ?? it.quantity ?? 0));
      const isSales = h.return_type === "sales";
      if (isSales) standaloneSalesRet += baseQty;
      else standalonePurchRet += baseQty;
      out.push({
        id: `sr-${it.id}`,
        type: isSales
          ? `${t("products.card.sale_return")} (حر)`
          : `${t("products.card.purchase_return")} (حر)`,
        date: fmtDate(h.created_at ?? h.return_date),
        ref: h.reference_no || "",
        party: h.reason || h.created_by_name_snapshot || "مرتجع حر",
        qty: baseQty,
        qtyLabel: formatBaseQuantity(baseQty, product as any),
        delta: isSales ? +baseQty : -baseQty,
        expiry: expiryCell(it.expiry_date),
        _sort: h.created_at ?? h.return_date ?? "",
      });
    }

    // Branch transfers — outgoing (this product is source)
    let transferOut = 0,
      transferIn = 0;
    for (const it of (bundle as any).btSrc as any[]) {
      const baseQty = Number(it.base_quantity ?? it.quantity ?? 0);
      transferOut += baseQty;
      const h = it.inventory_branch_transfers ?? {};
      out.push({
        id: `bt-out-${it.id}`,
        type: lang === "ar" ? "تحويل صادر" : "Transfer out",
        date: fmtDate(h.created_at ?? h.transfer_date),
        ref: "",
        party:
          h.target_name_snapshot ||
          (lang === "ar" ? "فرع آخر" : "Other branch"),
        qty: baseQty,
        qtyLabel: `${Number(it.quantity ?? 0)} ${it.unit_name || ""}`.trim(),
        delta: -baseQty,
        expiry: "—",
        _sort: h.created_at ?? h.transfer_date ?? "",
      });
    }
    // Branch transfers — incoming (this product is target)
    for (const it of (bundle as any).btTgt as any[]) {
      const baseQty = Number(it.base_quantity ?? it.quantity ?? 0);
      transferIn += baseQty;
      const h = it.inventory_branch_transfers ?? {};
      out.push({
        id: `bt-in-${it.id}`,
        type: lang === "ar" ? "تحويل وارد" : "Transfer in",
        date: fmtDate(h.created_at ?? h.transfer_date),
        ref: "",
        party:
          h.created_by_name_snapshot ||
          (lang === "ar" ? "فرع آخر" : "Other branch"),
        qty: baseQty,
        qtyLabel: `${Number(it.quantity ?? 0)} ${it.unit_name || ""}`.trim(),
        delta: +baseQty,
        expiry: "—",
        _sort: h.created_at ?? h.transfer_date ?? "",
      });
    }

    // Item exchanges — incoming raises stock, outgoing lowers it.
    let exchangeIn = 0,
      exchangeOut = 0;
    for (const it of ((bundle as any).excItems || []) as any[]) {
      const h = it.item_exchanges ?? {};
      const baseQty = Number(it.base_quantity ?? it.quantity ?? 0);
      const isIncoming = it.direction === "incoming";
      if (isIncoming) exchangeIn += baseQty;
      else exchangeOut += baseQty;
      out.push({
        id: `exc-${it.id}`,
        type: isIncoming
          ? lang === "ar" ? "تبادل وارد" : "Exchange in"
          : lang === "ar" ? "تبادل صادر" : "Exchange out",
        date: fmtDate(h.created_at ?? h.exchange_date),
        ref: h.reference || "",
        party: h.notes || (lang === "ar" ? "تبادل أصناف" : "Item exchange"),
        qty: baseQty,
        qtyLabel: formatBaseQuantity(baseQty, product as any),
        delta: isIncoming ? +baseQty : -baseQty,
        expiry: expiryCell(it.expiry_date),
        _sort: h.created_at ?? h.exchange_date ?? "",
      });
    }
    void exchangeIn;
    void exchangeOut;
    void productPurchaseIds;

    const typeRank: Record<string, number> = {
      [t("products.card.opening")]: 0,
      [t("products.card.purchase")]: 1,
      [t("products.card.sale_return")]: 2,
      [t("products.card.purchase_return")]: 3,
      [t("products.card.sale")]: 4,
      [t("products.card.damaged")]: 5,
    };
    out.sort((a, b) => {
      const d = b._sort.localeCompare(a._sort);
      if (d !== 0) return d;
      return (typeRank[a.type] ?? 9) - (typeRank[b.type] ?? 9);
    });

    // Single source of truth: actual stock from the products table.
    const actualStock = Number((product as any).stock ?? 0);
    // Suppress unused-var warning for transfer counters (kept for future use).
    void transferIn;
    void transferOut;

    return {
      rows: out,
      stats: {
        purchased,
        sold: sold + standalonePurchRet,
        salesReturn: salesReturn + standaloneSalesRet,
        purchaseReturnCount,
        purchaseReturnQty,
        damaged,
        current: actualStock,
      },
    };
  }, [bundle, product, t, lang]);

  const fmtBase = (n: number) =>
    product ? formatBaseQuantity(n, product) : `${n}`;

  const cols: ColumnDef[] = [
    { key: "type", label: t("products.card.movement_type"), visible: true },
    { key: "date", label: t("products.card.date"), visible: true },
    { key: "qtyLabel", label: t("products.card.quantity"), visible: true },
    { key: "delta", label: t("products.card.change"), visible: true },
    { key: "expiry", label: t("products.card.expiry"), visible: true },
    { key: "ref", label: t("products.card.reference"), visible: true },
    { key: "party", label: t("products.card.party"), visible: true },
  ];

  const subUnits = product
    ? [
        product.sub_unit_1
          ? `${product.sub_unit_1}${product.sub_unit_1_ratio ? ` (×${product.sub_unit_1_ratio})` : ""}`
          : null,
        product.sub_unit_2
          ? `${product.sub_unit_2}${product.sub_unit_2_ratio ? ` (×${product.sub_unit_2_ratio})` : ""}`
          : null,
      ]
        .filter(Boolean)
        .join(" / ")
    : "";

  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const { data: openInvoice } = useQuery({
    queryKey: ["product-card-invoice", openInvoiceId],
    enabled: !!openInvoiceId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("invoices") as any)
        .select("*")
        .eq("id", openInvoiceId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: openInvoiceCustomer } = useQuery({
    queryKey: ["product-card-invoice-customer", openInvoice?.customer_id],
    enabled: !!openInvoice?.customer_id,
    queryFn: async () => {
      const { data } = await (supabase.from("contacts") as any)
        .select("first_name,last_name,business_name,phone,address")
        .eq("id", openInvoice.customer_id)
        .maybeSingle();
      return data;
    },
  });
  const openCustomerName = openInvoice
    ? openInvoice.customer_name_snapshot ||
      [openInvoiceCustomer?.first_name, openInvoiceCustomer?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      openInvoiceCustomer?.business_name ||
      "نقدي"
    : "";

  const { onModalPrint, printNode } = useInvoicePrint({
    customerName: () => openCustomerName,
    customerPhone: () => openInvoiceCustomer?.phone ?? "",
    customerAddress: () => openInvoiceCustomer?.address ?? "",
  });

  const [openPurchaseId, setOpenPurchaseId] = useState<string | null>(null);
  const { data: openPurchase } = useQuery({
    queryKey: ["product-card-purchase", openPurchaseId],
    enabled: !!openPurchaseId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("purchases") as any)
        .select("*")
        .eq("id", openPurchaseId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: openPurchaseSupplier } = useQuery({
    queryKey: ["product-card-purchase-supplier", openPurchase?.supplier_id],
    enabled: !!openPurchase?.supplier_id,
    queryFn: async () => {
      const { data } = await (supabase.from("suppliers") as any)
        .select("name")
        .eq("id", openPurchase.supplier_id)
        .maybeSingle();
      return data;
    },
  });
  const openSupplierName = openPurchase
    ? openPurchase.supplier_name_snapshot ||
      openPurchaseSupplier?.name ||
      "بدون مورد"
    : "";

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader
        title={t("products.card.title")}
        subtitle={
          product
            ? `${product.name}${product.sku ? ` — ${product.sku}` : ""}`
            : ""
        }
        actions={
          <Link
            to="/products"
            className="h-9 px-4 rounded-md text-sm flex items-center gap-2"
            style={{
              border: "1px solid #d1d5db",
              backgroundColor: "#ffffff",
              color: "#374151",
            }}
          >
            <ArrowRight className="h-4 w-4" /> {t("products.card.back")}
          </Link>
        }
      />

      {/* Product overview */}
      {product && (
        <DataCard>
          <div className="flex flex-col md:flex-row gap-4">
            <div
              className="flex-shrink-0 flex items-center justify-center w-28 h-28 rounded-md overflow-hidden"
              style={{
                backgroundColor: "#f3f4f6",
                border: "1px solid #e5e7eb",
              }}
            >
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="h-10 w-10" style={{ color: "#9ca3af" }} />
              )}
            </div>
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
              <Info
                label={t("products.card.category")}
                value={(product as any).categoryName || "—"}
              />
              <Info
                label={t("products.card.brand")}
                value={(product as any).brandName || "—"}
              />
              <Info label="SKU" value={product.sku || "—"} />
              <Info
                label={t("products.card.low_threshold")}
                value={String(product.low_stock_threshold ?? 0)}
              />
              <Info
                label={t("products.card.unit_main")}
                value={product.main_unit || product.unit || "—"}
              />
              <Info
                label={t("products.card.units_sub")}
                value={subUnits || "—"}
              />
              <Info
                label={t("products.card.price_now")}
                value={String(product.price ?? 0)}
              />
              <Info
                label={t("products.card.cost_now")}
                value={String(product.cost ?? 0)}
              />
              <Info
                label={t("products.card.has_expiry")}
                value={
                  product.has_expiry
                    ? t("products.card.yes")
                    : t("products.card.no")
                }
              />
              <Info
                label="الضمان"
                value={
                  product.warranty
                    ? `${product.warranty.name} — ${product.warranty.duration} ${
                        { day: "يوم", month: "شهر", year: "سنة" }[
                          product.warranty.duration_unit as string
                        ] || product.warranty.duration_unit
                      }`
                    : "لا يوجد ضمان"
                }
              />
            </div>
          </div>
        </DataCard>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label={t("products.card.total_purchased")}
          value={fmtBase(stats.purchased)}
          accent="#10b981"
        />
        <StatCard
          label={t("products.card.total_sold")}
          value={fmtBase(stats.sold)}
          accent="#3b82f6"
        />
        <StatCard
          label={t("products.card.returned_in")}
          value={fmtBase(stats.salesReturn)}
          accent="#f59e0b"
        />
        <StatCard
          label={t("products.card.returned_out")}
          value={fmtBase(stats.purchaseReturnQty)}
          accent="#f59e0b"
        />
        <StatCard
          label={t("products.card.damaged_total")}
          value={fmtBase(stats.damaged)}
          accent="#ef4444"
        />
      </div>
      {product &&
        (() => {
          const threshold = Number(product.low_stock_threshold ?? 10);
          const current = Number(stats.current ?? 0);
          const isOut = current <= 0;
          const isLow = !isOut && current <= threshold;
          const bg = isOut ? "#fee2e2" : isLow ? "#fef3c7" : "#ecfdf5";
          const fg = isOut ? "#991b1b" : isLow ? "#92400e" : "#065f46";
          const accent = isOut ? "#ef4444" : isLow ? "#f59e0b" : "#0ea5e9";
          const label = isOut
            ? "⛔ نفذ المخزون"
            : isLow
              ? `⚠️ المخزون منخفض (حد التنبيه: ${threshold})`
              : `المخزون متوفر (حد التنبيه: ${threshold})`;
          return (
            <div className="grid grid-cols-1 gap-3">
              <div
                className="rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap"
                style={{
                  backgroundColor: "#ffffff",
                  borderRight: `4px solid ${accent}`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
              >
                <div className="flex flex-col gap-1">
                  <div className="text-xs" style={{ color: "#6b7280" }}>
                    {t("products.card.current_stock")}
                  </div>
                  <div
                    className="text-xl font-bold"
                    style={{ color: "#111827" }}
                  >
                    {fmtBase(stats.current)}
                  </div>
                </div>
                <span
                  className="px-3 py-1.5 rounded-md text-xs font-semibold"
                  style={{ backgroundColor: bg, color: fg }}
                >
                  {label}
                </span>
              </div>
            </div>
          );
        })()}

      {product && <BatchChips productId={id} product={product} />}
      {/* {product && <WarehouseStockCard productId={id} product={product} />}
      {product && <ExpiryBatchesCard productId={id} product={product} />} */}

      <DataCard>
        <ReportTable
          rows={rows}
          initialCols={cols}
          rowKey={(r) => r.id}
          searchFields={(r) => `${r.type} ${r.ref} ${r.party}`}
          cellFor={(r, k) => {
            const v = (r as any)[k];
            if (k === "delta") {
              const n = Number(v) || 0;
              if (n === 0) return "—";
              const sign = n > 0 ? "+" : "-";
              return `${sign}${fmtBase(Math.abs(n))}`;
            }
            if (k === "ref" && r.ref && r.invoiceId) {
              return (
                <button
                  type="button"
                  onClick={() => setOpenInvoiceId(r.invoiceId!)}
                  style={{
                    color: "#2563eb",
                    textDecoration: "underline",
                    fontWeight: 600,
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  {r.ref}
                </button>
              );
            }
            if (k === "ref" && r.ref && r.purchaseId) {
              return (
                <button
                  type="button"
                  onClick={() => setOpenPurchaseId(r.purchaseId!)}
                  style={{
                    color: "#2563eb",
                    textDecoration: "underline",
                    fontWeight: 600,
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  {r.ref}
                </button>
              );
            }
            if (k === "ref" && r.refLink && r.ref) {
              return (
                <Link
                  to={r.refLink.to}
                  params={r.refLink.params as any}
                  style={{
                    color: "#2563eb",
                    textDecoration: "underline",
                    fontWeight: 600,
                  }}
                >
                  {r.ref}
                </Link>
              );
            }
            return v ?? "";
          }}
          numericKeys={["delta", "qty"]}
          exportName={`item-card-${product?.sku || id}`}
          printTitle={t("products.card.title")}
        />
      </DataCard>
      <InvoiceDetailsModal
        open={!!openInvoiceId}
        onOpenChange={(v) => !v && setOpenInvoiceId(null)}
        invoice={openInvoice ?? null}
        customerName={openCustomerName}
        customerPhone={openInvoiceCustomer?.phone ?? ""}
        customerAddress={openInvoiceCustomer?.address ?? ""}
        onPrint={openInvoice ? onModalPrint(openInvoice, () => setOpenInvoiceId(null)) : () => {}}
      />
      {printNode}
      <PurchaseDetailsModal
        open={!!openPurchaseId}
        onOpenChange={(v) => !v && setOpenPurchaseId(null)}
        purchase={openPurchase ?? null}
        supplierName={openSupplierName}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs mb-0.5" style={{ color: "#6b7280" }}>
        {label}
      </div>
      <div className="font-medium" style={{ color: "#111827" }}>
        {value}
      </div>
    </div>
  );
}

// function WarehouseStockCard({ productId, product }: { productId: string; product: any }) {
//   const { user } = useAuth();
//   const { data: warehouses = [] } = useQuery({
//     queryKey: ["warehouses-all"],
//     enabled: !!user,
//     queryFn: async () => {
//       const { data, error } = await (supabase as any)
//         .from("warehouses")
//         .select("id, name, is_default")
//         .order("is_default", { ascending: false })
//         .order("name");
//       if (error) throw error;
//       return data ?? [];
//     },
//   });
//   const { data: stockRows = [] } = useQuery({
//     queryKey: ["product-warehouse-stock", productId],
//     enabled: !!user,
//     queryFn: async () => {
//       const { data, error } = await (supabase as any)
//         .from("product_warehouse_stock")
//         .select("warehouse_id, stock")
//         .eq("product_id", productId);
//       if (error) throw error;
//       return data ?? [];
//     },
//   });
//   const stockByWh = new Map<string, number>();
//   for (const r of stockRows as any[]) stockByWh.set(r.warehouse_id, Number(r.stock ?? 0));
//   const total = (warehouses as any[]).reduce((s, w) => s + (stockByWh.get(w.id) ?? 0), 0);
//   if (!warehouses.length) return null;
//   // TEMP: system locked to a single warehouse — show only the aggregate stock.
//   return (
//     <DataCard>
//       <div className="text-sm font-semibold mb-2" style={{ color: "#111827" }}>المخزون</div>
//       <div className="rounded-md px-3 py-3" style={{ border: "1px solid #e5e7eb", background: "#f9fafb" }}>
//         <div className="flex items-center justify-between">
//           <span className="text-sm" style={{ color: "#374151" }}>الكمية المتاحة</span>
//           <span className="text-base" style={{ fontWeight: 800, color: "#111827" }}>
//             {formatBaseQuantity(total, product)}
//           </span>
//         </div>
//       </div>
//     </DataCard>
//   );
// }

// function ExpiryBatchesCard({ productId, product }: { productId: string; product: any }) {
//   const { data: batches = [], isLoading } = useProductBatches(productId, { includeEmpty: true, includePast: true });
//   const today = new Date().toISOString().slice(0, 10);
//   if (!isLoading && batches.length === 0) return null;
//   return (
//     <DataCard>
//       <div className="text-sm font-semibold mb-2" style={{ color: "#111827" }}>دُفعات تاريخ الصلاحية</div>
//       {isLoading ? (
//         <div className="text-sm" style={{ color: "#6b7280" }}>جاري التحميل...</div>
//       ) : batches.length === 0 ? (
//         <div className="text-sm" style={{ color: "#6b7280" }}>لا توجد دُفعات مسجّلة.</div>
//       ) : (
//         <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #e5e7eb" }}>
//           <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
//             <thead>
//               <tr style={{ background: "#f3f4f6" }}>
//                 <th className="text-start px-2 py-1.5" style={{ borderBottom: "1px solid #e5e7eb" }}>تاريخ الصلاحية</th>
//                 <th className="text-start px-2 py-1.5" style={{ borderBottom: "1px solid #e5e7eb" }}>المُشترَى</th>
//                 <th className="text-start px-2 py-1.5" style={{ borderBottom: "1px solid #e5e7eb" }}>المُباع</th>
//                 <th className="text-start px-2 py-1.5" style={{ borderBottom: "1px solid #e5e7eb" }}>المتبقي</th>
//                 <th className="text-start px-2 py-1.5" style={{ borderBottom: "1px solid #e5e7eb" }}>الحالة</th>
//               </tr>
//             </thead>
//             <tbody>
//               {batches.map((b) => {
//                 const noExpiry = !b.expiry_date;
//                 const expired = !noExpiry && b.expiry_date < today;
//                 const remainingOut = b.remaining <= 0;
//                 const bg = expired ? "#fee2e2" : remainingOut ? "#f3f4f6" : undefined;
//                 return (
//                   <tr key={b.expiry_date || "__no_expiry__"} style={{ background: bg, borderTop: "1px solid #e5e7eb" }}>
//                     <td className="px-2 py-1.5" style={{ color: noExpiry ? "#6b7280" : undefined, fontStyle: noExpiry ? "italic" : undefined }}>
//                       {noExpiry ? "بدون تاريخ صلاحية" : b.expiry_date}
//                     </td>
//                     <td className="px-2 py-1.5">{formatBaseQuantity(b.purchased, product)}</td>
//                     <td className="px-2 py-1.5">{formatBaseQuantity(b.sold, product)}</td>
//                     <td className="px-2 py-1.5" style={{ fontWeight: 700 }}>{formatBaseQuantity(Math.max(0, b.remaining), product)}</td>
//                     <td className="px-2 py-1.5" style={{ color: expired ? "#dc2626" : remainingOut ? "#6b7280" : "#16a34a" }}>
//                       {expired ? "منتهية" : remainingOut ? "نفدت" : "متاحة"}
//                     </td>
//                   </tr>
//                 );
//               })}
//             </tbody>
//           </table>
//         </div>
//       )}
//     </DataCard>
//   );
// }
