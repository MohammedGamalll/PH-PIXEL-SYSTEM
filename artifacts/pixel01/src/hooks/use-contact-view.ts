import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { requireOwnerId } from "@/lib/db-errors";
import { toast } from "sonner";

export function useContactPurchases(contactId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["contact-purchases", contactId],
    enabled: !!user && !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("*")
        .eq("supplier_id", contactId!)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useContactInvoices(contactId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["contact-invoices", contactId],
    enabled: !!user && !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("customer_id", contactId!)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useContactPayments(contactId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["contact-payments", contactId],
    enabled: !!user && !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_payments")
        .select("*")
        .eq("contact_id", contactId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      // Attach original_ref_no for reversal rows so UI can show the real ref instead of slice(0,8)
      const origIds = Array.from(new Set(rows.filter((r) => r.original_payment_id).map((r) => r.original_payment_id)));
      if (origIds.length) {
        const { data: origs } = await supabase
          .from("contact_payments")
          .select("id,ref_no")
          .in("id", origIds);
        const refMap = new Map((origs ?? []).map((o: any) => [o.id, o.ref_no]));
        for (const r of rows) {
          if (r.original_payment_id) (r as any).original_ref_no = refMap.get(r.original_payment_id) ?? null;
        }
      }
      return rows;
    },
  });
}

export type ContactStockRow = {
  product_id: string | null;
  name: string;
  sku: string;
  purchased_qty: number;
  sold_qty: number;
  returned_qty: number;
  current_stock: number;
  stock_value: number;
};

export function useContactPurchaseStock(contactId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["contact-purchase-stock", contactId],
    enabled: !!user && !!contactId,
    queryFn: async () => {
      const { data: purs } = await supabase
        .from("purchases")
        .select("id")
        .eq("supplier_id", contactId!);
      const purIds = (purs ?? []).map((p: any) => p.id);
      if (!purIds.length) return [] as ContactStockRow[];

      const { data: items, error } = await supabase
        .from("purchase_items")
        .select("product_id,description,quantity")
        .in("purchase_id", purIds);
      if (error) throw error;

      const map = new Map<string, ContactStockRow>();
      for (const it of (items ?? []) as any[]) {
        const key = it.product_id ?? `desc:${it.description}`;
        const v = map.get(key) ?? {
          product_id: it.product_id ?? null,
          name: it.description,
          sku: "",
          purchased_qty: 0,
          sold_qty: 0,
          returned_qty: 0,
          current_stock: 0,
          stock_value: 0,
        };
        v.purchased_qty += Number(it.quantity ?? 0);
        map.set(key, v);
      }

      const productIds = Array.from(map.values())
        .map((v) => v.product_id)
        .filter((x): x is string => !!x);

      if (productIds.length) {
        const [prodsRes, retsRes, invRes] = await Promise.all([
          supabase.from("products").select("id,name,sku,stock,cost").in("id", productIds),
          supabase
            .from("purchase_return_items")
            .select("product_id,quantity,purchase_returns!inner(purchase_id)")
            .in("purchase_returns.purchase_id" as any, purIds),
          supabase.from("invoice_items").select("product_id,quantity").in("product_id", productIds),
        ]);

        for (const p of ((prodsRes.data ?? []) as any[])) {
          const v = map.get(p.id);
          if (v) {
            v.name = p.name ?? v.name;
            v.sku = p.sku ?? "";
            v.current_stock = Number(p.stock ?? 0);
            v.stock_value = Number(p.stock ?? 0) * Number(p.cost ?? 0);
          }
        }
        for (const r of ((retsRes.data ?? []) as any[])) {
          if (!r.product_id) continue;
          const v = map.get(r.product_id);
          if (v) v.returned_qty += Number(r.quantity ?? 0);
        }
        for (const s of ((invRes.data ?? []) as any[])) {
          if (!s.product_id) continue;
          const v = map.get(s.product_id);
          if (v) v.sold_qty += Number(s.quantity ?? 0);
        }
      }

      return Array.from(map.values());
    },
  });
}

