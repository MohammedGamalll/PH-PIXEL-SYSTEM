import { supabase } from "@/integrations/supabase/client";
import { friendlyDbError } from "@/lib/db-errors";

const TREASURY_LINK_ERROR = "الخزنة غير مربوطة بحساب — راجع إعدادات الخزائن";

async function lookupTreasuryAccountId(id: string): Promise<string | null> {
  const { data: treasuryRow, error } = await (supabase.from("treasuries") as any)
    .select("id, account_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw friendlyDbError(error);
  return (treasuryRow as any)?.account_id ?? null;
}

async function lookupAccountId(id: string): Promise<boolean> {
  const { data, error } = await (supabase.from("accounts") as any)
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw friendlyDbError(error);
  return !!data?.id;
}

async function syncTreasuriesFromAccounts(): Promise<void> {
  try {
    await (supabase.rpc as any)("sync_treasuries_from_accounts");
  } catch (err) {
    console.warn("sync_treasuries_from_accounts failed", err);
  }
}

/**
 * Resolve a treasury UUID or account UUID to a valid accounts.id for journal entries.
 * Never returns treasuries.id — throws if no linked account exists.
 */
export async function resolveTreasuryAccountId(
  treasuryOrAccountId: string | null | undefined,
  options?: { required?: boolean },
): Promise<string | null> {
  const id = String(treasuryOrAccountId || "").trim();
  if (!id) {
    if (options?.required) throw new Error(TREASURY_LINK_ERROR);
    return null;
  }

  const fromTreasury = await lookupTreasuryAccountId(id);
  if (fromTreasury) return fromTreasury;

  if (await lookupAccountId(id)) return id;

  await syncTreasuriesFromAccounts();
  const retryTreasury = await lookupTreasuryAccountId(id);
  if (retryTreasury) return retryTreasury;
  if (await lookupAccountId(id)) return id;

  if (options?.required) throw new Error(TREASURY_LINK_ERROR);
  return null;
}

/** Require a resolved account id — use before contact_payments with cash movement. */
export async function requireTreasuryAccountId(treasuryOrAccountId: string | null | undefined): Promise<string> {
  const accountId = await resolveTreasuryAccountId(treasuryOrAccountId, { required: true });
  if (!accountId) throw new Error(TREASURY_LINK_ERROR);
  return accountId;
}
