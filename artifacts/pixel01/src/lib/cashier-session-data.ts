import { supabase } from "@/integrations/supabase/client";
import { fetchStandaloneReturnItems } from "@/lib/standalone-return-items";

/** Must match STANDALONE_RETURN_NOTE_PREFIX in standalone-returns.functions.ts */
export const STANDALONE_RETURN_NOTE_PREFIX = "\u0645\u0631\u062A\u062C\u0639 \u062D\u0631";

export type SessionStandaloneReturnItem = {
  description: string;
  quantity: number;
  quantityLabel: string;
  total: number;
};

export type SessionStandaloneReturn = {
  id: string;
  reference_no: string | null;
  return_type: string;
  return_date: string | null;
  created_at: string | null;
  total_amount: number;
  reason: string | null;
  payment_method: "cash" | "account";
  contact_id: string | null;
  contact_type: string | null;
  items: SessionStandaloneReturnItem[];
  items_summary: string;
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

export type StandaloneReturnSums = {
  /** All sales standalone returns (display) */
  totalSalesRefund: number;
  /** All purchase standalone returns (display) */
  totalPurchaseDeposit: number;
  /** Cash-only — affects Expected Drawer */
  cashSalesRefund: number;
  cashPurchaseDeposit: number;
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

function buildItemsSummary(items: SessionStandaloneReturnItem[]): string {
  if (!items.length) return "—";
  return items
    .slice(0, 4)
    .map((it) => `${it.description} ×${it.quantityLabel || Number(it.quantity)}`)
    .join("، ")
    + (items.length > 4 ? ` (+${items.length - 4})` : "");
}

function inferPaymentMethod(
  row: { payment_method?: string | null; contact_id?: string | null },
  accountRefNos: Set<string>,
  refNo: string | null,
): "cash" | "account" {
  const pm = String(row.payment_method || "").toLowerCase();
  if (pm === "account") return "account";
  if (pm === "cash") return "cash";
  if (row.contact_id) return "account";
  const ref = String(refNo || "").trim();
  if (ref && accountRefNos.has(ref)) return "account";
  return "cash";
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

async function loadReturnItems(
  rows: Array<{ id: string; return_type?: string | null }>,
): Promise<Map<string, SessionStandaloneReturnItem[]>> {
  const ids = rows.map((r) => r.id).filter(Boolean);
  const returnTypesById = new Map(
    rows.map((r) => [r.id, String(r.return_type || "sales")]),
  );
  const displayMap = await fetchStandaloneReturnItems(ids, returnTypesById);
  const map = new Map<string, SessionStandaloneReturnItem[]>();

  for (const [rid, items] of displayMap) {
    map.set(
      rid,
      items.map((it) => ({
        description: it.name,
        quantity: 0,
        quantityLabel: it.quantityLabel,
        total: it.total,
      })),
    );
  }
  return map;
}

/** Load account-return ref_nos for payment_method fallback. */
async function loadAccountReturnRefNos(refNos: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  const refs = refNos.map((r) => String(r || "").trim()).filter(Boolean);
  if (refs.length === 0) return set;

  const { data } = await (supabase.from("contact_payments") as any)
    .select("ref_no, notes")
    .in("ref_no", refs);

  for (const cp of (data ?? []) as any[]) {
    const notes = String(cp.notes || "");
    if (notes.includes(STANDALONE_RETURN_NOTE_PREFIX)) {
      const ref = String(cp.ref_no || "").trim();
      if (ref) set.add(ref);
    }
  }
  return set;
}

const STANDALONE_RETURN_SELECT_FULL =
  "id, reference_no, return_type, return_date, created_at, total_amount, reason, treasury_transaction_id, payment_method, contact_id, contact_type";
const STANDALONE_RETURN_SELECT_BASE =
  "id, reference_no, return_type, return_date, created_at, total_amount, reason, treasury_transaction_id";

async function selectStandaloneReturns(
  filter: (q: any) => any,
): Promise<{ rows: any[]; ok: boolean }> {
  let q = (supabase.from("standalone_returns") as any).select(STANDALONE_RETURN_SELECT_FULL);
  q = filter(q);
  const { data, error } = await q;
  if (!error) return { rows: (data ?? []) as any[], ok: true };
  if (isMissingColumnError(error.message || "", "payment_method")) {
    let q2 = (supabase.from("standalone_returns") as any).select(STANDALONE_RETURN_SELECT_BASE);
    q2 = filter(q2);
    const fb = await q2;
    if (fb.error) {
      console.warn("selectStandaloneReturns:", fb.error.message);
      return { rows: [], ok: false };
    }
    return { rows: (fb.data ?? []) as any[], ok: true };
  }
  console.warn("selectStandaloneReturns:", error.message);
  return { rows: [], ok: false };
}

/** Fallback when treasury_transactions.session_id is not migrated yet. */
async function fetchStandaloneReturnsByTimeWindow(sessionId: string): Promise<SessionStandaloneReturn[]> {
  const { data: sess, error: sessErr } = await (supabase.from("cashier_sessions") as any)
    .select("owner_id, opened_at, closed_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessErr || !sess?.owner_id) return [];

  const { rows, ok } = await selectStandaloneReturns((q) => {
    let query = q
      .eq("owner_id", sess.owner_id)
      .gte("created_at", sess.opened_at);
    if (sess.closed_at) query = query.lte("created_at", sess.closed_at);
    return query.order("created_at", { ascending: false });
  });
  if (!ok) return [];
  return enrichReturns(rows, sessionId);
}

/**
 * Load standalone returns for a cashier session.
 * Primary: treasury_transactions.session_id → standalone_returns.treasury_transaction_id.
 * Fallback (pre-migration): match by owner + created_at within session window.
 */
export async function fetchSessionStandaloneReturns(sessionId: string): Promise<SessionStandaloneReturn[]> {
  try {
    const { data: treasuryRows, error: trErr } = await (supabase.from("treasury_transactions") as any)
      .select("id")
      .eq("session_id", sessionId);

    if (trErr) {
      if (isMissingSessionIdColumn(trErr.message || "")) {
        return fetchStandaloneReturnsByTimeWindow(sessionId);
      }
      console.warn("fetchSessionStandaloneReturns treasury:", trErr.message);
      return fetchStandaloneReturnsByTimeWindow(sessionId);
    }

    const treasuryIds = (treasuryRows ?? []).map((t: any) => t.id).filter(Boolean);
    if (treasuryIds.length === 0) {
      // No treasury links yet — still show returns created during this session window
      return fetchStandaloneReturnsByTimeWindow(sessionId);
    }

    const { rows, ok } = await selectStandaloneReturns((q) =>
      q.in("treasury_transaction_id", treasuryIds),
    );
    if (!ok) return fetchStandaloneReturnsByTimeWindow(sessionId);
    if (rows.length === 0) return fetchStandaloneReturnsByTimeWindow(sessionId);
    return enrichReturns(rows, sessionId);
  } catch (e) {
    console.warn("fetchSessionStandaloneReturns:", e);
    return fetchStandaloneReturnsByTimeWindow(sessionId);
  }
}

async function enrichReturns(rows: any[], _sessionId: string): Promise<SessionStandaloneReturn[]> {
  const [itemsMap, accountRefNos] = await Promise.all([
    loadReturnItems(rows),
    loadAccountReturnRefNos(rows.map((r) => r.reference_no)),
  ]);

  return rows
    .map((r) => {
      const items = itemsMap.get(r.id) ?? [];
      const payment_method = inferPaymentMethod(r, accountRefNos, r.reference_no);
      return {
        id: r.id,
        reference_no: r.reference_no ?? null,
        return_type: r.return_type,
        return_date: r.return_date ?? null,
        created_at: r.created_at ?? null,
        total_amount: Number(r.total_amount || 0),
        reason: r.reason ?? null,
        payment_method,
        contact_id: r.contact_id ?? null,
        contact_type: r.contact_type ?? null,
        items,
        items_summary: buildItemsSummary(items),
      };
    })
    .sort((a, b) => rowSortTime(b) - rowSortTime(a));
}

export function sumStandaloneReturns(stdReturns: SessionStandaloneReturn[]): StandaloneReturnSums {
  let totalSalesRefund = 0;
  let totalPurchaseDeposit = 0;
  let cashSalesRefund = 0;
  let cashPurchaseDeposit = 0;

  for (const r of stdReturns) {
    const amt = Number(r.total_amount || 0);
    const isCash = r.payment_method !== "account";
    if (r.return_type === "sales") {
      totalSalesRefund += amt;
      if (isCash) cashSalesRefund += amt;
    } else if (r.return_type === "purchase") {
      totalPurchaseDeposit += amt;
      if (isCash) cashPurchaseDeposit += amt;
    }
  }

  return { totalSalesRefund, totalPurchaseDeposit, cashSalesRefund, cashPurchaseDeposit };
}

/** @deprecated use cashSalesRefund / totalSalesRefund from sumStandaloneReturns */
export function sumStandaloneReturnsLegacy(stdReturns: SessionStandaloneReturn[]) {
  const s = sumStandaloneReturns(stdReturns);
  return { stdSalesRefund: s.totalSalesRefund, stdPurchaseDeposit: s.totalPurchaseDeposit };
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
    payment_method: r.payment_method,
    type: "standalone_return",
    payment_status: "paid",
    customer_id: null,
    return_type: r.return_type,
    reason: r.reason,
    items_summary: r.items_summary,
    items: r.items,
    __isStandaloneReturn: true,
  }));

  return [...invoices, ...cpRows, ...stdRetRows].sort(
    (a: any, b: any) => rowSortTime(b) - rowSortTime(a),
  );
}
