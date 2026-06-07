import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { friendlyDbError, requireOwnerId } from "@/lib/db-errors";
import { useWarehouseContext } from "@/contexts/WarehouseContext";
import { toast } from "sonner";

export type PurchaseItemInput = {
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  total: number;
  sell_price: number;
  unit_name?: string | null;
  base_quantity?: number | null;
  expiry_date?: string | null;
};

export type PurchaseInput = {
  supplier_id?: string | null;
  ref_no?: string | null;
  purchase_date?: string;
  branch_id?: string | null;
  pay_term_number?: number | null;
  pay_term_type?: string | null;
  status?: string;
  subtotal: number;
  tax: number;
  total: number;
  paid_amount: number;
  due_amount: number;
  payment_status: string;
  payment_method?: string | null;
  payment_account?: string | null;
  payment_note?: string | null;
  notes?: string | null;
  warehouse_id?: string | null;
  items: PurchaseItemInput[];
};

export function usePurchases() {
  const { user } = useAuth();
  const { currentWarehouseId } = useWarehouseContext();
  return useQuery({
    queryKey: ["purchases", currentWarehouseId ?? "all"],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("purchases")
        .select("*")
        .order("created_at", { ascending: false });
      if (currentWarehouseId) q = q.eq("warehouse_id", currentWarehouseId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePurchaseItems() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["purchase_items_all"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_items").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePurchaseReturns() {
  const { user } = useAuth();
  const { currentWarehouseId } = useWarehouseContext();
  return useQuery({
    queryKey: ["purchase_returns", currentWarehouseId ?? "all"],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("purchase_returns")
        .select("*")
        .order("return_date", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreatePurchase() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const { currentWarehouseId } = useWarehouseContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: PurchaseInput) => {
      const effectiveOwnerId = requireOwnerId(ownerId);
      let purchase_number = values.ref_no || "";
      if (!purchase_number) {
        const { data: numData, error: eNum } = await (supabase as any).rpc("next_doc_number", {
          _owner: effectiveOwnerId, _table: "purchases", _column: "purchase_number", _prefix: "P", _pad: 5,
        });
        if (eNum) throw friendlyDbError(eNum);
        purchase_number = numData as string;
      }
      const { items, ...header } = values;
      const whId = (header as any).warehouse_id ?? currentWarehouseId ?? null;
      const { data: p, error: e1 } = await (supabase.from("purchases") as any)
        .insert({
          ...header,
          purchase_number,
          owner_id: effectiveOwnerId,
          warehouse_id: whId,
          created_by: user!.id,
        })
        .select("id")
        .single();
      if (e1) throw friendlyDbError(e1);
      if (items.length) {
        const payload = items.map((it) => ({
          product_id: it.product_id,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount_percent: it.discount_percent,
          total: it.total,
          sell_price: it.sell_price,
          unit_name: it.unit_name || null,
          base_quantity: it.base_quantity ?? it.quantity,
          expiry_date: it.expiry_date || null,
          purchase_id: p.id,
        }));
        const { error: e2 } = await (supabase.from("purchase_items") as any).insert(payload);
        if (e2) throw e2;

        // Adjust per-warehouse stock (+) for purchases
        if (whId) {
          for (const it of items) {
            if (!it.product_id) continue;
            const baseQty = Number((it as any).base_quantity ?? it.quantity ?? 0);
            if (!baseQty) continue;
            await (supabase as any).rpc("adjust_warehouse_stock", {
              _owner: effectiveOwnerId,
              _product: it.product_id,
              _warehouse: whId,
              _delta: +baseQty,
            });
          }
        }
      }
      return p.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      qc.invalidateQueries({ queryKey: ["purchase_items_all"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("تم حفظ عملية الشراء");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeletePurchase() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const ownerId = useOwnerId();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await (supabase.from("purchases") as any).select("*").eq("id", id).maybeSingle();
      if (row && ownerId) {
        await (supabase.from("soft_deletes") as any).insert({
          owner_id: ownerId,
          entity_type: "purchase",
          entity_id: id,
          entity_label: row.ref_no ?? row.purchase_number ?? null,
          snapshot: row,
          deleted_by: user?.id ?? null,
        });
      }
      const { error } = await supabase.from("purchases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}


export function usePurchase(id: string | undefined) {
  return useQuery({
    queryKey: ["purchase", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("purchases").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function usePurchaseItemsOf(purchaseId: string | undefined) {
  return useQuery({
    queryKey: ["purchase_items", purchaseId],
    enabled: !!purchaseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_items").select("*").eq("purchase_id", purchaseId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<PurchaseInput> & { payment?: { amount: number; payment_method?: string; treasury_id?: string | null } } }) => {
      const { items, payment, ...header } = values as any;
      const { error } = await (supabase as any).rpc("update_purchase_invoice_transaction", {
        _purchase_id: id,
        _header: header,
        _items: items ?? [],
        _payment: payment ?? null,
      });
      if (error) throw friendlyDbError(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      qc.invalidateQueries({ queryKey: ["purchase_items_all"] });
      qc.invalidateQueries({ queryKey: ["purchase_items"] });
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

export function useUpdatePurchaseStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase.from("purchases") as any).update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      toast.success("تم تحديث الحالة");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export type PurchaseReturnItemInput = {
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  unit_name?: string | null;
  base_quantity?: number | null;
};

// Recompute due_amount/payment_status after a return is created/updated/deleted.
// A return reduces the effective total owed. If paid covers what's left → "paid".
async function recomputePurchasePaymentStatus(purchaseId: string) {
  try {
    const { data: p } = await (supabase.from("purchases") as any)
      .select("id,total,paid_amount").eq("id", purchaseId).maybeSingle();
    if (!p) return;
    const { data: rets } = await (supabase.from("purchase_returns") as any)
      .select("total_amount").eq("purchase_id", purchaseId);
    const total = Number(p.total) || 0;
    const paid = Number(p.paid_amount) || 0;
    const returnsSum = (rets ?? []).reduce(
      (s: number, r: any) => s + (Number(r.total_amount) || 0), 0,
    );
    const effective = Math.max(0, total - returnsSum);
    const newDue = Math.max(0, effective - paid);
    const status = newDue <= 1e-6
      ? "paid"
      : paid > 0 ? "partial" : "pending";
    await (supabase.from("purchases") as any)
      .update({ due_amount: newDue, payment_status: status })
      .eq("id", purchaseId);
  } catch (err) {
    console.warn("recomputePurchasePaymentStatus failed", err);
  }
}

export function useCreatePurchaseReturn() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const { currentWarehouseId } = useWarehouseContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      purchase_id: string;
      ref_no?: string | null;
      return_date?: string;
      total_amount: number;
      items: PurchaseReturnItemInput[];
    }) => {
      const effectiveOwnerId = requireOwnerId(ownerId);
      const { items, ...header } = values;
      // resolve warehouse from the original purchase, fallback to current ctx
      let whId: string | null = currentWarehouseId ?? null;
      const { data: parent } = await (supabase.from("purchases") as any)
        .select("warehouse_id").eq("id", header.purchase_id).maybeSingle();
      if (parent?.warehouse_id) whId = parent.warehouse_id;
      const { data: r, error: e1 } = await (supabase.from("purchase_returns") as any)
        .insert({
          ...header,
          owner_id: effectiveOwnerId,
          created_by: user!.id,
        })
        .select("id")
        .single();
      if (e1) throw friendlyDbError(e1);
      if (items.length) {
        const { error: e2 } = await (supabase.from("purchase_return_items") as any)
          .insert(items.map((it) => ({ ...it, purchase_return_id: r.id })));
        if (e2) throw e2;
        // Decrement per-warehouse stock for returned items
        if (whId) {
          for (const it of items) {
            if (!it.product_id) continue;
            const baseQty = Number((it as any).base_quantity ?? it.quantity ?? 0);
            if (!baseQty) continue;
            await (supabase as any).rpc("adjust_warehouse_stock", {
              _owner: effectiveOwnerId,
              _product: it.product_id,
              _warehouse: whId,
              _delta: -baseQty,
            });
          }
        }
      }
      await recomputePurchasePaymentStatus(values.purchase_id);
      return r.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase_returns"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      toast.success("تم حفظ المرتجع");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdatePurchaseReturn() {
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      id: string;
      purchase_id: string;
      ref_no?: string | null;
      return_date?: string;
      total_amount: number;
      items: PurchaseReturnItemInput[];
    }) => {
      const { id, items, ...header } = values;
      const { error: e1 } = await (supabase.from("purchase_returns") as any)
        .update({ ...header, owner_id: requireOwnerId(ownerId) }).eq("id", id);
      if (e1) throw friendlyDbError(e1);
      const { error: eDel } = await (supabase.from("purchase_return_items") as any)
        .delete().eq("purchase_return_id", id);
      if (eDel) throw eDel;
      if (items.length) {
        const { error: e2 } = await (supabase.from("purchase_return_items") as any)
          .insert(items.map((it) => ({ ...it, purchase_return_id: id })));
        if (e2) throw e2;
      }
      await recomputePurchasePaymentStatus(values.purchase_id);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase_returns"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      toast.success("تم تحديث المرتجع");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}



export function useAddPurchasePayment() {
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      purchase: any;
      amount: number;
      treasury_id: string;
      payment_method?: string;
      note?: string | null;
      transaction_date?: string;
    }) => {
      const total = Number(args.purchase.total || 0);
      const oldPaid = Number(args.purchase.paid_amount || 0);
      const remaining = Math.max(0, total - oldPaid);
      const amt = Number(args.amount || 0);
      if (amt <= 0) throw new Error("المبلغ يجب أن يكون أكبر من صفر");

      const ownerIdResolved = requireOwnerId(ownerId);
      const supplierId = args.purchase.supplier_id;
      let treasuryAccountId = args.treasury_id;
      {
        const { data: treasuryRow } = await (supabase.from("treasuries") as any)
          .select("id, account_id")
          .eq("id", args.treasury_id)
          .maybeSingle();
        if ((treasuryRow as any)?.account_id) {
          treasuryAccountId = (treasuryRow as any).account_id;
        }
      }

      // Fallback (no supplier): legacy direct treasury path
      if (!supplierId) {
        const { error: e1 } = await (supabase.from("treasury_transactions") as any).insert({
          owner_id: ownerIdResolved,
          treasury_id: args.treasury_id,
          amount: amt,
          type: "out",
          description: args.note ?? `دفعة لفاتورة الشراء ${args.purchase.purchase_number || args.purchase.ref_no || ""}`.trim(),
          reference: args.purchase.id,
          transaction_date: args.transaction_date ?? new Date().toISOString().slice(0, 10),
        });
        if (e1) throw friendlyDbError(e1);
        const applyToThis = Math.min(amt, remaining);
        const newPaid = oldPaid + applyToThis;
        const newDue = Math.max(0, total - newPaid);
        const status = newPaid >= total - 1e-6 ? "paid" : newPaid > 0 ? "partial" : "pending";
        await (supabase.from("purchases") as any)
          .update({ paid_amount: newPaid, due_amount: newDue, payment_status: status, payment_method: args.payment_method ?? args.purchase.payment_method })
          .eq("id", args.purchase.id);
        await recomputePurchasePaymentStatus(args.purchase.id);
        return { surplus: 0 };
      }

      const applyToThis = Math.min(amt, remaining);

      // 1) Insert contact_payments row (trigger sync_contact_payment_to_accounting
      //    handles treasury movement + accounting entry automatically).
      const refNo = `PAY-${Date.now().toString(36).toUpperCase()}`;
      const { data: payRow, error: ePay } = await (supabase.from("contact_payments") as any)
        .insert({
          owner_id: ownerIdResolved,
          contact_id: supplierId,
          contact_type: "supplier",
          direction: "out",
          amount: amt,
          allocated_amount: applyToThis,
          payment_method: args.payment_method ?? "cash",
          treasury_account_id: treasuryAccountId,
          ref_no: refNo,
          notes: args.note ?? `دفعة لفاتورة الشراء ${args.purchase.purchase_number || args.purchase.ref_no || ""}`.trim(),
          payment_date: args.transaction_date ?? new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (ePay) throw friendlyDbError(ePay);

      // 2) Apply to the selected purchase first
      if (applyToThis > 0) {
        const newPaid = oldPaid + applyToThis;
        const newDue = Math.max(0, total - newPaid);
        const status = newPaid >= total - 1e-6 ? "paid" : newPaid > 0 ? "partial" : "pending";
        const { error: e2 } = await (supabase.from("purchases") as any)
          .update({
            paid_amount: newPaid,
            due_amount: newDue,
            payment_status: status,
            payment_method: args.payment_method ?? args.purchase.payment_method,
          })
          .eq("id", args.purchase.id);
        if (e2) throw friendlyDbError(e2);

        await (supabase.from("contact_payment_invoice_allocations") as any).insert({
          owner_id: ownerIdResolved,
          contact_payment_id: payRow.id,
          document_type: "purchase",
          document_id: args.purchase.id,
          allocated_amount: applyToThis,
        });
      }

      await recomputePurchasePaymentStatus(args.purchase.id);

      // 3) Distribute any surplus across other open purchases (oldest first)
      const surplus = Math.max(0, amt - applyToThis);
      try {
        const { resettleContactDebt } = await import("@/lib/debt-allocation.functions");
        await resettleContactDebt({ data: { contact_id: supplierId, direction: "out" } });
      } catch (err) {
        console.warn("resettleContactDebt (supplier) failed", err);
      }
      return { surplus };
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      qc.invalidateQueries({ queryKey: ["contact-payments"] });
      qc.invalidateQueries({ queryKey: ["contact-view"] });
      qc.invalidateQueries({ queryKey: ["purchase_items_all"] });
      qc.invalidateQueries({ queryKey: ["treasuries"] });
      qc.invalidateQueries({ queryKey: ["account-balances"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      if (res?.surplus && res.surplus > 0.001) {
        toast.success(`تم تسجيل الدفعة وتوزيع ${res.surplus.toFixed(2)} على فواتير المورد الأخرى`);
      } else {
        toast.success("تم تسجيل الدفعة");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function usePurchasePayments(purchaseId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["purchase_payments", purchaseId],
    enabled: !!user && !!purchaseId,
    queryFn: async () => {
      const [txRes, allocRes] = await Promise.all([
        (supabase.from("treasury_transactions") as any)
          .select("*")
          .eq("reference", purchaseId)
          .order("created_at", { ascending: false }),
        (supabase.from("contact_payment_invoice_allocations") as any)
          .select("*, contact_payments(*)")
          .eq("document_type", "purchase")
          .eq("document_id", purchaseId),
      ]);
      if (txRes.error) throw txRes.error;

      const txRows = (txRes.data ?? []) as any[];
      const allocRows = (allocRes.data ?? []) as any[];
      const cpFromAlloc = allocRows.map((a) => ({
        ...(a.contact_payments ?? {}),
        source: "contact_payment",
        allocated_amount: a.allocated_amount,
      }));

      const merged = [
        ...txRows.map((t) => ({ ...t, source: "treasury" as const })),
        ...cpFromAlloc,
      ];
      merged.sort((a, b) => String(b.created_at || b.payment_date || b.transaction_date).localeCompare(String(a.created_at || a.payment_date || a.transaction_date)));
      return merged;
    },
  });
}


