import { supabase } from "@/integrations/supabase/client";

/**
 * Revert (delete) a damaged_stock record:
 * 1. Delete child damaged_stock_items first — the AFTER DELETE trigger
 *    `trg_damaged_stock_delete` restores product stock for each item.
 * 2. Delete the damaged_stock header — its BEFORE DELETE trigger
 *    `trg_cleanup_damaged_journal` removes the linked journal entries.
 */
export const revertDamagedStock = async ({ data }: { data: { id: string } }) => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error("غير مصرح");

  // Verify ownership
  const { data: head, error: hErr } = await supabase
    .from("damaged_stock")
    .select("id, owner_id")
    .eq("id", data.id)
    .maybeSingle();
  if (hErr) throw new Error(hErr.message);
  if (!head || (head as any).owner_id !== userId) {
    throw new Error("لا تملك صلاحية على هذه العملية");
  }

  // Delete items first so per-item stock-revert trigger fires
  const { error: itemsErr } = await supabase
    .from("damaged_stock_items")
    .delete()
    .eq("damaged_stock_id", data.id);
  if (itemsErr) throw new Error(itemsErr.message);

  // Delete header — journal cleanup trigger fires
  const { error: delErr } = await supabase
    .from("damaged_stock")
    .delete()
    .eq("id", data.id);
  if (delErr) throw new Error(delErr.message);

  return { ok: true };
};
