import { supabase } from "@/integrations/supabase/client";
import { toMainUnits } from "@/lib/units";

export type ExpiringBatchRow = {
  id: string;
  product_id: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  expiry: string;
  cost: number;
  price: number;
  main_unit?: string | null;
  sub_unit_1?: string | null;
  sub_unit_1_ratio?: number | null;
  sub_unit_2?: string | null;
  sub_unit_2_ratio?: number | null;
};

/** Aggregate remaining qty per (product, expiry) from movement tables. */
export async function fetchExpiringBatches(): Promise<ExpiringBatchRow[]> {
  const [pi, ii, di, sri, prods] = await Promise.all([
    (supabase.from("purchase_items") as any)
      .select("product_id, expiry_date, quantity, base_quantity")
      .not("expiry_date", "is", null)
      .not("product_id", "is", null),
    (supabase.from("invoice_items") as any)
      .select("product_id, expiry_date, quantity, base_quantity, invoices!inner(type)")
      .not("expiry_date", "is", null)
      .not("product_id", "is", null),
    (supabase.from("damaged_stock_items") as any)
      .select("product_id, expiry_date, quantity, base_quantity")
      .not("expiry_date", "is", null)
      .not("product_id", "is", null),
    (supabase.from("standalone_return_items") as any)
      .select("product_id, expiry_date, quantity, standalone_return:standalone_returns!inner(return_type)")
      .not("expiry_date", "is", null)
      .not("product_id", "is", null),
    supabase.from("products").select(
      "id,name,sku,main_unit,unit,cost,price,sub_unit_1,sub_unit_1_ratio,sub_unit_2,sub_unit_2_ratio",
    ),
  ]);
  if (pi.error) throw pi.error;
  if (ii.error) throw ii.error;
  if (di.error) throw di.error;
  if (sri.error) throw sri.error;
  if (prods.error) throw prods.error;

  const prodMap = new Map<string, any>();
  for (const p of (prods.data as any[]) ?? []) prodMap.set(p.id, p);

  const map = new Map<string, { product_id: string; expiry: string; qty: number }>();
  const ensure = (pid: string, exp: string) => {
    const k = `${pid}|${exp}`;
    if (!map.has(k)) map.set(k, { product_id: pid, expiry: exp, qty: 0 });
    return map.get(k)!;
  };

  for (const r of (pi.data as any[]) ?? []) {
    ensure(r.product_id, r.expiry_date).qty += Number(r.base_quantity ?? r.quantity ?? 0);
  }
  for (const r of (ii.data as any[]) ?? []) {
    const q = Math.abs(Number(r.base_quantity ?? r.quantity ?? 0));
    const isReturn = r.invoices?.type === "sale_return";
    ensure(r.product_id, r.expiry_date).qty += isReturn ? q : -q;
  }
  for (const r of (di.data as any[]) ?? []) {
    ensure(r.product_id, r.expiry_date).qty -= Number(r.base_quantity ?? r.quantity ?? 0);
  }
  for (const r of (sri.data as any[]) ?? []) {
    const q = Number(r.quantity ?? 0);
    if (!q) continue;
    const rt = r.standalone_return?.return_type;
    if (rt === "sales") ensure(r.product_id, r.expiry_date).qty += q;
    else if (rt === "purchase") ensure(r.product_id, r.expiry_date).qty -= q;
  }

  return Array.from(map.values()).map((b) => {
    const p = prodMap.get(b.product_id);
    return {
      id: `${b.product_id}|${b.expiry}`,
      product_id: b.product_id,
      name: p?.name ?? "—",
      sku: p?.sku ?? "—",
      unit: p?.main_unit || p?.unit || "—",
      quantity: b.qty,
      expiry: b.expiry,
      cost: Number(p?.cost || 0),
      price: Number(p?.price || 0),
      main_unit: p?.main_unit,
      sub_unit_1: p?.sub_unit_1,
      sub_unit_1_ratio: p?.sub_unit_1_ratio,
      sub_unit_2: p?.sub_unit_2,
      sub_unit_2_ratio: p?.sub_unit_2_ratio,
    };
  });
}

/** Stock value for a batch row (cost is per main unit). */
export function batchStockValue(row: ExpiringBatchRow): number {
  return toMainUnits(Number(row.quantity) || 0, row) * Number(row.cost || 0);
}
