import { supabase } from "@/integrations/supabase/client";

let ensuredForOwner: string | null = null;
let ensuring: Promise<void> | null = null;

/** Sync treasuries ↔ accounts once per session so contact_payments use valid account ids. */
export async function ensureTreasuryLinks(ownerId: string): Promise<void> {
  if (!ownerId || ensuredForOwner === ownerId) return;
  if (ensuring) return ensuring;

  ensuring = (async () => {
    try {
      await (supabase.rpc as any)("sync_treasuries_from_accounts");
      await (supabase.rpc as any)("ensure_system_accounts", { _owner: ownerId });
      ensuredForOwner = ownerId;
    } catch (err) {
      console.warn("ensureTreasuryLinks failed", err);
    } finally {
      ensuring = null;
    }
  })();

  return ensuring;
}
