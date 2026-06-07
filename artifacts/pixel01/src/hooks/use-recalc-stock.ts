import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/** Silently recalc product stock on mount to avoid stale/negative stock. */
export function useRecalcProductStock() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    (supabase.rpc as any)("recalc_product_stock")
      .then(() => {
        qc.invalidateQueries({ queryKey: ["products"] });
        qc.invalidateQueries({ queryKey: ["product_warehouse_stock"] });
        qc.invalidateQueries({ queryKey: ["products_for_purchase"] });
        qc.invalidateQueries({ queryKey: ["product-batches"] });
      })
      .catch(() => { /* silent */ });
  }, [user, qc]);
}
