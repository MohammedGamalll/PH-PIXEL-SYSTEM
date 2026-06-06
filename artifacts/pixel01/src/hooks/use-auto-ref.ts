import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Auto-generate next reference number for a given table+column with a prefix.
 * Example: useAutoRef("expenses", "ref_no", "EXP") → "EXP-0001"
 * Returns [value, setValue] so the user can still override manually.
 */
export function useAutoRef(table: string, column: string, prefix: string, enabled = true) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await (supabase as any)
          .from(table)
          .select(column)
          .ilike(column, `${prefix}-%`)
          .order(column, { ascending: false })
          .limit(1);
        let next = 1;
        if (data && data.length > 0) {
          const last = String(data[0][column] || "");
          const m = last.match(/(\d+)$/);
          if (m) next = parseInt(m[1], 10) + 1;
        }
        if (!cancelled) setValue(`${prefix}-${String(next).padStart(4, "0")}`);
      } catch {
        if (!cancelled) setValue(`${prefix}-0001`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [table, column, prefix, enabled]);

  return [value, setValue, loading] as const;
}