export function useContactDocuments(contactId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["contact-documents", contactId],
    enabled: !!user && !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_documents" as any)
        .select("*")
        .eq("contact_id", contactId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUploadContactDocument() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, title, file }: { contactId: string; title: string; file: File }) => {
      const oid = requireOwnerId(ownerId);
      const path = `${oid}/${contactId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("contact-documents").upload(path, file);
      if (upErr) throw upErr;
      const { error } = await (supabase.from("contact_documents") as any).insert({
        contact_id: contactId,
        title: title || file.name,
        file_path: path,
        file_type: file.type,
        uploaded_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-documents"] });
      toast.success("تم رفع المستند");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteContactDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file_path }: { id: string; file_path: string }) => {
      await supabase.storage.from("contact-documents").remove([file_path]);
      const { error } = await supabase.from("contact_documents" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-documents"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useContactActivities(contactId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["contact-activities", contactId],
    enabled: !!user && !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_activity_log" as any)
        .select("*")
        .eq("subject_id", contactId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSystemLedger(scope: "customer" | "supplier" | "both") {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["system-ledger", scope],
    enabled: !!user,
    queryFn: async () => {
      if (scope === "customer") {
        const [inv, pay, contacts] = await Promise.all([
          supabase.from("invoices").select("*").order("created_at", { ascending: false }).limit(1000),
          supabase.from("contact_payments").select("*").order("created_at", { ascending: false }).limit(1000),
          supabase.from("contacts").select("id,first_name,last_name,business_name,type"),
        ]);
        return {
          invoices: (inv.data ?? []) as any[],
          purchases: [] as any[],
          payments: ((pay.data ?? []) as any[]).filter((p) => {
            const c = (contacts.data ?? []).find((x: any) => x.id === p.contact_id);
            return c?.type === "customer" || c?.type === "both";
          }),
          contacts: (contacts.data ?? []) as any[],
        };
      } else if (scope === "supplier") {
        const [pur, pay, contacts] = await Promise.all([
          supabase.from("purchases").select("*").order("created_at", { ascending: false }).limit(1000),
          supabase.from("contact_payments").select("*").order("created_at", { ascending: false }).limit(1000),
          supabase.from("contacts").select("id,first_name,last_name,business_name,type"),
        ]);
        return {
          invoices: [] as any[],
          purchases: (pur.data ?? []) as any[],
          payments: ((pay.data ?? []) as any[]).filter((p) => {
            const c = (contacts.data ?? []).find((x: any) => x.id === p.contact_id);
            return c?.type === "supplier" || c?.type === "both";
          }),
          contacts: (contacts.data ?? []) as any[],
        };
      } else {
        const [inv, pur, pay, contacts] = await Promise.all([
          supabase.from("invoices").select("*").order("created_at", { ascending: false }).limit(1000),
          supabase.from("purchases").select("*").order("created_at", { ascending: false }).limit(1000),
          supabase.from("contact_payments").select("*").order("created_at", { ascending: false }).limit(1000),
          supabase.from("contacts").select("id,first_name,last_name,business_name,type"),
        ]);
        return {
          invoices: (inv.data ?? []) as any[],
          purchases: (pur.data ?? []) as any[],
          payments: (pay.data ?? []) as any[],
          contacts: (contacts.data ?? []) as any[],
        };
      }
    },
  });
}

// Items the customer purchased (sale invoices) — flat list with computed discount %.
export function useContactInvoiceItems(contactId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["contact-invoice-items", contactId],
    enabled: !!user && !!contactId,
    queryFn: async () => {
      const { data: invs } = await supabase
        .from("invoices")
        .select("id,invoice_number,issue_date,created_at,type,status,tax,subtotal")
        .eq("customer_id", contactId!)
        .neq("status", "cancelled");
      const ids = (invs ?? []).map((i: any) => i.id);
      if (!ids.length) return [] as any[];
      const { data: items } = await supabase
        .from("invoice_items")
        .select("invoice_id,product_id,description,quantity,unit_price,discount_amount,total")
        .in("invoice_id", ids);
      const invMap = new Map((invs ?? []).map((i: any) => [i.id, i]));
      return ((items ?? []) as any[]).map((it) => {
        const inv = invMap.get(it.invoice_id) || ({} as any);
        const qty = Number(it.quantity ?? 0);
        const unit = Number(it.unit_price ?? 0);
        const disc = Number(it.discount_amount ?? 0);
        const gross = unit * qty;
        const discPct = gross > 0 ? (disc / gross) * 100 : 0;
        const inclusive = qty > 0 ? (gross - disc) / qty : unit;
        const total = Number(it.total ?? gross - disc);
        const taxAmt = Number(inv.subtotal ?? 0) > 0
          ? (Number(inv.tax ?? 0) * total) / Number(inv.subtotal ?? 1)
          : 0;
        return {
          invoice_id: it.invoice_id,
          ref_number: inv.invoice_number,
          issue_date: inv.issue_date,
          created_at: inv.created_at,
          product_id: it.product_id,
          description: it.description,
          quantity: qty,
          unit_price: unit,
          discount_pct: discPct,
          tax: taxAmt,
          inclusive_unit: inclusive,
          total,
        };
      });
    },
  });
}

export function useContactPurchaseItems(contactId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["contact-purchase-items", contactId],
    enabled: !!user && !!contactId,
    queryFn: async () => {
      const { data: purs } = await supabase
        .from("purchases")
        .select("id,purchase_number,issue_date,created_at,status,tax,subtotal")
        .eq("supplier_id", contactId!);
      const ids = (purs ?? []).map((p: any) => p.id);
      if (!ids.length) return [] as any[];
      const { data: items, error: itemsErr } = await supabase
        .from("purchase_items")
        .select("purchase_id,product_id,description,quantity,unit_price,discount_percent,total")
        .in("purchase_id", ids);
      if (itemsErr) throw itemsErr;
      const pMap = new Map((purs ?? []).map((p: any) => [p.id, p]));
      return ((items ?? []) as any[]).map((it) => {
        const pur = pMap.get(it.purchase_id) || ({} as any);
        const qty = Number(it.quantity ?? 0);
        const unit = Number(it.unit_price ?? 0);
        const discPct = Number(it.discount_percent ?? 0);
        const gross = unit * qty;
        const disc = gross * (discPct / 100);
        const inclusive = qty > 0 ? (gross - disc) / qty : unit;
        const total = Number(it.total ?? gross - disc);
        const taxAmt = Number(pur.subtotal ?? 0) > 0
          ? (Number(pur.tax ?? 0) * total) / Number(pur.subtotal ?? 1)
          : 0;
        return {
          purchase_id: it.purchase_id,
          ref_number: pur.purchase_number,
          issue_date: pur.issue_date,
          created_at: pur.created_at,
          product_id: it.product_id,
          description: it.description,
          quantity: qty,
          unit_price: unit,
          discount_pct: discPct,
          tax: taxAmt,
          inclusive_unit: inclusive,
          total,
        };
      });
    },
  });
}

