import type { Promotion } from "@/hooks/use-promotions";
import { baseUnitsPer, type UnitLevel, type ProductUnitTree } from "@/lib/units";

/**
 * Return the best-matching active promotion for a product (highest priority first)
 * scoped by product_ids, brand_id, category_id and the current date window.
 */
export function pickActivePromo(
  product: { id: string; brand_id?: string | null; category_id?: string | null },
  promotions: Promotion[],
  now: Date = new Date(),
): Promotion | null {
  if (!promotions?.length) return null;
  const t = now.getTime();
  const matches = promotions.filter((p) => {
    if (!p.is_active) return false;
    if (p.starts_at && new Date(p.starts_at).getTime() > t) return false;
    if (p.ends_at && new Date(p.ends_at).getTime() < t) return false;
    const scopedByProducts = (p.product_ids?.length ?? 0) > 0;
    const scopedByBrand = !!p.brand_id;
    const scopedByCategory = !!p.category_id;
    if (!scopedByProducts && !scopedByBrand && !scopedByCategory) return true; // global
    if (scopedByProducts && p.product_ids.includes(product.id)) return true;
    if (scopedByBrand && product.brand_id && p.brand_id === product.brand_id) return true;
    if (scopedByCategory && product.category_id && p.category_id === product.category_id) return true;
    return false;
  });
  if (!matches.length) return null;
  matches.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  return matches[0];
}

/** Apply a promotion to a unit price; returns the discounted price (>= 0). */
export function applyPromoToPrice(unitPrice: number, promo: Promotion | null): number {
  if (!promo) return unitPrice;
  const next = promo.discount_type === "percent"
    ? unitPrice * (1 - (Number(promo.amount) || 0) / 100)
    : unitPrice - (Number(promo.amount) || 0);
  return Math.max(0, Number(next.toFixed(2)));
}

/**
 * Scale a promotion to a specific unit level.
 * - For percent promos: discount = originalPrice * amount / 100 (ratio-invariant).
 * - For fixed promos: amount is defined on the MAIN unit, so we scale it down
 *   proportionally to the chosen level (e.g. 20 EGP off a box of 10 strips
 *   => 2 EGP off per strip).
 * The returned discount is clamped to never exceed the original price.
 */
export function scalePromoForLevel(
  product: ProductUnitTree,
  level: UnitLevel,
  originalPrice: number,
  promo: Promotion | null,
): { originalPrice: number; discountAmount: number; finalPrice: number } {
  const op = Math.max(0, Number(originalPrice) || 0);
  if (!promo) return { originalPrice: op, discountAmount: 0, finalPrice: op };

  let discount = 0;
  if (promo.discount_type === "percent") {
    discount = op * ((Number(promo.amount) || 0) / 100);
  } else {
    const perMain = baseUnitsPer(product, "main") || 1;
    const perLevel = baseUnitsPer(product, level) || 1;
    discount = (Number(promo.amount) || 0) * (perLevel / perMain);
  }
  discount = Math.max(0, Math.min(op, Number(discount.toFixed(2))));
  const finalPrice = Number(Math.max(0, op - discount).toFixed(2));
  return { originalPrice: op, discountAmount: discount, finalPrice };
}
