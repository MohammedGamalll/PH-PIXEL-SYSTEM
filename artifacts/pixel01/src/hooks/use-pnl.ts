import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type PnlItemRow = {
  product_id: string;
  name: string;
  sold_qty: number;
  sale_value: number;
  cost_per_unit: number;
  cogs: number;
  current_stock: number;
  profit: number;
};

// One sale-event row used to build breakdown tabs (by category/brand/customer/date/weekday/invoice).
export type PnlEvent = {
  invoice_id: string;
  invoice_number: string;
  issue_date: string; // YYYY-MM-DD
  customer_id: string | null;
  customer_name: string;
  product_id: string;
  product_name: string;
  category_id: string | null;
  category_name: string;
  brand_id: string | null;
  brand_name: string;
  qty: number;
  sale_value: number;
  cost: number;
  profit: number;
};

export type PnlSummary = {
  totalSales: number;
  totalReturns: number;
  netSales: number;
  totalExpenses: number;
  totalPurchases: number;
  totalPurchaseReturns: number;
  totalTax: number;
  totalDiscountAllowed: number;
  totalDamaged: number;
  openingStockCost: number;
  openingStockSale: number;
  closingStockCost: number;
  closingStockSale: number;
  cogs: number;
  grossProfit: number;
  netProfit: number;
  items: PnlItemRow[];
  events: PnlEvent[];
};

