import { supabase } from "@/integrations/supabase/client";

/** Must match STANDALONE_RETURN_NOTE_PREFIX in standalone-returns.functions.ts */
export const STANDALONE_RETURN_NOTE_PREFIX = "\u0645\u0631\u062A\u062C\u0639 \u062D\u0631";

export type SessionStandaloneReturn = {
  id: string;
  reference_no: string | null;
  return_type: string;
  return_date: string | null;
  created_at: string | null;
  total_amount: number;
  reason: string | null;
};

export type SessionContactPaymentRow = {
  id: string;
  amount: number;
  direction: string;
  contact_type: string | null;
  contact_id: string | null;
  payment_method: string | null;
  ref_no: string | null;
  created_at: string | null;
  notes: string | null;
};

function isMissingColumnError(msg: string, column: string): boolean {
  const m = (msg || "").toLowerCase();
  const col = column.toLowerCase();
  return (
    (m.includes(col) && m.includes("schema cache"))
    || (m.includes(`'${col}'`) && m.includes("could not find"))
    || (m.includes(col) && m.includes("does not exist"))
  );
}

function isMissingSessionIdColumn(msg: string): boolean {
  return isMissingColumnError(msg, "session_id");
}

function rowSortTime(r: { created_at?: string | null; return_date?: string | null }): number {
  const t = new Date(r.created_at || r.return_date || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** True when a contact_payment belongs to a standalone return, not a real session payment. */
export function isStandaloneReturnPayment(
  cp: { notes?: string | null; ref_no?: string | null },
  stdRefNos: Set<string>,
): boolean {
  const notes = String(cp.notes || "");
  if (notes.includes(STANDALONE_RETURN_NOTE_PREFIX)) return true;
  const ref = String(cp.ref_no || "").trim();
  return ref.length > 0 && stdRefNos.has(ref);
}

/**
 * Load standalone returns for a cashier session.
 * Links via treasury_transactions.session_id → standalone_returns.treasury_transaction_id.
 * Never throws — returns [] when columns are missing or queries fail.
 */
export async function fetchSessionStandaloneReturns(sessionId: string): Promise<SessionStandaloneReturn[]> {
  try {
    const { data: treasuryRows, error: trErr } = await (supabase.from("treasury_transactions") as any)
      .select("id")
      .eq("session_id", sessionId);

    if (trErr) {
      if (isMissingSessionIdColumn(trErr.message || "")) return [];
      console.warn("fetchSessionStandaloneReturns treasury:", trErr.message);
      return [];
    }

    const treasuryIds = (treasuryRows ?? []).map((t: any) => t.id).filter(Boolean);
    if (treasuryIds.length === 0) return [];

    const { data: linked, error: linkErr } = await (supabase.from("standalone_returns") as any)
      .select("id, reference_no, return_type, return_date, created_at, total_amount, reason, treasury_transaction_id")
      .in("treasury_transaction_id", treasuryIds);

    if (linkErr) {
      console.warn("fetchSessionStandaloneReturns standalone_returns:", linkErr.message);
      return [];
    }

    return ((linked ?? []) as any[])
      .map((r) => ({
        id: r.id,
        reference_no: r.reference_no ?? null,
        return_type: r.return_type,
        return_date: r.return_date ?? null,
        created_at: r.created_at ?? null,
        total_amount: Number(r.total_amount || 0),
        reason: r.reason ?? null,
      }))
      .sort((a, b) => rowSortTime(b) - rowSortTime(a));
  } catch (e) {
    console.warn("fetchSessionStandaloneReturns:", e);
    return [];
  }
}

export function sumStandaloneReturns(stdReturns: SessionStandaloneReturn[]) {
  const stdSalesRefund = stdReturns
    .filter((x) => x.return_type === "sales")
    .reduce((a, b) => a + b.total_amount, 0);
  const stdPurchaseDeposit = stdReturns
    .filter((x) => x.return_type === "purchase")
    .reduce((a, b) => a + b.total_amount, 0);
  return { stdSalesRefund, stdPurchaseDeposit };
}

/** Contact payments for session totals — excludes standalone-return ledger rows. */
export async function fetchSessionContactPayments(sessionId: string, stdReturns: SessionStandaloneReturn[]) {
  const stdRefNos = new Set(
    stdReturns.map((r) => String(r.reference_no || "").trim()).filter(Boolean),
  );

  try {
    const { data: cps, error: cpErr } = await (supabase.from("contact_payments") as any)
      .select("id, amount, direction, contact_type, contact_id, payment_method, ref_no, created_at, notes")
      .eq("session_id", sessionId);

    if (cpErr) {
      if (isMissingSessionIdColumn(cpErr.message || "")) {
        return { customerPayments: 0, supplierPayments: 0, payments: [] as SessionContactPaymentRow[] };
      }
      console.warn("fetchSessionContactPayments:", cpErr.message);
      return { customerPayments: 0, supplierPayments: 0, payments: [] as SessionContactPaymentRow[] };
    }

    const filtered = ((cps ?? []) as SessionContactPaymentRow[]).filter(
      (c) => !isStandaloneReturnPayment(c, stdRefNos),
    );

    const customerPayments = filtered
      .filter((c) => c.direction === "in")
      .reduce((a, b) => a + Number(b.amount || 0), 0);
    const supplierPayments = filtered
      .filter((c) => c.direction === "out")
      .reduce((a, b) => a + Number(b.amount || 0), 0);

    return { customerPayments, supplierPayments, payments: filtered };
  } catch (e) {
    console.warn("fetchSessionContactPayments:", e);
    return { customerPayments: 0, supplierPayments: 0, payments: [] as SessionContactPaymentRow[] };
  }
}

/** Merge invoices, filtered payments, and standalone returns for recent-transactions list. */
export function mergeSessionTransactionRows(
  invoices: any[],
  payments: SessionContactPaymentRow[],
  stdReturns: SessionStandaloneReturn[],
) {
  const cpRows = payments.map((p) => ({
    id: p.id,
    invoice_number: p.ref_no || (p.direction === "in" ? "\u062F\u0641\u0639\u0629 \u0639\u0645\u064A\u0644" : "\u062F\u0641\u0639\u0629 \u0645\u0648\u0631\u062F"),
    created_at: p.created_at,
    total: Number(p.amount || 0),
    payment_method: p.payment_method || "cash",
    type: p.direction === "in" ? "customer_payment" : "supplier_payment",
    payment_status: "paid",
    customer_id: p.contact_type === "customer" ? p.contact_id : null,
    contact_id: p.contact_id,
    contact_type: p.contact_type,
    __isPayment: true,
  }));

  const stdRetRows = stdReturns.map((r) => ({
    id: r.id,
    invoice_number: r.reference_no || STANDALONE_RETURN_NOTE_PREFIX,
    created_at: r.created_at || r.return_date,
    total: r.total_amount,
    payment_method: "cash",
    type: "standalone_return",
    payment_status: "paid",
    customer_id: null,
    return_type: r.return_type,
    reason: r.reason,
    __isStandaloneReturn: true,
  }));

  return [...invoices, ...cpRows, ...stdRetRows].sort(
    (a: any, b: any) => rowSortTime(b) - rowSortTime(a),
  );
}
