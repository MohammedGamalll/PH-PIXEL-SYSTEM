import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { isDebitNature, type AccountType } from "@/hooks/use-accounts";
import { useProfitLoss } from "@/hooks/use-pnl";

export type JournalLineFull = {
  line_id: string;
  entry_id: string;
  entry_date: string;
  description: string | null;
  ref_no: string | null;
  payment_method: string | null;
  source_type: string;
  source_id: string | null;
  account_id: string;
  account_name: string;
  account_number: string;
  account_type: AccountType;
  sub_account_type: string | null;
  is_cash_equivalent: boolean;
  debit: number;
  credit: number;
};

export function useJournalLines(from?: string, to?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["journal-lines", from, to],
    enabled: !!user,
    queryFn: async (): Promise<JournalLineFull[]> => {
      const { data, error } = await (supabase.from("journal_entry_lines") as any)
        .select("id,debit,credit,account_id,journal_entries!inner(id,entry_date,description,ref_no,payment_method,source_type,source_id,owner_id),accounts!inner(id,name,account_number,account_type,sub_account_type,is_cash_equivalent)");
      if (error) throw error;
      const rows: JournalLineFull[] = (data ?? []).map((l: any) => ({
        line_id: l.id,
        entry_id: l.journal_entries.id,
        entry_date: l.journal_entries.entry_date,
        description: l.journal_entries.description,
        ref_no: l.journal_entries.ref_no,
        payment_method: l.journal_entries.payment_method,
        source_type: l.journal_entries.source_type,
        source_id: l.journal_entries.source_id,
        account_id: l.account_id,
        account_name: l.accounts.name,
        account_number: l.accounts.account_number,
        account_type: l.accounts.account_type,
        sub_account_type: l.accounts.sub_account_type,
        is_cash_equivalent: !!l.accounts.is_cash_equivalent,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      }));
      return rows
        .filter((r) => (!from || r.entry_date >= from) && (!to || r.entry_date <= to))
        .sort((a, b) => b.entry_date.localeCompare(a.entry_date));
    },
  });
}

// ============ Trial Balance ============
export type TrialBalanceRow = {
  account_id: string;
  account_name: string;
  account_number: string;
  account_type: AccountType;
  debit: number;
  credit: number;
};

export function useTrialBalance() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["trial-balance"],
    enabled: !!user,
    queryFn: async (): Promise<{ rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number }> => {
      const { data: accounts, error: e1 } = await (supabase.from("accounts") as any)
        .select("id,name,account_number,account_type,opening_balance")
        .order("account_number", { ascending: true });
      if (e1) throw e1;
      const { data: lines, error: e2 } = await (supabase.from("journal_entry_lines") as any)
        .select("account_id,debit,credit");
      if (e2) throw e2;

      const totals = new Map<string, { d: number; c: number }>();
      for (const l of (lines ?? []) as any[]) {
        const t = totals.get(l.account_id) ?? { d: 0, c: 0 };
        t.d += Number(l.debit) || 0;
        t.c += Number(l.credit) || 0;
        totals.set(l.account_id, t);
      }

      const rows: TrialBalanceRow[] = ((accounts ?? []) as any[]).map((a) => {
        const t = totals.get(a.id) ?? { d: 0, c: 0 };
        const opening = Number(a.opening_balance) || 0;
        const debitNature = isDebitNature(a.account_type);
        const net = debitNature
          ? opening + t.d - t.c
          : opening + t.c - t.d;
        return {
          account_id: a.id,
          account_name: a.name,
          account_number: a.account_number,
          account_type: a.account_type,
          debit: debitNature ? Math.max(net, 0) : Math.max(-net, 0),
          credit: debitNature ? Math.max(-net, 0) : Math.max(net, 0),
        };
      }).filter((r) => r.debit > 0.001 || r.credit > 0.001);

      const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
      const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
      return { rows, totalDebit, totalCredit };
    },
  });
}

// ============ Cash Flow ============
// Prefer the explicit `accounts.is_cash_equivalent` flag (set on system cash
// accounts and any account the user marks). Falls back to keyword matching
// on legacy data where the flag isn't set.
const CASH_KEYWORDS = ["cash", "bank", "نقدي", "نقد", "بنك", "صندوق", "خزينة"];

function isCashLike(line: { is_cash_equivalent?: boolean; sub_account_type: string | null; account_name: string }): boolean {
  if (line.is_cash_equivalent) return true;
  const s = `${line.sub_account_type ?? ""} ${line.account_name}`.toLowerCase();
  return CASH_KEYWORDS.some((k) => s.includes(k.toLowerCase()));
}

