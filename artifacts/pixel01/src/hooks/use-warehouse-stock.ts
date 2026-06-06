import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWarehouseContext } from "@/contexts/WarehouseContext";

/**
 * Fetches a map of product_id -> stock for a given warehouse.
 */
export function useWarehouseStockMap(warehouseId: string | null | undefined) {
  return useQuery({
    queryKey: ["product_warehouse_stock", "by-warehouse", warehouseId ?? "none"],
    enabled: !!warehouseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_warehouse_stock")
        .select("product_id, stock")
        .eq("warehouse_id", warehouseId!);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        map[row.product_id as string] = Number(row.stock ?? 0);
      }
      return map;
    },
    staleTime: 10_000,
  });
}

/**
 * Convenience: stock map for the currently-active warehouse from context.
 */
export function useProductStockForCurrentWarehouse() {
  const { currentWarehouseId } = useWarehouseContext();
  return useWarehouseStockMap(currentWarehouseId);
}

/**
 * Merge warehouse stock into a product list under a `stock` (and `warehouse_stock`) field.
 */
export function withWarehouseStock<T extends { id: string; stock?: number | null }>(
  products: T[],
  stockMap: Record<string, number> | undefined,
): (T & { stock: number; warehouse_stock: number })[] {
  return products.map((p) => {
    const ws = stockMap?.[p.id] ?? 0;
    return { ...p, stock: ws, warehouse_stock: ws };
  });
}
