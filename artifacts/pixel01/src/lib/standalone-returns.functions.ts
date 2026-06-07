import { supabase } from "@/integrations/supabase/client";

/** Prefix for contact_payment notes created by account standalone returns. */
export const STANDALONE_RETURN_NOTE_PREFIX = "\u0645\u0631\u062A\u062C\u0639 \u062D\u0631";

export const createStandaloneReturn = async ({ data }: {
  data: {
    return_type: "sales" | "purchase";
    warehouse_id?: string | null;
    treasury_id: string;
    reason?: string | null;
    items: Array<{
      product_id?: string | null;
      new_product_name?: string | null;
      quantity: number;
      base_quantity?: number;
      unit_price: number;
      expiry_date?: string | null;
    }>;
    contact_id?: string | null;
    contact_type?: "customer" | "supplier" | null;
    payment_method?: "cash" | "account";
    session_id?: string | null;
  }
}) => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error("\u063A\u064A\u0631 \u0645\u0635\u0631\u062D");

  const { data: result, error } = await (supabase as any).rpc("process_standalone_return", {
    _return_type: data.return_type,
    _warehouse_id: data.warehouse_id ?? null,
    _treasury_id: data.treasury_id,
    _reason: data.reason ?? null,
    _items: data.items,
  });
  if (error) {
    const raw = error.message || "";
    const msg = raw.toUpperCase();
    if (msg.includes("TREASURY_REQUIRED")) throw new Error("\u0627\u062E\u062A\u0631 \u0627\u0644\u062E\u0632\u064A\u0646\u0629");
    if (msg.includes("TREASURY_NOT_FOUND")) throw new Error("\u0627\u0644\u062E\u0632\u064A\u0646\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
    if (msg.includes("ITEMS_REQUIRED")) throw new Error("\u0623\u0636\u0641 \u0635\u0646\u0641 \u0648\u0627\u062D\u062F \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644");
    if (msg.includes("NO_VALID_ITEMS")) throw new Error("\u0627\u0644\u0643\u0645\u064A\u0627\u062A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629");
    if (msg.includes("PRODUCT_OR_NAME_REQUIRED")) throw new Error("\u0627\u062E\u062A\u0631 \u0645\u0646\u062A\u062C \u0623\u0648 \u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u062C\u062F\u064A\u062F");
    if (msg.includes("PRODUCT_NOT_FOUND")) throw new Error("\u0627\u0644\u0645\u0646\u062A\u062C \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    if (msg.includes("INSUFFICIENT_STOCK")) {
      const m = raw.match(/INSUFFICIENT_STOCK:\s*([^\n]+)/i);
      const name = m?.[1]?.trim();
      throw new Error(name ? `\u0627\u0644\u0631\u0635\u064A\u062F \u063A\u064A\u0631 \u0643\u0627\u0641\u064D \u0644\u0644\u0635\u0646\u0641: ${name}` : "\u0627\u0644\u0631\u0635\u064A\u062F \u063A\u064A\u0631 \u0643\u0627\u0641\u064D");
    }
    throw new Error(error.message || "\u0641\u0634\u0644 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0645\u0631\u062A\u062C\u0639");
  }

  const ret = result as {
    id: string;
    reference_no: string;
    treasury_transaction_id: string;
    total_amount: number;
  };

  // Link to cashier session via treasury transaction (standalone_returns.session_id may not exist).
  if (data.session_id && ret.treasury_transaction_id) {
    const { error: trErr } = await (supabase as any)
      .from("treasury_transactions")
      .update({ session_id: data.session_id })
      .eq("id", ret.treasury_transaction_id);
    if (trErr) {
      const msg = trErr.message || "";
      const missingCol = msg.toLowerCase().includes("session_id") && msg.toLowerCase().includes("schema cache");
      if (!missingCol) {
        throw new Error("\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0645\u0631\u062A\u062C\u0639 \u0644\u0643\u0646 \u0644\u0645 \u064A\u064F\u0631\u0628\u0637 \u0628\u0627\u0644\u062C\u0644\u0633\u0629: " + msg);
      }
    }
  }

  if (data.contact_id && data.contact_type && data.payment_method === "account") {
    const direction = data.return_type === "sales" ? "in" : "out";

    let treasuryAccountId: string | null = null;
    const { data: tr } = await (supabase as any)
      .from("treasuries")
      .select("account_id")
      .eq("id", data.treasury_id)
      .maybeSingle();
    treasuryAccountId = (tr?.account_id as string | null) ?? null;

    const typeLabel = data.return_type === "sales" ? "\u0645\u0628\u064A\u0639\u0627\u062A" : "\u0645\u0634\u062A\u0631\u064A\u0627\u062A";
    const { error: cpErr } = await (supabase as any).from("contact_payments").insert({
      owner_id: userId,
      contact_id: data.contact_id,
      contact_type: data.contact_type,
      direction,
      amount: ret.total_amount,
      allocated_amount: 0,
      payment_method: "account",
      treasury_account_id: treasuryAccountId,
      ref_no: ret.reference_no,
      notes: `${STANDALONE_RETURN_NOTE_PREFIX} ${typeLabel} \u2014 \u0639\u0644\u0649 \u062D\u0633\u0627\u0628`,
      payment_date: new Date().toISOString().slice(0, 10),
      session_id: null,
    });
    if (cpErr) {
      throw new Error("\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0645\u0631\u062A\u062C\u0639 \u0644\u0643\u0646 \u0644\u0645 \u064A\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0631\u0635\u064A\u062F \u0627\u0644\u0637\u0631\u0641: " + cpErr.message);
    }
  }

  return ret;
};
