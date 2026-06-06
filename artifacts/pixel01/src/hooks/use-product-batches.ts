import { useQuery } from "@tanstack/react-query";
import { computeProductBatches, type ProductBatch } from "@/lib/product-batches";

export type { ProductBatch };

/**
 * Returns batches (per expiry_date) for a product with accurate remaining qty.
 * Uses the shared `computeProductBatches` helper so the count form and the
 * product card always show the exact same numbers.
 */
export function useProductBatches(
  productId: string | null | undefined,
  opts: { includeEmpty?: boolean; includePast?: boolean } = {},
) {
  return useQuery({
    queryKey: ["product-batches", productId, opts.includeEmpty, opts.includePast],
    enabled: !!productId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const list = await computeProductBatches(productId as string);
      return list.filter((b) => {
        if (!opts.includeEmpty && b.remaining <= 0) return false;
        // Always keep the no-expiry batch ("") regardless of includePast.
        if (b.expiry_date && !opts.includePast && b.expiry_date < today) return false;
        return true;
      });
    },
  });
}

/**
 * Returns the nearest valid (future) expiry date for a product
 * with remaining stock > 0. Returns "" when there's no expiry batch
 * available (all FIFO/no-expiry stock).
 */
export function useProductExpiry(productId: string | null | undefined) {
  return useQuery({
    queryKey: ["product-expiry", productId],
    enabled: !!productId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const list = await computeProductBatches(productId as string);
      const valid = list.filter(
        (b) => b.expiry_date && b.remaining > 0 && b.expiry_date >= today,
      );
      if (valid.length === 0) return "";
      valid.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
      return valid[0].expiry_date as string;
    },
  });
}

/** Format YYYY-MM-DD → MM/YYYY for compact label display. */
export function formatExpiryShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[2]}/${m[1]}`;
}
