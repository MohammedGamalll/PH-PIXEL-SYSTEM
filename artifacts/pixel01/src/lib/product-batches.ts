import { supabase } from "@/integrations/supabase/client";

export type ProductBatch = {
  expiry_date: string;
  purchased: number;
  sold: number;
  returned: number;
  damaged: number;
  remaining: number;
};

/**
 * Single source of truth for per-expiry batch computation.
 * - Tagged sales/returns/damages deduct from their own expiry.
 * - Untagged sales / purchase-returns / damages drain FIFO from earliest batch.
 * - Untagged sale_returns add back to earliest batch.
 * No reconciliation with products.stock — display the raw computed batches
 * so all screens (count form, product card, details) show identical numbers.
 */
export async function computeProductBatches(productId: string): Promise<ProductBatch[]> {
  const [pi, ii, pri, di, btIn, btOut, sri] = await Promise.all([
    (supabase.from("purchase_items") as any)
      .select("expiry_date, base_quantity, quantity")
      .eq("product_id", productId),
    (supabase.from("invoice_items") as any)
      .select("expiry_date, base_quantity, quantity, invoice:invoices!inner(type)")
      .eq("product_id", productId),
    (supabase.from("purchase_return_items") as any)
      .select("base_quantity, quantity, product_id")
      .eq("product_id", productId),
    (supabase.from("damaged_stock_items") as any)
      .select("base_quantity, quantity, expiry_date, product_id")
      .eq("product_id", productId),
    // Branch transfers — incoming (this owner's product is the target side)
    (supabase.from("inventory_branch_transfer_items") as any)
      .select("expiry_date, base_quantity, quantity")
      .eq("target_product_id", productId),
    // Branch transfers — outgoing (this owner's product is the source side)
    (supabase.from("inventory_branch_transfer_items") as any)
      .select("expiry_date, base_quantity, quantity")
      .eq("source_product_id", productId),
    (supabase.from("standalone_return_items") as any)
      .select("expiry_date, quantity, product_id, standalone_return:standalone_returns!inner(return_type)")
      .eq("product_id", productId),
  ]);


  const map = new Map<string, ProductBatch>();
  const ensure = (d: string) => {
    if (!map.has(d)) {
      map.set(d, { expiry_date: d, purchased: 0, sold: 0, returned: 0, damaged: 0, remaining: 0 });
    }
    return map.get(d)!;
  };

  // Purchases: tagged → expiry batch; untagged → "" (no-expiry) batch so they remain visible.
  ((pi.data as any[]) || []).forEach((r) => {
    const key = r.expiry_date || "";
    ensure(key).purchased += Number(r.base_quantity ?? r.quantity ?? 0);
  });

  // Incoming branch transfers count as supply on their expiry batch.
  ((btIn.data as any[]) || []).forEach((r) => {
    const key = r.expiry_date || "";
    ensure(key).purchased += Number(r.base_quantity ?? r.quantity ?? 0);
  });

  // Outgoing branch transfers deduct from their expiry batch (treated like damaged).
  let fifoTransferOut = 0;
  ((btOut.data as any[]) || []).forEach((r) => {
    const q = Number(r.base_quantity ?? r.quantity ?? 0);
    if (r.expiry_date) ensure(r.expiry_date).damaged += q;
    else fifoTransferOut += q;
  });


  let fifoSold = 0;
  let fifoReturned = 0;
  ((ii.data as any[]) || []).forEach((r) => {
    const t = r.invoice?.type;
    // Only real sales/returns affect stock — ignore drafts, held, completed-only, etc.
    if (t !== "sale" && t !== "sale_return") return;
    const q = Math.abs(Number(r.base_quantity ?? r.quantity ?? 0));
    const isReturn = t === "sale_return";
    if (r.expiry_date) {
      const b = ensure(r.expiry_date);
      if (isReturn) b.returned += q;
      else b.sold += q;
    } else {
      if (isReturn) fifoReturned += q;
      else fifoSold += q;
    }
  });

  let fifoDamage = 0;
  ((di.data as any[]) || []).forEach((r) => {
    const q = Number(r.base_quantity ?? r.quantity ?? 0);
    if (r.expiry_date) ensure(r.expiry_date).damaged += q;
    else fifoDamage += q;
  });
  const prTotal = ((pri.data as any[]) || []).reduce(
    (s, r) => s + Number(r.base_quantity ?? r.quantity ?? 0), 0);

  // Standalone returns: sales returns add stock; purchase returns reduce stock.
  ((sri.data as any[]) || []).forEach((r) => {
    const q = Number(r.quantity ?? 0);
    if (!q) return;
    const rt = r.standalone_return?.return_type;
    if (rt === "sales") {
      const key = r.expiry_date || "";
      ensure(key).returned += q;
    } else if (rt === "purchase") {
      if (r.expiry_date) ensure(r.expiry_date).sold += q;
      else fifoSold += q;
    }
  });

  // Tagged dates first (ascending), no-expiry batch last so FIFO drains it after.
  const list = Array.from(map.values()).sort((a, b) => {
    if (!a.expiry_date && !b.expiry_date) return 0;
    if (!a.expiry_date) return 1;
    if (!b.expiry_date) return -1;
    return a.expiry_date.localeCompare(b.expiry_date);
  });
  for (const b of list) b.remaining = b.purchased - b.sold + b.returned - b.damaged;
  if (fifoReturned > 0 && list.length > 0) list[0].remaining += fifoReturned;

  const drain = (amount: number, trackDamage = false) => {
    let v = amount;
    for (const b of list) {
      if (v <= 0) break;
      if (b.remaining <= 0) continue;
      const take = Math.min(b.remaining, v);
      b.remaining -= take;
      v -= take;
      if (trackDamage) b.damaged += take;
    }
  };
  drain(fifoSold);
  drain(prTotal);
  drain(fifoTransferOut, true);
  drain(fifoDamage, true);


  // Redistribute oversells: any batch with remaining < 0 (sold/damaged
  // more than purchased for that expiry) drains the deficit FIFO from
  // later positive batches so the per-batch view matches products.stock.
  let deficit = 0;
  for (const b of list) {
    if (b.remaining < 0) {
      deficit += -b.remaining;
      b.remaining = 0;
    }
  }
  if (deficit > 0) {
    for (const b of list) {
      if (deficit <= 0) break;
      if (b.remaining <= 0) continue;
      const take = Math.min(b.remaining, deficit);
      b.remaining -= take;
      deficit -= take;
    }
  }

  // Final guard: never expose negative remaining in the UI.
  for (const b of list) if (b.remaining < 0) b.remaining = 0;

  return list;
}
