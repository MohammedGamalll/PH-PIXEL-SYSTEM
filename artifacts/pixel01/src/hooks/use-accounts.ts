import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { toast } from "sonner";

export type AccountType = "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";

export type AccountDetailKV = { label: string; value: string };

export type AccountRow = {
  id: string;
  owner_id: string;
  name: string;
  account_number: string;
  account_type: AccountType;
  sub_account_type: string | null;
  opening_balance: number;
  note: string | null;
  details: AccountDetailKV[];
  is_closed: boolean;
  is_system: boolean;
  is_cash_equivalent?: boolean;
  is_default_cash?: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};


export type AccountWithBalance = AccountRow & { balance: number };

export const DEBIT_TYPES: AccountType[] = ["Asset", "Expense"];

export function isDebitNature(t: AccountType) {
  return DEBIT_TYPES.includes(t);
}

const PAYMENT_ASSET_SUBTYPES = [
  "الأصول المتداولة",
  "Current Assets",
  // legacy fallbacks (in case any account was tagged with cash/bank wording)
  "نقدية",
  "بنوك",
  "نقدية وبنوك",
  "Cash",
  "Bank",
  "Cash & Bank",
  "Cash and Bank",
];

export function usePaymentAccounts() {
  const all = useAccounts();
  const list = (all.data ?? []).filter((a) => {
    if (a.is_closed) return false;
    if (a.account_type !== "Asset") return false;
    const sub = (a.sub_account_type || "").trim();
    if (!sub) return true; // unclassified asset → allowed
    return PAYMENT_ASSET_SUBTYPES.includes(sub);
  });
  // Sort: default cash first, then by account_number
  list.sort((a, b) => {
    if (a.is_default_cash && !b.is_default_cash) return -1;
    if (!a.is_default_cash && b.is_default_cash) return 1;
    return (a.account_number || "").localeCompare(b.account_number || "");
  });
  return { ...all, data: list };
}

export function useDefaultCashAccount() {
  const { data: accounts = [], ...rest } = usePaymentAccounts();
  const def = accounts.find((a) => a.is_default_cash) ?? accounts[0];
  return { ...rest, data: def };
}


export function useAccounts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["accounts"],
    enabled: !!user,
    queryFn: async (): Promise<AccountWithBalance[]> => {
      const { data: accounts, error } = await (supabase.from("accounts") as any)
        .select("*, account_balances(total_debit,total_credit)")
        .order("account_number", { ascending: true });
      if (error) throw error;

      return ((accounts ?? []) as any[]).map((a) => {
        const agg = Array.isArray(a.account_balances) ? a.account_balances[0] : a.account_balances;
        const d = Number(agg?.total_debit) || 0;
        const c = Number(agg?.total_credit) || 0;
        const opening = Number(a.opening_balance) || 0;
        const balance = isDebitNature(a.account_type)
          ? opening + d - c
          : opening + c - d;
        const { account_balances: _ab, ...rest } = a;
        return { ...rest, details: Array.isArray(rest.details) ? rest.details : [], balance } as AccountWithBalance;
      });
    },
  });
}

export type AccountInput = {
  name: string;
  account_number: string;
  account_type: AccountType;
  sub_account_type?: string | null;
  opening_balance?: number;
  note?: string | null;
  details?: AccountDetailKV[];
};

export function useCreateAccount() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AccountInput) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await (supabase.from("accounts") as any)
        .insert({
          owner_id: ownerId ?? user.id,
          created_by: user.id,
          name: input.name,
          account_number: input.account_number,
          account_type: input.account_type,
          sub_account_type: input.sub_account_type ?? null,
          opening_balance: input.opening_balance ?? 0,
          note: input.note ?? null,
          details: input.details ?? [],
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("تمت إضافة الحساب");
    },
    onError: (e: any) => toast.error(e?.message || "تعذر إضافة الحساب"),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AccountInput> & { is_closed?: boolean } }) => {
      const { error } = await (supabase.from("accounts") as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("تم التحديث");
    },
    onError: (e: any) => toast.error(e?.message || "تعذر التحديث"),
  });
}

export function useCloseAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("accounts") as any).update({ is_closed: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("تم إغلاق الحساب");
    },
    onError: (e: any) => toast.error(e?.message || "تعذر إغلاق الحساب"),
  });
}
