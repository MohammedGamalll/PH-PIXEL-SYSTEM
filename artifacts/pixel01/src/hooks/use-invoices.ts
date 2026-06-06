import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { friendlyDbError, requireOwnerId } from "@/lib/db-errors";
import { useWarehouseContext } from "@/contexts/WarehouseContext";
import { toast } from "sonner";

export type InvoiceType = "sale" | "draft" | "quotation" | "sale_return";

export type InvoiceItemInput = {
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  total: number;
  unit_name?: string | null;
  base_quantity?: number | null;
  sold_price_at_time?: number | null;
  promotional_discount_id?: string | null;
  expiry_date?: string | null;
  warranty_end_date?: string | null;
};

export type InvoiceInput = {
  type: InvoiceType;
  customer_id?: string | null;
  sales_rep_id?: string | null;
  issue_date?: string;
  notes?: string | null;
  status?: string;
  subtotal: number;
  tax: number;
  discount: number;
  shipping_cost: number;
  total: number;
  paid_amount: number;
  payment_status: "paid" | "unpaid" | "partial";
  shipping_status?: string;
  payment_method?: string | null;
  session_id?: string | null;
  warehouse_id?: string | null;
  items: InvoiceItemInput[];
};

export function useInvoicesByType(type: InvoiceType) {
  const { user } = useAuth();
  const { currentWarehouseId } = useWarehouseContext();
  return useQuery({
    queryKey: ["invoices", type, currentWarehouseId ?? "all"],
    enabled: !!user,
    queryFn: async () => {
      let q = (supabase.from("invoices") as any)
        .select("*, invoice_items(quantity)")
        .eq("type", type)
        .order("created_at", { ascending: false });
      if (currentWarehouseId) q = q.eq("warehouse_id", currentWarehouseId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        _total_qty: ((r.invoice_items as any[]) || []).reduce(
          (s, it) => s + Math.abs(Number(it.quantity || 0)), 0
        ),
      }));
    },
  });
}

