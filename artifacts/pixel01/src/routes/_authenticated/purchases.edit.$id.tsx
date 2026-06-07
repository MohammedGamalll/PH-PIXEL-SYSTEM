import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PurchaseForm, type PurchaseFormInitial } from "@/components/purchases/PurchaseForm";
import type { Row } from "@/components/purchases/PurchaseItemsTable";
import { unitOptions, toBase, type UnitLevel, type ProductUnitTree } from "@/lib/units";

export const Route = createFileRoute("/_authenticated/purchases/edit/$id")({
  component: EditPurchasePage,
});

function EditPurchasePage() {
  const { id } = useParams({ from: "/_authenticated/purchases/edit/$id" });
  const { data, isLoading } = useQuery({
    queryKey: ["purchase-edit", id],
    queryFn: async () => {
      const [{ data: p, error: e1 }, { data: items, error: e2 }] = await Promise.all([
        supabase.from("purchases").select("*").eq("id", id).maybeSingle(),
        supabase.from("purchase_items").select("*").eq("purchase_id", id),
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
      return { p, items: items ?? [], productsMap };
    },
  });

  if (isLoading || !data?.p) {
    return <div className="p-6 text-center text-sm" style={{ color: "#6b7280" }}>جاري التحميل...</div>;
  }
  const p: any = data.p;
  const rows: Row[] = (data.items as any[]).map((it) => {
    const prod = it.product_id ? data.productsMap.get(it.product_id) : null;
    const tree: ProductUnitTree = prod ? {
      main_unit: prod.main_unit, sub_unit_1: prod.sub_unit_1, sub_unit_1_ratio: prod.sub_unit_1_ratio,
      sub_unit_2: prod.sub_unit_2, sub_unit_2_ratio: prod.sub_unit_2_ratio,
    } : {};
    const choices = prod ? unitOptions(prod) : [];
    const fallbackName = it.unit_name || prod?.unit || "وحدة";
    const matched = choices.find((c) => c.name === it.unit_name);
    const unit_level: UnitLevel = (matched?.level as UnitLevel) ?? "main";
    const base_factor = matched?.ratio ?? 1;
    const unit_choices = choices.length ? choices : [{ level: unit_level, name: fallbackName, ratio: base_factor }];
    const quantity = Number(it.quantity) || 0;
    return {
      id: it.id,
      product_id: it.product_id ?? null,
      description: it.description ?? prod?.name ?? "",
      quantity,
      unit_price: Number(it.unit_price) || 0,
      discount_percent: Number(it.discount_percent) || 0,
      total: Number(it.total) || 0,
      sell_price: Number(it.sell_price) || 0,
      unit_level,
      unit_name: fallbackName,
      base_factor,
      base_quantity: it.base_quantity != null ? Number(it.base_quantity) : toBase(quantity, unit_level, tree),
      unit_choices,
      product_units: tree,
      has_expiry: !!it.expiry_date,
      expiry_date: it.expiry_date ?? "",
      main_unit_name: prod?.main_unit ?? null,
      current_stock_base: prod ? Number(prod.stock ?? 0) : undefined,
    } as Row;
  });

  const initial: PurchaseFormInitial = {
    supplier_id: p.supplier_id,
    ref_no: p.ref_no,
    purchase_date: p.purchase_date ? String(p.purchase_date).slice(0, 10) : null,
    status: p.status,
    pay_term_number: p.pay_term_number,
    pay_term_type: p.pay_term_type,
    warehouse_id: p.warehouse_id,
    paid_amount: Number(p.paid_amount) || 0,
    payment_method: p.payment_method,
    rows,
  };
  return <PurchaseForm editingId={id} initial={initial} />;
}
