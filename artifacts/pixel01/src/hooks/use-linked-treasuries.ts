import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { isDebitNature } from "@/hooks/use-accounts";

export type LinkedTreasury = {
  id: string;
  account_id: string;
  name: string;
  balance: number;
  currency: string;
  is_default_cash: boolean;
};

export function pickDefaultLinkedTreasuryId(list: LinkedTreasury[]): string {
  const def = list.find((t) => t.is_default_cash) ?? list[0];
  return def?.id ?? "";
}

export function useLinkedTreasuries() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  return useQuery({
    queryKey: ["linked-treasuries", ownerId],
    enabled: !!user && !!ownerId,
    queryFn: async (): Promise<LinkedTreasury[]> => {
      const { data, error } = await supabase
        .from("accounts" as any)
        .select("id,name,opening_balance,account_type,is_cash_equivalent,is_closed,is_default_cash,account_balances(total_debit,total_credit)")
        .eq("is_cash_equivalent", true)
        .eq("is_closed", false)
        .order("is_default_cash", { ascending: false })
        .order("name");
      if (error) throw error;
      const accounts = (data ?? []) as any[];

      const accountIds = accounts.map((a) => a.id);
      let treasuryByAccount: Record<string, { id: string; currency: string }> = {};
      if (accountIds.length > 0) {
        let tq = (supabase.from("treasuries") as any)
          .select("id,account_id,currency")
          .in("account_id", accountIds);
        if (ownerId) tq = tq.eq("owner_id", ownerId);
        const { data: tdata } = await tq;
        for (const t of (tdata ?? []) as any[]) {
          if (t.account_id) treasuryByAccount[t.account_id] = { id: t.id, currency: t.currency || "EGP" };
        }
      }

      return accounts
        .map((a) => {
          const agg = Array.isArray(a.account_balances) ? a.account_balances[0] : a.account_balances;
          const d = Number(agg?.total_debit) || 0;
          const c = Number(agg?.total_credit) || 0;
          const opening = Number(a.opening_balance) || 0;
          const balance = isDebitNature(a.account_type)
            ? opening + d - c
            : opening + c - d;
          const linked = treasuryByAccount[a.id];
          return {
            id: linked?.id ?? "",
            account_id: a.id as string,
            name: a.name as string,
            balance,
            currency: linked?.currency ?? "EGP",
            is_default_cash: !!a.is_default_cash,
          };
        })
        .filter((row) => row.id)
        .sort((a, b) => {
          if (a.is_default_cash && !b.is_default_cash) return -1;
          if (!a.is_default_cash && b.is_default_cash) return 1;
          return a.name.localeCompare(b.name, "ar");
        });
    },
  });
}

/** @deprecated Use useLinkedTreasuries — kept for existing imports from use-invoices / use-payroll */
export function useTreasuries() {
  return useLinkedTreasuries();
}

export function useDefaultLinkedTreasury() {
  const q = useLinkedTreasuries();
  const def = q.data?.find((t) => t.is_default_cash) ?? q.data?.[0];
  return { ...q, data: def };
}