export function useCashFlow(from?: string, to?: string, accountId?: string) {
  const linesQ = useJournalLines(from, to);
  return useQuery({
    queryKey: ["cash-flow", from, to, accountId, linesQ.data?.length],
    enabled: !!linesQ.data,
    queryFn: async () => {
      const all = linesQ.data ?? [];
      const cashLines = all
        .filter((l) => isCashLike(l))
        .filter((l) => !accountId || l.account_id === accountId)
        .sort((a, b) => {
          const d = a.entry_date.localeCompare(b.entry_date);
          return d !== 0 ? d : a.line_id.localeCompare(b.line_id);
        });

      const { data: accounts } = await (supabase.from("accounts") as any)
        .select("id,opening_balance,account_type");
      const openingByAccount = new Map<string, number>();
      for (const a of (accounts ?? []) as any[]) {
        openingByAccount.set(a.id, Number(a.opening_balance) || 0);
      }

      let running = 0;
      if (accountId) {
        running = openingByAccount.get(accountId) ?? 0;
      } else {
        const cashAccountIds = new Set(cashLines.map((l) => l.account_id));
        for (const id of cashAccountIds) running += openingByAccount.get(id) ?? 0;
      }

      const enriched = cashLines.map((l) => {
        const debitNature = isDebitNature(l.account_type);
        running += debitNature ? l.debit - l.credit : l.credit - l.debit;
        return { ...l, balance: running };
      });
      const totalDebit = cashLines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = cashLines.reduce((s, l) => s + l.credit, 0);
      const opening = accountId
        ? (openingByAccount.get(accountId) ?? 0)
        : [...new Set(cashLines.map((l) => l.account_id))].reduce(
            (s, id) => s + (openingByAccount.get(id) ?? 0), 0);
      const closing = enriched.length ? enriched[enriched.length - 1].balance : opening;
      return { rows: enriched.slice().reverse(), totalDebit, totalCredit, opening, closing };
    },
  });
}

// ============ Balance Sheet ============
export type BalanceAccount = { id: string; name: string; balance: number; sub_type: string | null };
export type BalanceSheet = {
  assets: BalanceAccount[];
  liabilities: BalanceAccount[];
  equity: BalanceAccount[];
  netProfit: number;
  totalAssets: number;
  totalLiabEquity: number;
  inventoryValue: number;
};

export function useBalanceSheet() {
  const { user } = useAuth();
  const pnl = useProfitLoss();
  return useQuery({
    queryKey: ["balance-sheet", pnl.data?.netProfit],
    enabled: !!user && !!pnl.data,
    queryFn: async (): Promise<BalanceSheet> => {
      const { data: accounts, error: e1 } = await (supabase.from("accounts") as any)
        .select("id,name,account_type,sub_account_type,opening_balance");
      if (e1) throw e1;
      const { data: lines, error: e2 } = await (supabase.from("journal_entry_lines") as any)
        .select("account_id,debit,credit");
      if (e2) throw e2;
      const { data: products } = await (supabase.from("products") as any).select("cost,stock");
      const inventoryValue = (products ?? []).reduce((s: number, p: any) => s + (Number(p.cost) || 0) * (Number(p.stock) || 0), 0);

      const totals = new Map<string, { d: number; c: number }>();
      for (const l of (lines ?? []) as any[]) {
        const t = totals.get(l.account_id) ?? { d: 0, c: 0 };
        t.d += Number(l.debit) || 0;
        t.c += Number(l.credit) || 0;
        totals.set(l.account_id, t);
      }

      const assets: BalanceAccount[] = [];
      const liabilities: BalanceAccount[] = [];
      const equity: BalanceAccount[] = [];

      for (const a of (accounts ?? []) as any[]) {
        const t = totals.get(a.id) ?? { d: 0, c: 0 };
        const opening = Number(a.opening_balance) || 0;
        const debitNature = isDebitNature(a.account_type);
        const balance = debitNature ? opening + t.d - t.c : opening + t.c - t.d;
        if (Math.abs(balance) < 0.001) continue;
        const item: BalanceAccount = { id: a.id, name: a.name, balance, sub_type: a.sub_account_type };
        if (a.account_type === "Asset") assets.push(item);
        else if (a.account_type === "Liability") liabilities.push(item);
        else if (a.account_type === "Equity") equity.push(item);
      }

      const netProfit = pnl.data?.netProfit ?? 0;
      const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
      const totalLiabEquity = liabilities.reduce((s, a) => s + a.balance, 0) + equity.reduce((s, a) => s + a.balance, 0) + netProfit;

      return { assets, liabilities, equity, netProfit, totalAssets, totalLiabEquity, inventoryValue };
    },
  });
}

// ============ Trading Report ============
export function useTradingReport(from?: string, to?: string, paymentMethod?: string) {
  const pnl = useProfitLoss(from, to, paymentMethod);
  return useQuery({
    queryKey: ["trading-report", from, to, paymentMethod, pnl.data],
    enabled: !!pnl.data,
    queryFn: async () => {
      const { user } = (await supabase.auth.getUser()).data;
      if (!user) throw new Error("Not authenticated");
      // purchase returns
      const { data: prs } = await (supabase.from("purchase_returns") as any).select("total_amount,return_date");
      const filteredPR = (prs ?? []).filter((r: any) => (!from || r.return_date >= from) && (!to || r.return_date <= to));
      const purchaseReturns = filteredPR.reduce((s: number, r: any) => s + (Number(r.total_amount) || 0), 0);

      const totalPurchases = pnl.data!.totalPurchases;
      const totalSales = pnl.data!.totalSales;
      const salesReturns = pnl.data!.totalReturns;
      const netPurchases = totalPurchases - purchaseReturns;
      const netSales = totalSales - salesReturns;
      const cogs = pnl.data!.cogs;
      const grossMargin = netSales - netPurchases;
      const tradingProfit = netSales - netPurchases;

      return { totalPurchases, purchaseReturns, netPurchases, totalSales, salesReturns, netSales, cogs, grossMargin, tradingProfit };
    },
  });
}
