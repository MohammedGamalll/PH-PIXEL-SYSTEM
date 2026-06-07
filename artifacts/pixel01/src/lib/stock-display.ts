/** Effective on-hand stock in base units for a product. */
export function getEffectiveStockBase(
  product: { id: string; stock?: number | null },
  pwsMap: Record<string, number>,
  warehouseId: string | null | undefined,
): number {
  if (warehouseId) {
    const wh = pwsMap[product.id];
    if (wh != null) return Number(wh) || 0;
  }
  return Number(product.stock ?? 0) || 0;
}

/** Price for a unit level when product.price is stored per main unit. */
export function priceForUnitLevel(
  product: { price?: number | null; main_unit?: string | null; sub_unit_1?: string | null; sub_unit_1_ratio?: number | null; sub_unit_2?: string | null; sub_unit_2_ratio?: number | null },
  level: "main" | "sub1" | "sub2",
  baseUnitsPer: (p: any, level: "main" | "sub1" | "sub2") => number,
): number {
  const perMain = baseUnitsPer(product, "main") || 1;
  const perLevel = baseUnitsPer(product, level);
  return Number(((Number(product.price) || 0) * (perLevel / perMain)).toFixed(2));
}
