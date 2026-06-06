import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { InvoiceForm, type InvoiceFormInitial } from "@/components/sales/InvoiceForm";
import type { SaleRow } from "@/components/sales/SalesItemsTable";
import { useI18n } from "@/lib/i18n";
import { unitOptions, toBase, type UnitLevel, type ProductUnitTree } from "@/lib/units";

export const Route = createFileRoute("/_authenticated/sales/edit/$id")({
  component: EditSalesInvoicePage,
});

function EditSalesInvoicePage() {
  const { dir } = useI18n();
  const { id } = useParams({ from: "/_authenticated/sales/edit/$id" });

  const { data, isLoading } = useQuery({
    queryKey: ["invoice-edit", id],
    queryFn: async () => {
      const [{ data: inv, error: e1 }, { data: items, error: e2 }] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", id).maybeSingle(),
        supabase.from("invoice_items").select("*").eq("invoice_id", id),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const productIds = Array.from(new Set((items ?? []).map((it: any) => it.product_id).filter(Boolean)));
      let productsMap = new Map<string, any>();
      if (productIds.length) {
        const { data: prods, error: e3 } = await supabase.from("products").select("*").in("id", productIds as string[]);
        if (e3) throw e3;
        productsMap = new Map((prods ?? []).map((p: any) => [p.id, p]));
      }
      return { inv, items: items ?? [], productsMap };
    },
  });

  if (isLoading || !data?.inv) {
    return <div className="p-6 text-center text-sm" style={{ color: "#6b7280" }} dir={dir}>جاري التحميل...</div>;
  }

  const inv: any = data.inv;
  const rows: SaleRow[] = (data.items as any[]).map((it) => {
    const p = it.product_id ? data.productsMap.get(it.product_id) : null;
    const tree: ProductUnitTree = p ? {
      main_unit: p.main_unit, sub_unit_1: p.sub_unit_1, sub_unit_1_ratio: p.sub_unit_1_ratio,
      sub_unit_2: p.sub_unit_2, sub_unit_2_ratio: p.sub_unit_2_ratio,
    } : {};
    const choices = p ? unitOptions(p) : [];
    const fallbackName = it.unit_name || p?.unit || "وحدة";
    const matched = choices.find((c) => c.name === it.unit_name);
    const unit_level: UnitLevel = (matched?.level as UnitLevel) ?? "main";
    const base_factor = matched?.ratio ?? 1;
    const unit_choices = choices.length ? choices : [{ level: unit_level, name: fallbackName, ratio: base_factor }];
    const quantity = Number(it.quantity) || 0;
    const unit_price = Number(it.unit_price) || 0;
    const base_price = base_factor ? unit_price / base_factor : unit_price;
    return {
      product_id: it.product_id ?? null,
      description: it.description ?? p?.name ?? "",
      quantity,
      unit_price,
      base_price,
      discount_amount: Number(it.discount_amount) || 0,
      total: Number(it.total) || 0,
      unit_level,
      unit_name: fallbackName,
      base_factor,
      base_quantity: it.base_quantity != null ? Number(it.base_quantity) : toBase(quantity, unit_level, tree),
      unit_choices,
      product_units: tree,
      expiry_date: it.expiry_date ?? null,
      main_unit_name: p?.main_unit ?? null,
    } as SaleRow;
  });

  const initial: InvoiceFormInitial = {
    customer_id: inv.customer_id,
    sales_rep_id: inv.sales_rep_id,
    issue_date: inv.issue_date ? String(inv.issue_date).slice(0, 10) : null,
    notes: inv.notes,
    warehouse_id: inv.warehouse_id,
    discount: Number(inv.discount) || 0,
    shipping_cost: Number(inv.shipping_cost) || 0,
    shipping_status: inv.shipping_status,
    payment_method: inv.payment_method,
    paid_amount: Number(inv.paid_amount) || 0,
    rows,
  };

  return <InvoiceForm mode={(inv.type as any) || "sale"} editingId={id} initial={initial} />;
}
