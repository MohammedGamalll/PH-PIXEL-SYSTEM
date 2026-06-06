import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type LedgerRow = {
  line_id: string;
  entry_id: string;
  entry_date: string;
  description: string | null;
  ref_no: string | null;
  payment_method: string | null;
  source_type: string;
  debit: number;
  credit: number;
};

export function useAccountLedger(accountId?: string, from?: string, to?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ledger", accountId, from, to],
    enabled: !!user && !!accountId,
    queryFn: async (): Promise<LedgerRow[]> => {
      const { data, error } = await (supabase.from("journal_entry_lines") as any)
        .select("id,debit,credit,journal_entries!inner(id,entry_date,description,ref_no,payment_method,source_type,owner_id)")
        .eq("account_id", accountId);
      if (error) throw error;
      const rows: LedgerRow[] = (data ?? []).map((l: any) => ({
        line_id: l.id,
        entry_id: l.journal_entries.id,
        entry_date: l.journal_entries.entry_date,
        description: l.journal_entries.description,
        ref_no: l.journal_entries.ref_no,
        payment_method: l.journal_entries.payment_method,
        source_type: l.journal_entries.source_type,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      }));
      return rows
        .filter((r) => (!from || r.entry_date >= from) && (!to || r.entry_date <= to))
        .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    },
  });
}
