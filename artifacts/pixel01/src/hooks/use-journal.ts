import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { toast } from "sonner";

export type JournalLineInput = { account_id: string; debit: number; credit: number };

async function ensureSystemEquityAccount(ownerId: string): Promise<string> {
  const { data: existing, error: e1 } = await (supabase.from("accounts") as any)
    .select("id")
    .eq("owner_id", ownerId)
    .eq("is_system", true)
    .eq("account_type", "Equity")
    .maybeSingle();
  if (e1) throw e1;
  if (existing?.id) return existing.id as string;

  const { data: created, error: e2 } = await (supabase.from("accounts") as any)
    .insert({
      owner_id: ownerId,
      created_by: ownerId,
      name: "أرصدة افتتاحية",
      account_number: "OPEN-EQ",
      account_type: "Equity",
      sub_account_type: "حقوق الملكية",
      opening_balance: 0,
      is_system: true,
      details: [],
    })
    .select("id")
    .single();
  if (e2) throw e2;
  return created.id as string;
}

export function usePostJournalEntry() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      entry_date: string;
      description?: string | null;
      ref_no?: string | null;
      payment_method?: string | null;
      note?: string | null;
      source_type?: string;
      source_id?: string | null;
      lines: JournalLineInput[];
    }) => {
      if (!user) throw new Error("Not authenticated");
      const totalDebit = input.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
      const totalCredit = input.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.0001) {
        throw new Error("القيد غير متوازن (المدين ≠ الدائن)");
      }

      const { data: entry, error: e1 } = await (supabase.from("journal_entries") as any)
        .insert({
          owner_id: ownerId ?? user.id,
          created_by: user.id,
          entry_date: input.entry_date,
          description: input.description ?? null,
          ref_no: input.ref_no ?? null,
          payment_method: input.payment_method ?? null,
          note: input.note ?? null,
          source_type: input.source_type ?? "manual",
          source_id: input.source_id ?? null,
        })
        .select("id")
        .single();
      if (e1) throw e1;

      const { error: e2 } = await (supabase.from("journal_entry_lines") as any)
        .insert(input.lines.map((l) => ({
          journal_entry_id: entry.id,
          account_id: l.account_id,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        })));
      if (e2) throw e2;
      return entry.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
    },
  });
}

export function useOpeningDeposit() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const post = usePostJournalEntry();
  return useMutation({
    mutationFn: async (input: {
      account_id: string;
      account_type: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
      amount: number;
      entry_date: string;
      payment_method?: string | null;
      note?: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const amt = Number(input.amount);
      if (!amt || amt <= 0) throw new Error("المبلغ مطلوب");

      const equityId = await ensureSystemEquityAccount(ownerId ?? user.id);
      const isDebitNature = input.account_type === "Asset" || input.account_type === "Expense";

      const lines: JournalLineInput[] = isDebitNature
        ? [
            { account_id: input.account_id, debit: amt, credit: 0 },
            { account_id: equityId, debit: 0, credit: amt },
          ]
        : [
            { account_id: equityId, debit: amt, credit: 0 },
            { account_id: input.account_id, debit: 0, credit: amt },
          ];

      return post.mutateAsync({
        entry_date: input.entry_date,
        description: "إيداع افتتاحي",
        payment_method: input.payment_method ?? null,
        note: input.note ?? null,
        source_type: "opening_deposit",
        lines,
      });
    },
    onSuccess: () => toast.success("تم تسجيل الإيداع الافتتاحي"),
    onError: (e: any) => toast.error(e?.message || "تعذر تسجيل الإيداع"),
  });
}

export function useFinancialTransfer() {
  const post = usePostJournalEntry();
  return useMutation({
    mutationFn: async (input: {
      from_account_id: string;
      to_account_id: string;
      amount: number;
      entry_date: string;
      payment_method?: string | null;
      note?: string | null;
    }) => {
      const amt = Number(input.amount);
      if (!amt || amt <= 0) throw new Error("المبلغ مطلوب");
      if (input.from_account_id === input.to_account_id) throw new Error("الحساب المصدر والوجهة متطابقان");
      return post.mutateAsync({
        entry_date: input.entry_date,
        description: "تحويل مالي",
        payment_method: input.payment_method ?? null,
        note: input.note ?? null,
        source_type: "transfer",
        lines: [
          { account_id: input.to_account_id, debit: amt, credit: 0 },
          { account_id: input.from_account_id, debit: 0, credit: amt },
        ],
      });
    },
    onSuccess: () => toast.success("تم التحويل المالي"),
    onError: (e: any) => toast.error(e?.message || "تعذر التحويل"),
  });
}