export function useProfitLoss(from?: string, to?: string, paymentMethod?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pnl", from, to, paymentMethod],
    enabled: !!user,
    queryFn: async (): Promise<PnlSummary> => {
      const inv = (supabase.from("invoices") as any).select(
        "id,invoice_number,type,total,subtotal,tax,discount,issue_date,payment_method,customer_id,customer_name_snapshot",
      );
      if (from) inv.gte("issue_date", from);
      if (to) inv.lte("issue_date", to);
      if (paymentMethod && paymentMethod !== "all") inv.eq("payment_method", paymentMethod);
      const { data: invoices, error: invErr } = await inv;
      if (invErr) throw invErr;

      const saleInvoices = (invoices ?? []).filter((i: any) => i.type === "sale");
      const returnInvoices = (invoices ?? []).filter((i: any) => i.type === "sale_return");
      const totalSales = saleInvoices.reduce((s: number, i: any) => s + Math.abs(Number(i.subtotal) || 0), 0);
      const totalReturns = returnInvoices.reduce((s: number, i: any) => s + Math.abs(Number(i.subtotal) || 0), 0);
      const netSales = totalSales - totalReturns;
      const totalTax = saleInvoices.reduce((s: number, i: any) => s + (Number(i.tax) || 0), 0);
      const totalDiscountAllowed = saleInvoices.reduce((s: number, i: any) => s + (Number(i.discount) || 0), 0);

      const { data: expLines, error: expErr } = await (supabase.from("journal_entry_lines") as any)
        .select("debit,credit,accounts!inner(account_type),journal_entries!inner(entry_date,source_type)");
      if (expErr) throw expErr;
      const totalExpenses = (expLines ?? [])
        .filter((l: any) => l.accounts?.account_type === "Expense")
        .filter((l: any) => l.journal_entries?.source_type !== "damaged_stock")
        .filter((l: any) => !from || l.journal_entries.entry_date >= from)
        .filter((l: any) => !to || l.journal_entries.entry_date <= to)
        .reduce((s: number, l: any) => s + ((Number(l.debit) || 0) - (Number(l.credit) || 0)), 0);

      const ds = (supabase.from("damaged_stock") as any).select("total,recovered_total,damage_date");
      if (from) ds.gte("damage_date", from);
      if (to) ds.lte("damage_date", to);
      const { data: damaged } = await ds;
      const totalDamaged = (damaged ?? []).reduce(
        (s: number, d: any) => s + Math.max((Number(d.total) || 0) - (Number(d.recovered_total) || 0), 0),
        0,
      );

      const pur = (supabase.from("purchases") as any).select("total,purchase_date,is_opening");
      if (from) pur.gte("purchase_date", from);
      if (to) pur.lte("purchase_date", to);
      const { data: purchases, error: purErr } = await pur;
      if (purErr) throw purErr;
      const totalPurchases = (purchases ?? [])
        .filter((p: any) => !p.is_opening)
        .reduce((s: number, p: any) => s + (Number(p.total) || 0), 0);

      const pr = (supabase.from("purchase_returns") as any).select("total_amount,return_date");
      if (from) pr.gte("return_date", from);
      if (to) pr.lte("return_date", to);
      const { data: pReturns } = await pr;
      const totalPurchaseReturns = (pReturns ?? []).reduce((s: number, r: any) => s + (Number(r.total_amount) || 0), 0);

      const invIds = (invoices ?? [])
        .filter((i: any) => i.type === "sale" || i.type === "sale_return")
        .map((i: any) => i.id);
      let items: any[] = [];
      if (invIds.length) {
        const { data: it, error: itErr } = await (supabase.from("invoice_items") as any)
          .select("invoice_id,product_id,description,quantity,base_quantity,total,cost_at_time")
          .in("invoice_id", invIds);
        if (itErr) throw itErr;
        items = it ?? [];
      }

      const { data: products } = await (supabase.from("products") as any)
        .select("id,name,cost,price,stock,category_id,brand_id");
      const productMap = new Map<string, any>((products ?? []).map((p: any) => [p.id, p]));

      const { data: cats } = await (supabase.from("categories") as any).select("id,name");
      const catMap = new Map<string, string>((cats ?? []).map((c: any) => [c.id, c.name]));
      const { data: brs } = await (supabase.from("brands") as any).select("id,name");
      const brandMap = new Map<string, string>((brs ?? []).map((b: any) => [b.id, b.name]));
      const { data: cts } = await (supabase.from("contacts") as any).select("id,name");
      const contactMap = new Map<string, string>((cts ?? []).map((c: any) => [c.id, c.name]));

      const invMap = new Map<string, any>((invoices ?? []).map((i: any) => [i.id, i]));

      // Closing stock from current products: cost = stock * cost, sale = stock * price
      const closingStockCost = (products ?? []).reduce(
        (s: number, p: any) => s + (Number(p.stock) || 0) * (Number(p.cost) || 0), 0);
      const closingStockSale = (products ?? []).reduce(
        (s: number, p: any) => s + (Number(p.stock) || 0) * (Number(p.price) || 0), 0);

      // Opening stock from is_opening=true purchases (cost and sale).
      const { data: openingHeaders } = await (supabase.from("purchases") as any)
        .select("id").eq("is_opening", true);
      const openingIds = (openingHeaders ?? []).map((p: any) => p.id);
      let openingStockCost = 0;
      let openingStockSale = 0;
      if (openingIds.length) {
        const { data: openingItems } = await (supabase.from("purchase_items") as any)
          .select("product_id,quantity,base_quantity,unit_price,sell_price,total")
          .in("purchase_id", openingIds);
        for (const oi of openingItems ?? []) {
          const p = productMap.get(oi.product_id);
          const baseQty = Number(oi.base_quantity ?? oi.quantity) || 0;
          openingStockCost += Number(oi.total || 0);
          openingStockSale += baseQty * (Number(p?.price) || Number(oi.sell_price) || 0);
        }
      }

      const byProduct = new Map<string, PnlItemRow>();
      const events: PnlEvent[] = [];
      for (const it of items) {
        if (!it.product_id) continue;
        const invoice = invMap.get(it.invoice_id);
        if (!invoice) continue;
        const isReturn = invoice.type === "sale_return";
        const sign = isReturn ? -1 : 1;
        const qty = Math.abs(Number(it.base_quantity ?? it.quantity) || 0) * sign;
        const value = Math.abs(Number(it.total) || 0) * sign;
        const p = productMap.get(it.product_id);
        const histCost = it.cost_at_time != null ? Number(it.cost_at_time) : NaN;
        const cost = Number.isFinite(histCost) && histCost > 0 ? histCost : Number(p?.cost) || 0;
        const lineCogs = qty * cost;

        const existing = byProduct.get(it.product_id) ?? {
          product_id: it.product_id,
          name: p?.name || it.description || "—",
          sold_qty: 0, sale_value: 0, cost_per_unit: cost, cogs: 0,
          current_stock: Number(p?.stock) || 0, profit: 0,
        };
        existing.sold_qty += qty;
        existing.sale_value += value;
        existing.cogs += lineCogs;
        byProduct.set(it.product_id, existing);

        events.push({
          invoice_id: it.invoice_id,
          invoice_number: invoice.invoice_number || "—",
          issue_date: invoice.issue_date,
          customer_id: invoice.customer_id ?? null,
          customer_name: invoice.customer_id
            ? (contactMap.get(invoice.customer_id) || invoice.customer_name_snapshot || "عميل غير محدد")
            : (invoice.customer_name_snapshot || "عميل نقدي"),
          product_id: it.product_id,
          product_name: p?.name || it.description || "—",
          category_id: p?.category_id ?? null,
          category_name: p?.category_id ? (catMap.get(p.category_id) || "—") : "بدون فئة",
          brand_id: p?.brand_id ?? null,
          brand_name: p?.brand_id ? (brandMap.get(p.brand_id) || "—") : "بدون ماركة",
          qty,
          sale_value: value,
          cost: lineCogs,
          profit: value - lineCogs,
        });
      }
      const itemRows = Array.from(byProduct.values()).map((r) => ({
        ...r, profit: r.sale_value - r.cogs,
      })).sort((a, b) => b.profit - a.profit);

      const cogs = itemRows.reduce((s, r) => s + r.cogs, 0);
      const grossProfit = netSales - cogs;
      const netProfit = grossProfit + totalPurchaseReturns - totalExpenses - totalDamaged - totalDiscountAllowed;

      return {
        totalSales, totalReturns, netSales,
        totalExpenses, totalPurchases, totalPurchaseReturns,
        totalTax, totalDiscountAllowed, totalDamaged,
        openingStockCost, openingStockSale,
        closingStockCost, closingStockSale,
        cogs, grossProfit, netProfit,
        items: itemRows, events,
      };
    },
  });
}
