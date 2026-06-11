import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type ContactBalance = {
  total_sales: number;        // sum of sale invoice totals
  unpaid_sales: number;       // sum of (total - paid_amount) for sale invoices
  sales_returns: number;      // sum of sale_return invoice totals
  total_purchases: number;    // sum of purchase totals
  unpaid_purchases: number;   // sum of due_amount from purchases
  purchase_returns: number;   // sum of purchase_return totals
  payments_in: number;        // contact_payments direction='in' (received from contact)
  payments_out: number;       // contact_payments direction='out' (paid to contact)
};

const empty: ContactBalance = {
  total_sales: 0,
  unpaid_sales: 0,
  sales_returns: 0,
  total_purchases: 0,
  unpaid_purchases: 0,
  purchase_returns: 0,
  payments_in: 0,
  payments_out: 0,
};

export function useContactBalances() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const channelName = `contact-balances-unified-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase.channel(channelName);
    channel
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "contact_payments" }, () => {
        qc.invalidateQueries({ queryKey: ["contact-balances"] });
        qc.invalidateQueries({ queryKey: ["contacts"] });
      })
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "invoices" }, () => {
        qc.invalidateQueries({ queryKey: ["contact-balances"] });
      })
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "purchases" }, () => {
        qc.invalidateQueries({ queryKey: ["contact-balances"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  return useQuery({
    queryKey: ["contact-balances"],
    enabled: !!user,
    staleTime: 0,
    queryFn: async () => {
      const map = new Map<string, ContactBalance>();
      const get = (id: string) => {
        let v = map.get(id);
        if (!v) {
          v = { ...empty };
          map.set(id, v);
        }
        return v;
      };

      const fetchAll = async (build: (from: number, to: number) => any) => {
        const out: any[] = [];
        const page = 1000;
        for (let i = 0; ; i++) {
          const from = i * page;
          const to = from + page - 1;
          const { data, error } = await build(from, to);
          if (error) throw error;
          const rows = (data ?? []) as any[];
          out.push(...rows);
          if (rows.length < page) break;
        }
        return out;
      };

      // 1. Invoices (Sales & Sales Returns)
      const invs = await fetchAll((from, to) =>
        supabase.from("invoices")
          .select("customer_id,type,total,paid_amount,status")
          .range(from, to),
      );
      for (const r of invs as any[]) {
        if (!r.customer_id) continue;
        if (r.status === "cancelled") continue;
        const v = get(r.customer_id);
        const total = Math.abs(Number(r.total ?? 0));
        if (r.type === "sale") {
          v.total_sales += total;
          const paid = Math.abs(Number(r.paid_amount ?? 0));
          v.unpaid_sales += total - paid;
        } else if (r.type === "sale_return") {
          v.sales_returns += total;
        }
      }

      // 2. Purchases (separate table, separate contact field)
      const pur = await fetchAll((from, to) =>
        supabase.from("purchases").select("supplier_id,due_amount,total").range(from, to),
      );
      for (const r of pur as any[]) {
        if (!r.supplier_id) continue;
        const v = get(r.supplier_id);
        v.total_purchases += Math.abs(Number(r.total ?? 0));
        v.unpaid_purchases += Math.abs(Number(r.due_amount ?? 0));
      }

      // 3. Purchase Returns
      const rets2 = await fetchAll((from, to) =>
        supabase.from("purchase_returns").select("total_amount,purchase_id").range(from, to),
      );
      const ids = Array.from(new Set(rets2.map((r: any) => r.purchase_id).filter(Boolean)));
      const supMap = new Map<string, string>();
      if (ids.length) {
        for (let i = 0; i < ids.length; i += 500) {
          const slice = ids.slice(i, i + 500);
          const { data: ps } = await supabase.from("purchases").select("id,supplier_id").in("id", slice);
          for (const p of (ps ?? []) as any[]) supMap.set(p.id, p.supplier_id);
        }
      }
      for (const r of rets2 as any[]) {
        const sid = supMap.get(r.purchase_id);
        if (!sid) continue;
        get(sid).purchase_returns += Math.abs(Number(r.total_amount ?? 0));
      }

      // 4. Contact Payments (standalone payments, NOT invoice paid_amount)
      const pays = await fetchAll((from, to) =>
        supabase.from("contact_payments")
          .select("contact_id,amount,direction,is_reversal,reversed_amount")
          .range(from, to),
      );
      for (const p of pays as any[]) {
        if (!p.contact_id) continue;
        // Skip explicit reversal rows; a reversed payment is reflected through
        // its own `reversed_amount` on the original row (subtracted below) so we
        // never count the reversal twice.
        if (p.is_reversal) continue;
        // Effective amount = what still applies after any reversal. When an
        // invoice is converted back to آجل, the portion of this payment that
        // funded it is marked reversed, so it stops reducing the customer's
        // due (the money is returned to the customer's account).
        const amount = Math.max(
          0,
          Math.abs(Number(p.amount ?? 0)) - Math.abs(Number(p.reversed_amount ?? 0)),
        );
        const v = get(p.contact_id);
        if (p.direction === "in") {
          v.payments_in += amount;
        } else if (p.direction === "out") {
          v.payments_out += amount;
        }
      }

      return map;
    },
  });
}

/**
 * Compute the unified net balance for a contact.
 *
 * Standard accounting perspective (from OUR point of view):
 *   What the contact OWES us (DEBIT to contact):
 *     + Sales Invoices (they bought from us)
 *     + Purchase Returns (we returned goods, they owe us refund)
 *     + Payments Out (we paid them — but this actually reduces what we owe, so it's a debit)
 *
 *   What WE OWE the contact (CREDIT to contact):
 *     + Purchase Invoices (we bought from them)
 *     + Sales Returns (they returned goods, we owe them refund)
 *     + Payments In (they paid us — reduces what they owe, credit)
 *
 * Net Balance = Opening + (Sales + PurchaseReturns + PaymentsOut) - (Purchases + SalesReturns + PaymentsIn)
 * If positive → contact owes us (العميل مدين)
 * If negative → we owe contact (المورد دائن)
 */
export function computeContactDue(
  contact: any,
  bal: ContactBalance | undefined
) {
  const b = bal ?? empty;
  const opening = Number(contact?.opening_balance ?? 0);
  const manualAdvance = Number(contact?.advance_balance ?? 0);

  const gross =
    opening
    + b.total_sales
    + b.purchase_returns
    + b.payments_out
    - b.total_purchases
    - b.sales_returns
    - b.payments_in
    - manualAdvance;

  return {
    gross,
    due: Math.max(0, gross),
    credit: Math.max(0, -gross),
    totalCredit: manualAdvance + Math.max(0, -gross),
  };
}
