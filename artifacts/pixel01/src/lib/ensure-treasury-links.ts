import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

let ensuredForOwner: string | null = null;
let ensuring: Promise<void> | null = null;

export function invalidateTreasuryQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["linked-treasuries"] });
  qc.invalidateQueries({ queryKey: ["treasuries"] });
  qc.invalidateQueries({ queryKey: ["treasuries_from_accounts"] });
  qc.invalidateQueries({ queryKey: ["accounts"] });
}

/** Sync treasuries ↔ accounts once per session so contact_payments use valid account ids. */
export async function ensureTreasuryLinks(
  ownerId: string,
  qc?: QueryClient,
): Promise<void> {
  if (!ownerId || ensuredForOwner === ownerId) return;
  if (ensuring) return ensuring;

  ensuring = (async () => {
    try {
      await (supabase.rpc as any)("sync_treasuries_from_accounts");
      await (supabase.rpc as any)("ensure_system_accounts", { _owner: ownerId });
      ensuredForOwner = ownerId;
      if (qc) invalidateTreasuryQueries(qc);
    } catch (err) {
      console.warn("ensureTreasuryLinks failed", err);
    } finally {
      ensuring = null;
    }
  })();

  return ensuring;
}