export function useInvoiceItems(invoiceId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["invoice_items", invoiceId],
    enabled: !!user && !!invoiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoiceId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateInvoice() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const { currentWarehouseId } = useWarehouseContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: InvoiceInput) => {
      const effectiveOwnerId = requireOwnerId(ownerId);
      const { data: numData, error: eNum } = await (supabase as any).rpc("next_doc_number", {
        _owner: effectiveOwnerId, _table: "invoices", _column: "invoice_number", _prefix: "", _pad: 4,
      });
      if (eNum) throw friendlyDbError(eNum);
      const invoice_number = numData as string;
      const { items, ...header } = values;
      const { data: inv, error: e1 } = await (supabase.from("invoices") as any)
        .insert({
          ...header,
          invoice_number,
          owner_id: effectiveOwnerId,
          warehouse_id: (header as any).warehouse_id ?? currentWarehouseId ?? null,
          created_by: user!.id,
        })
        .select("id")
        .single();
      if (e1) throw friendlyDbError(e1);
      if (items.length) {
        // Normalize empty expiry/date strings to null so Postgres doesn't choke on "".
        const cleanItems = items.map((it: any) => ({
          ...it,
          expiry_date: it.expiry_date && String(it.expiry_date).trim() ? it.expiry_date : null,
          warranty_end_date: it.warranty_end_date && String(it.warranty_end_date).trim() ? it.warranty_end_date : null,
        }));
        const { error: e2 } = await (supabase.from("invoice_items") as any).insert(
          cleanItems.map((it) => ({ ...it, invoice_id: inv.id }))
        );
        if (e2) {
          // Rollback: avoid orphan invoice headers if item insert fails
          await supabase.from("invoices").delete().eq("id", inv.id);
          throw friendlyDbError(e2);
        }
        // Adjust per-warehouse stock for sales/sale_returns
        const whId = (header as any).warehouse_id ?? currentWarehouseId ?? null;
        const t = (header as any).type ?? "sale";
        if (whId && (t === "sale" || t === "sale_return")) {
          const sign = t === "sale" ? -1 : +1;
          for (const it of items) {
            if (!it.product_id) continue;
            const baseQty = Number((it as any).base_quantity ?? it.quantity ?? 0);
            if (!baseQty) continue;
            await (supabase as any).rpc("adjust_warehouse_stock", {
              _owner: effectiveOwnerId,
              _product: it.product_id,
              _warehouse: whId,
              _delta: sign * baseQty,
            });
          }
        }
      } else {
        // No items provided — don't leave an empty header
        await supabase.from("invoices").delete().eq("id", inv.id);
        throw new Error("لا يمكن حفظ فاتورة بدون أصناف");
      }

      return inv.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("تم الحفظ");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const ownerId = useOwnerId();
  return useMutation({
    mutationFn: async (id: string) => {
      // snapshot to soft_deletes
      const { data: row } = await (supabase.from("invoices") as any).select("*").eq("id", id).maybeSingle();
      if (row && ownerId) {
        await (supabase.from("soft_deletes") as any).insert({
          owner_id: ownerId,
          entity_type: "invoice",
          entity_id: id,
          entity_label: row.invoice_number ?? null,
          snapshot: row,
          deleted_by: user?.id ?? null,
        });
      }
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, header, items, payment }: { id: string; header: Record<string, any>; items: any[]; payment?: { amount: number; payment_method?: string; treasury_id?: string | null } | null }) => {
      const { error } = await (supabase as any).rpc("update_sales_invoice_transaction", {
        _invoice_id: id,
        _header: header,
        _items: items,
        _payment: payment ?? null,
      });
      if (error) throw friendlyDbError(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product_warehouse_stock"] });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      qc.invalidateQueries({ queryKey: ["account-balances"] });
      qc.invalidateQueries({ queryKey: ["treasuries"] });
      toast.success("تم تحديث الفاتورة");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateInvoiceShipping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, any> }) => {
      const { error } = await (supabase.from("invoices") as any).update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      toast.success("تم تحديث الشحن والتوصيل");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDuplicateInvoice() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const effectiveOwnerId = requireOwnerId(ownerId);
      const { data: src, error: e1 } = await (supabase.from("invoices") as any).select("*").eq("id", id).single();
      if (e1) throw friendlyDbError(e1);
      const { data: items, error: e2 } = await supabase.from("invoice_items").select("*").eq("invoice_id", id);
      if (e2) throw friendlyDbError(e2);
      const { data: numData, error: eNum } = await (supabase as any).rpc("next_doc_number", {
        _owner: effectiveOwnerId, _table: "invoices", _column: "invoice_number", _prefix: "", _pad: 4,
      });
      if (eNum) throw friendlyDbError(eNum);
      const invoice_number = numData as string;
      const { id: _i, created_at: _c, updated_at: _u, invoice_number: _n, ...rest } = src as any;
      const { data: inv, error: e3 } = await (supabase.from("invoices") as any)
        .insert({ ...rest, invoice_number, owner_id: effectiveOwnerId, created_by: user!.id })
        .select("id").single();
      if (e3) throw friendlyDbError(e3);
      if (items && items.length) {
        const clones = (items as any[]).map(({ id: _x, created_at: _y, invoice_id: _z, ...it }) => ({ ...it, invoice_id: inv.id }));
        const { error: e4 } = await (supabase.from("invoice_items") as any).insert(clones);
        if (e4) throw friendlyDbError(e4);
      }
      return inv.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      toast.success("تم النسخ");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useConvertInvoice() {
  const qc = useQueryClient();
  const ownerId = useOwnerId();
  return useMutation({
    mutationFn: async (id: string) => {
      // Load invoice + items so we can adjust warehouse stock
      const { data: inv } = await (supabase.from("invoices") as any)
        .select("id, warehouse_id, type, total, payment_method, paid_amount").eq("id", id).maybeSingle();
      const { data: items } = await (supabase.from("invoice_items") as any)
        .select("product_id, description, base_quantity, quantity").eq("invoice_id", id);

      // ── STOCK VALIDATION: refuse to convert if any item would go negative ──
      const whId = (inv as any)?.warehouse_id;
      if (whId && (items ?? []).length) {
        const productIds = Array.from(
          new Set(((items ?? []) as any[]).map((it: any) => it.product_id).filter(Boolean))
        );
        if (productIds.length) {
          const { data: stockRows } = await (supabase.from("product_warehouse_stock") as any)
            .select("product_id, stock")
            .eq("warehouse_id", whId)
            .in("product_id", productIds);
          const stockMap: Record<string, number> = {};
          for (const r of (stockRows ?? []) as any[]) {
            stockMap[r.product_id] = Number(r.stock ?? 0);
          }
          // Aggregate requested per product (handles same product in multiple lines)
          const requested: Record<string, { qty: number; name: string }> = {};
          for (const it of items as any[]) {
            if (!it.product_id) continue;
            const baseQty = Math.abs(Number(it.base_quantity ?? it.quantity ?? 0));
            if (!baseQty) continue;
            const cur = requested[it.product_id] ?? { qty: 0, name: it.description || "" };
            cur.qty += baseQty;
            requested[it.product_id] = cur;
          }
          const shortages: string[] = [];
          for (const [pid, req] of Object.entries(requested)) {
            const available = stockMap[pid] ?? 0;
            if (req.qty > available + 1e-6) {
              shortages.push(`"${req.name}" — متاح ${available} / مطلوب ${req.qty}`);
            }
          }
          if (shortages.length) {
            throw new Error(
              `لا يمكن التحويل — المخزون غير كافٍ:\n${shortages.join("\n")}`
            );
          }
        }
      }

      // If the draft's payment method is cash/card/bank/transfer and nothing was paid,
      // assume the user is collecting the full amount on convert (drafts in this app
      // are saved without payment but with the intended method). Credit stays unpaid.
      const pm = String((inv as any)?.payment_method ?? "").toLowerCase();
      const cashLike = ["cash", "نقدا", "نقد", "card", "بطاقة", "bank", "transfer", "تحويل"]; 
      const totalAmt = Number((inv as any)?.total ?? 0);
      const wasPaid = Number((inv as any)?.paid_amount ?? 0);
      const shouldPay = wasPaid === 0 && totalAmt > 0 && cashLike.some((k) => pm.includes(k));
      const newPaid = shouldPay ? totalAmt : wasPaid;
      const newPaymentStatus = newPaid >= totalAmt && totalAmt > 0 ? "paid" : (newPaid > 0 ? "partial" : "unpaid");

      const updatePayload: any = { type: "sale", status: "final" };
      if (shouldPay) {
        updatePayload.paid_amount = newPaid;
        updatePayload.payment_status = newPaymentStatus;
      }
      const { error } = await (supabase.from("invoices") as any)
        .update(updatePayload)
        .eq("id", id);
      if (error) throw error;

      // The DB trigger trg_sync_sale_on_type_change adjusts products.stock and
      // accounting. We additionally adjust per-warehouse stock to mirror the
      // useCreateInvoice flow.
      if (whId && ownerId && (items ?? []).length) {
        for (const it of items as any[]) {
          if (!it.product_id) continue;
          const baseQty = Number(it.base_quantity ?? it.quantity ?? 0);
          if (!baseQty) continue;
          await (supabase as any).rpc("adjust_warehouse_stock", {
            _owner: ownerId,
            _product: it.product_id,
            _warehouse: whId,
            _delta: -Math.abs(baseQty),
          });
        }
      }
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product_warehouse_stock"] });
      qc.invalidateQueries({ queryKey: ["products_for_purchase"] });
      toast.success("تم التحويل إلى فاتورة بيع");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}


/**
 * Convert a paid cash sale invoice into a credit (unpaid) sale.
 * - The DB trigger `sync_invoice_payment_delta` reverses the cash leg and
 *   creates the matching A/R leg automatically when `paid_amount` drops.
 * - We clear `session_id` so it stops counting in the cashier session cash.
 * - Stock is untouched (the sale itself still stands).
 */
export function useConvertSaleToCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invoiceId,
      customerId,
    }: { invoiceId: string; customerId: string }) => {
      const { error } = await (supabase.from("invoices") as any)
        .update({
          customer_id: customerId,
          paid_amount: 0,
          payment_status: "unpaid",
          payment_method: "credit",
          payment_splits: null,
          session_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices_by_session"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      toast.success("تم التحويل إلى آجل");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Cashier sessions
export function useCashierSessions() {
  const { user } = useAuth();
  const { currentWarehouseId } = useWarehouseContext();
  return useQuery({
    queryKey: ["cashier_sessions", currentWarehouseId ?? "all"],
    enabled: !!user,
    queryFn: async () => {
      let q = (supabase.from("cashier_sessions" as any) as any)
        .select("*")
        .order("opened_at", { ascending: false });
      if (currentWarehouseId) q = q.eq("warehouse_id", currentWarehouseId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useOpenCashierSession() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const { currentWarehouseId } = useWarehouseContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opening_cash: number) => {
      const effectiveOwnerId = requireOwnerId(ownerId);
      const { data, error } = await (supabase.from("cashier_sessions" as any) as any)
        .insert({ owner_id: effectiveOwnerId, user_id: user!.id, opening_cash, status: "open", warehouse_id: currentWarehouseId ?? null })
        .select("id")
        .single();
      if (error) throw friendlyDbError(error);
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cashier_sessions"] });
      toast.success("تم بدء جلسة جديدة");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCloseCashierSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, closing_cash }: { id: string; closing_cash: number }) => {
      const { error } = await (supabase.from("cashier_sessions" as any) as any)
        .update({ status: "closed", closing_cash, closed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cashier_sessions"] });
      toast.success("تم إغلاق الجلسة");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ────────── Invoices grouped by cashier session ──────────
export function useInvoicesBySession(sessionId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["invoices_by_session", sessionId],
    enabled: !!user && !!sessionId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("invoices") as any)
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

// ────────── Lookup an invoice by its invoice_number (for quick-return) ──────────
export function useFindInvoiceByNumber() {
  const { currentWarehouseId } = useWarehouseContext();
  return useMutation({
    mutationFn: async (invoice_number: string) => {
      let q = (supabase.from("invoices") as any)
        .select("*")
        .eq("invoice_number", invoice_number)
        .eq("type", "sale");
      if (currentWarehouseId) q = q.eq("warehouse_id", currentWarehouseId);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data as any | null;
    },
  });
}

// ────────── Sales return helpers ──────────

/** Build a stable key per original item to match against return items. */
export function returnItemKey(it: { product_id?: string | null; description?: string | null }) {
  return it.product_id ? `pid:${it.product_id}` : `desc:${(it.description || "").trim()}`;
}

/**
 * Fetch the total already-returned qty per original item (keyed by returnItemKey),
 * optionally excluding one return invoice (used when editing that return).
 */
export async function fetchReturnedQuantities(
  originalId: string,
  excludeReturnId?: string | null,
): Promise<Record<string, number>> {
  let q = (supabase.from("invoices") as any)
    .select("id")
    .eq("is_returned_from_id", originalId)
    .eq("type", "sale_return");
  if (excludeReturnId) q = q.neq("id", excludeReturnId);
  const { data: rets, error: e1 } = await q;
  if (e1) throw e1;
  const ids = (rets ?? []).map((r: any) => r.id);
  if (!ids.length) return {};
  const { data: items, error: e2 } = await (supabase.from("invoice_items") as any)
    .select("product_id,description,quantity")
    .in("invoice_id", ids);
  if (e2) throw e2;
  const map: Record<string, number> = {};
  for (const it of (items ?? []) as any[]) {
    const k = returnItemKey(it);
    map[k] = (map[k] || 0) + Math.abs(Number(it.quantity || 0));
  }
  return map;
}

export function useReturnableQuantities(originalId?: string, excludeReturnId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["returned_qty_map", originalId, excludeReturnId || null],
    enabled: !!user && !!originalId,
    queryFn: () => fetchReturnedQuantities(originalId!, excludeReturnId || null),
  });
}

/**
 * Throws if any requested line exceeds the remaining returnable qty for its
 * original item. Used by both create & update return mutations.
 */
export async function assertWithinReturnable(
  originalId: string,
  lines: ReturnLineInput[],
  excludeReturnId: string | null,
) {
  const { data: origItems, error } = await (supabase.from("invoice_items") as any)
    .select("product_id,description,quantity")
    .eq("invoice_id", originalId);
  if (error) throw error;
  const origMap: Record<string, { qty: number; desc: string }> = {};
  for (const it of (origItems ?? []) as any[]) {
    const k = returnItemKey(it);
    origMap[k] = {
      qty: (origMap[k]?.qty || 0) + Math.abs(Number(it.quantity || 0)),
      desc: it.description || "",
    };
  }
  const returned = await fetchReturnedQuantities(originalId, excludeReturnId);
  for (const l of lines) {
    const k = returnItemKey(l);
    const orig = origMap[k]?.qty || 0;
    const already = returned[k] || 0;
    const remaining = Math.max(0, orig - already);
    const requested = Math.abs(Number(l.quantity || 0));
    if (requested > remaining + 1e-6) {
      throw new Error(
        `الكمية المطلوبة للإرجاع للصنف "${l.description}" تتجاوز المتاح (المتاح: ${remaining})`,
      );
    }
  }
}

export function useReturnsForOriginal(originalId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["returns_for_original", originalId],
    enabled: !!user && !!originalId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("invoices") as any)
        .select("*")
        .eq("is_returned_from_id", originalId)
        .eq("type", "sale_return")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export type ReturnLineInput = {
  original_item_id?: string | null;
  product_id?: string | null;
  description: string;
  quantity: number;        // POSITIVE qty the user wants to return
  unit_price: number;
  unit_name?: string | null;
  base_quantity: number;   // POSITIVE base qty
  discount_amount?: number;
};

export function useCreateSalesReturn() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      original: any;
      lines: ReturnLineInput[];
      discount?: number;
      tax?: number;
      notes?: string | null;
      sessionId?: string | null;
    }) => {
      const effectiveOwnerId = requireOwnerId(ownerId);
      await assertWithinReturnable(args.original.id, args.lines, null);
      const subtotal = args.lines.reduce((a, l) => a + l.unit_price * l.quantity, 0);
      const total = Math.max(0, subtotal - (args.discount || 0) + (args.tax || 0));
      const { data: numData, error: eNum } = await (supabase as any).rpc("next_doc_number", {
        _owner: effectiveOwnerId, _table: "invoices", _column: "invoice_number", _prefix: "R", _pad: 4,
      });
      if (eNum) throw friendlyDbError(eNum);
      const invoice_number = numData as string;

      const { data: inv, error: e1 } = await (supabase.from("invoices") as any).insert({
        owner_id: effectiveOwnerId,
        created_by: user!.id,
        type: "sale_return",
        status: "final",
        invoice_number,
        customer_id: args.original.customer_id ?? null,
        issue_date: new Date().toISOString().slice(0, 10),
        is_returned_from_id: args.original.id,
        warehouse_id: args.original.warehouse_id ?? null,
        subtotal: -subtotal,
        tax: -(args.tax || 0),
        discount: args.discount || 0,
        shipping_cost: 0,
        total: -total,
        paid_amount: -total,
        payment_status: "paid",
        payment_method: args.original.payment_method ?? "cash",
        notes: args.notes ?? null,
        session_id: args.sessionId ?? null,
      }).select("id").single();
      if (e1) throw friendlyDbError(e1);

      if (args.lines.length) {
        const items = args.lines.map((l) => ({
          invoice_id: (inv as any).id,
          product_id: l.product_id ?? null,
          description: l.description,
          quantity: -Math.abs(l.quantity),
          unit_price: l.unit_price,
          unit_name: l.unit_name ?? null,
          base_quantity: -Math.abs(l.base_quantity),
          discount_amount: -(l.discount_amount || 0),
          total: -(l.unit_price * l.quantity),
          sold_price_at_time: l.unit_price,
        }));
        const { error: e2 } = await (supabase.from("invoice_items") as any).insert(items);
        if (e2) throw e2;
      }

      // recompute returned_status on the original
      await (supabase as any).rpc("process_sales_return_status", { p_original_id: args.original.id });
      return (inv as any).id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      qc.invalidateQueries({ queryKey: ["returns_for_original"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("تم حفظ المرتجع");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateSalesReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      returnId: string;
      originalId: string;
      lines: ReturnLineInput[];
      discount?: number;
      tax?: number;
      notes?: string | null;
      sessionId?: string | null;
    }) => {
      await assertWithinReturnable(args.originalId, args.lines, args.returnId);
      const subtotal = args.lines.reduce((a, l) => a + l.unit_price * l.quantity, 0);
      const total = Math.max(0, subtotal - (args.discount || 0) + (args.tax || 0));

      // Delete existing items (trigger reverses stock)
      const { error: eDel } = await supabase.from("invoice_items").delete().eq("invoice_id", args.returnId);
      if (eDel) throw eDel;

      // Update invoice totals/notes
      const updatePayload: any = {
        subtotal: -subtotal,
        tax: -(args.tax || 0),
        discount: args.discount || 0,
        total: -total,
        paid_amount: -total,
        notes: args.notes ?? null,
        updated_at: new Date().toISOString(),
      };
      if (args.sessionId !== undefined) updatePayload.session_id = args.sessionId;
      const { error: eUp } = await (supabase.from("invoices") as any).update(updatePayload).eq("id", args.returnId);
      if (eUp) throw eUp;

      if (args.lines.length) {
        const items = args.lines.map((l) => ({
          invoice_id: args.returnId,
          product_id: l.product_id ?? null,
          description: l.description,
          quantity: -Math.abs(l.quantity),
          unit_price: l.unit_price,
          unit_name: l.unit_name ?? null,
          base_quantity: -Math.abs(l.base_quantity),
          discount_amount: -(l.discount_amount || 0),
          total: -(l.unit_price * l.quantity),
          sold_price_at_time: l.unit_price,
        }));
        const { error: e2 } = await (supabase.from("invoice_items") as any).insert(items);
        if (e2) throw e2;
      }

      await (supabase as any).rpc("process_sales_return_status", { p_original_id: args.originalId });
      return args.returnId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      qc.invalidateQueries({ queryKey: ["invoice_items"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("تم تحديث المرتجع");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteSalesReturn() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { returnId: string; originalId?: string | null }) => {
      const { data: row } = await (supabase.from("invoices") as any)
        .select("*")
        .eq("id", args.returnId)
        .maybeSingle();
      if (row && ownerId) {
        await (supabase.from("soft_deletes") as any).insert({
          owner_id: ownerId,
          entity_type: "invoice",
          entity_id: args.returnId,
          entity_label: row.invoice_number ?? null,
          snapshot: row,
          deleted_by: user?.id ?? null,
        });
      }
      const { error } = await supabase.from("invoices").delete().eq("id", args.returnId);
      if (error) throw error;
      if (args.originalId) {
        await (supabase as any).rpc("process_sales_return_status", { p_original_id: args.originalId });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("تم حذف المرتجع");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ────────── Treasury / payments ──────────
// Treasuries are auto-synced from cash-equivalent accounts (see DB trigger
// sync_treasury_from_account). The dropdown lists active treasuries with
// the linked account's name.
export function useTreasuries() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  return useQuery({
    queryKey: ["treasuries", ownerId],
    enabled: !!user && !!ownerId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("treasuries") as any)
        .select("id, name, balance, account_id, currency, is_closed")
        .eq("owner_id", ownerId)
        .eq("is_closed", false)
        .order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}



export function useInvoicePayments(invoiceId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["invoice_payments", invoiceId],
    enabled: !!user && !!invoiceId,
    queryFn: async () => {
      // 1) Direct treasury transactions tied to this invoice
      const { data: tx, error } = await (supabase.from("treasury_transactions") as any)
        .select("*")
        .eq("reference", invoiceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const txRows = (tx ?? []) as any[];

      // attach original_ref_no for reversals
      const origTxIds = Array.from(new Set(txRows.filter((r) => r.original_transaction_id).map((r) => r.original_transaction_id)));
      if (origTxIds.length) {
        const { data: origs } = await (supabase.from("treasury_transactions") as any)
          .select("id,description,reference").in("id", origTxIds);
        const m = new Map((origs ?? []).map((o: any) => [o.id, o.description]));
        for (const r of txRows) if (r.original_transaction_id) (r as any).original_ref_no = m.get(r.original_transaction_id) ?? null;
      }

      const merged: any[] = txRows.map((t) => ({ ...t, source: "treasury" }));

      // 2) Journal entries created by trg_sync_invoice_payment_delta when invoice
      // is created/updated with paid_amount > 0 (no treasury_transactions row exists).
      const { data: jes } = await (supabase.from("journal_entries") as any)
        .select("id, entry_date, created_at, description, ref_no, payment_method, source_type, source_id")
        .eq("source_id", invoiceId)
        .in("source_type", ["sale_payment", "sale_return_payment"])
        .order("created_at", { ascending: false });
      const jeRows = (jes ?? []) as any[];
      if (jeRows.length) {
        const jeIds = jeRows.map((j) => j.id);
        const { data: lines } = await (supabase.from("journal_entry_lines") as any)
          .select("journal_entry_id, debit, credit, account_id")
          .in("journal_entry_id", jeIds);
        // Pull cash/bank account types so we use the cash leg amount as the payment amount.
        const acctIds = Array.from(new Set((lines ?? []).map((l: any) => l.account_id)));
        let cashAcctSet = new Set<string>();
        if (acctIds.length) {
          const { data: accts } = await (supabase.from("accounts") as any)
            .select("id, is_cash_equivalent, account_type").in("id", acctIds);
          cashAcctSet = new Set(
            (accts ?? [])
              .filter((a: any) => a.is_cash_equivalent || ["cash", "bank"].includes(String(a.sub_account_type ?? "")))
              .map((a: any) => a.id),
          );
        }
        const byJe = new Map<string, any[]>();
        for (const l of lines ?? []) {
          const arr = byJe.get(l.journal_entry_id) ?? [];
          arr.push(l);
          byJe.set(l.journal_entry_id, arr);
        }
        const treasuryIds = new Set(txRows.map((r) => r.id));
        // Dedup: skip JEs whose (type, amount) matches a treasury tx created within ±10s
        // (treasury insert + journal trigger fire near-simultaneously for same payment).
        const txKeys = txRows.map((r) => ({
          key: `${r.type}|${Number(r.amount || 0).toFixed(2)}`,
          ts: new Date(r.created_at).getTime(),
        }));
        for (const je of jeRows) {
          if (treasuryIds.has(je.id)) continue;
          const ls = byJe.get(je.id) ?? [];
          let amount = 0;
          for (const l of ls) {
            if (cashAcctSet.has(l.account_id)) {
              amount = Math.max(Number(l.debit || 0), Number(l.credit || 0));
              break;
            }
          }
          if (amount === 0) {
            for (const l of ls) {
              const v = Math.max(Number(l.debit || 0), Number(l.credit || 0));
              if (v > amount) amount = v;
            }
          }
          const jeType = je.source_type === "sale_return_payment" ? "out" : "in";
          const jeKey = `${jeType}|${Number(amount).toFixed(2)}`;
          const jeTs = new Date(je.created_at).getTime();
          const mirrored = txKeys.some((k) => k.key === jeKey && Math.abs(k.ts - jeTs) < 10_000);
          if (mirrored) continue;
          merged.push({
            id: je.id,
            source: "journal",
            amount,
            transaction_date: je.entry_date,
            created_at: je.created_at,
            description: je.description,
            ref_no: je.ref_no,
            payment_method: je.payment_method,
            type: jeType,
          });
        }
      }

      // 3) Customer/supplier credit allocated to this invoice via contact_payment_invoice_allocations
      const { data: allocs } = await (supabase.from("contact_payment_invoice_allocations") as any)
        .select("id, contact_payment_id, allocated_amount, created_at, document_type")
        .eq("document_id", invoiceId)
        .in("document_type", ["invoice", "purchase"]);
      const allocRows = (allocs ?? []) as any[];
      if (allocRows.length) {
        const payIds = Array.from(new Set(allocRows.map((a) => a.contact_payment_id)));
        const { data: pays } = await (supabase.from("contact_payments") as any)
          .select("id, payment_date, payment_method, ref_no, notes, direction")
          .in("id", payIds);
        const payMap = new Map((pays ?? []).map((p: any) => [p.id, p]));
        for (const a of allocRows) {
          const p: any = payMap.get(a.contact_payment_id) ?? {};
          merged.push({
            id: a.id,
            source: "credit_allocation",
            amount: Number(a.allocated_amount || 0),
            transaction_date: p.payment_date ?? a.created_at,
            created_at: a.created_at,
            description: "سداد من رصيد العميل",
            ref_no: p.ref_no ?? null,
            payment_method: p.payment_method ?? "credit",
            type: p.direction === "out" ? "out" : "in",
          });
        }
      }

      merged.sort((a, b) => String(b.created_at || b.transaction_date).localeCompare(String(a.created_at || a.transaction_date)));
      return merged;
    },
  });
}

export function useAddInvoicePayment() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      invoice: any;
      amount: number;
      treasury_id: string;
      payment_method?: string;
      note?: string | null;
      transaction_date?: string;
    }) => {
      const total = Number(args.invoice.total || 0);
      const oldPaid = Number(args.invoice.paid_amount || 0);
      // Cap to total to avoid silent overpayment.
      const cappedAmount = Math.max(0, Math.min(args.amount, total - oldPaid));
      if (cappedAmount < args.amount - 1e-6) {
        toast.warning(`المبلغ المسموح به أقصى ${(total - oldPaid).toFixed(2)} — تم تعديل الدفعة`);
      }
      if (cappedAmount <= 0) throw new Error("الفاتورة مدفوعة بالكامل");

      const { error: e1 } = await (supabase.from("treasury_transactions") as any).insert({
        owner_id: requireOwnerId(ownerId),
        treasury_id: args.treasury_id,
        amount: cappedAmount,
        type: "in",
        description: args.note ?? `دفعة للفاتورة ${args.invoice.invoice_number}`,
        reference: args.invoice.id,
        transaction_date: args.transaction_date ?? new Date().toISOString().slice(0, 10),
      });
      if (e1) throw friendlyDbError(e1);

      const newPaid = oldPaid + cappedAmount;
      const status = newPaid >= total - 1e-6 ? "paid" : newPaid > 0 ? "partial" : "unpaid";
      const { error: e2 } = await (supabase.from("invoices") as any)
        .update({ paid_amount: newPaid, payment_status: status, payment_method: args.payment_method ?? args.invoice.payment_method })
        .eq("id", args.invoice.id);
      if (e2) throw e2;

      // Auto-allocate any leftover (or this same payment) to oldest unpaid invoices for the same customer
      try {
        const { allocateContactPayment, resettleContactDebt } = await import("@/lib/debt-allocation.functions");
        if (args.invoice.customer_id) {
          await resettleContactDebt({ data: { contact_id: args.invoice.customer_id, direction: "in" } });
        }
        void allocateContactPayment;
      } catch (err) {
        console.warn("debt resettle failed", err);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      qc.invalidateQueries({ queryKey: ["invoice_payments"] });
      toast.success("تم تسجيل الدفعة");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
