// Strict integer-only unit tree math.
// products.stock is ALWAYS stored in the smallest defined unit (base unit).
// Hierarchy:  main_unit  -> sub_unit_1 (ratio = how many sub_unit_1 per main)
//                        -> sub_unit_2 (ratio = how many sub_unit_2 per sub_unit_1)
// If sub_unit_2 is defined, BASE = sub_unit_2; else if sub_unit_1, BASE = sub_unit_1;
// else BASE = main_unit. Ratios MUST be positive integers (clamped at runtime).

export type ProductUnitTree = {
  main_unit?: string | null;
  sub_unit_1?: string | null;
  sub_unit_1_ratio?: number | null;
  sub_unit_2?: string | null;
  sub_unit_2_ratio?: number | null;
};

export type UnitLevel = "main" | "sub1" | "sub2";

/** Normalize a ratio to a positive integer (>= 1). */
function intRatio(v: unknown): number {
  const n = Math.floor(Number(v) || 0);
  return n >= 1 ? n : 1;
}

/** Returns the name of the base (smallest) unit, fallback "وحدة". */
export function baseUnitName(p: ProductUnitTree, fallback = "وحدة"): string {
  if (p.sub_unit_2) return p.sub_unit_2;
  if (p.sub_unit_1) return p.sub_unit_1;
  return p.main_unit || fallback;
}

/** Returns number of base units in ONE unit at the given level (integer). */
export function baseUnitsPer(p: ProductUnitTree, level: UnitLevel): number {
  const r1 = intRatio(p.sub_unit_1_ratio);
  const r2 = intRatio(p.sub_unit_2_ratio);
  if (level === "main") {
    return (p.sub_unit_1 ? r1 : 1) * (p.sub_unit_2 ? r2 : 1);
  }
  if (level === "sub1") return p.sub_unit_2 ? r2 : 1;
  return 1; // sub2 is itself the base
}

/** Convert a user-entered quantity at `level` into base units (integer, rounded). */
export function toBase(qty: number, level: UnitLevel, p: ProductUnitTree): number {
  const q = Number(qty) || 0;
  const factor = baseUnitsPer(p, level);
  return Math.max(0, Math.round(q * factor));
}

/**
 * Convert a base-unit quantity to its equivalent main-unit quantity for
 * financial calculations (cost/price are stored per main unit).
 * Returns the base value as-is when no unit tree is defined.
 * Always returns a finite, non-negative number — never null/NaN.
 */
export function toMainUnits(stockInBase: number, p: ProductUnitTree): number {
  const s = Number(stockInBase) || 0;
  if (s <= 0) return 0;
  const hasTree = !!(p.main_unit || p.sub_unit_1 || p.sub_unit_2);
  if (!hasTree) return s;
  const per = baseUnitsPer(p, "main");
  if (!per || per <= 0) return s;
  return s / per;
}

/** Decompose a base-unit stock into integer { main, sub1, sub2 } parts. */
export function fromBase(stockInBase: number, p: ProductUnitTree): {
  main: number; sub1: number; sub2: number;
} {
  let remaining = Math.max(0, Math.floor(Number(stockInBase) || 0));
  const hasMain = !!p.main_unit;
  const hasSub1 = !!p.sub_unit_1;
  const hasSub2 = !!p.sub_unit_2;

  const perMain = baseUnitsPer(p, "main");
  const perSub1 = baseUnitsPer(p, "sub1");

  let main = 0, sub1 = 0, sub2 = 0;
  if (hasMain && perMain > 0) {
    main = Math.floor(remaining / perMain);
    remaining = remaining - main * perMain;
  }
  if (hasSub1 && perSub1 > 0) {
    sub1 = Math.floor(remaining / perSub1);
    remaining = remaining - sub1 * perSub1;
  }
  if (hasSub2) {
    sub2 = remaining;
    remaining = 0;
  } else if (!hasSub1 && hasMain) {
    // No sub units at all: the remainder is fractional within a main — ignore.
  } else if (hasSub1 && !hasSub2) {
    // sub1 IS the base; leftover already captured above.
  }
  return { main, sub1, sub2 };
}

/**
 * The single display helper for showing a product's stock to users.
 * Examples (Flagyl: main=box, sub1=strip, sub1_ratio=2, stock=20 strips → "10 box"):
 *   formatBaseQuantity(20, { main_unit: "علبة", sub_unit_1: "شريط", sub_unit_1_ratio: 2 })
 *     => "10 علبة"
 *   formatBaseQuantity(21, ...) => "10 علبة + 1 شريط"
 *   formatBaseQuantity(20, { main_unit: "شريط" }) => "20 شريط"
 */
export function formatBaseQuantity(stockInBase: number, p: ProductUnitTree): string {
  const stock = Math.max(0, Math.floor(Number(stockInBase) || 0));
  const hasTree = !!(p.main_unit || p.sub_unit_1 || p.sub_unit_2);
  if (!hasTree) return String(stock);

  const { main, sub1, sub2 } = fromBase(stock, p);
  const parts: string[] = [];
  if (p.main_unit && main > 0) parts.push(`${main} ${p.main_unit}`);
  if (p.sub_unit_1 && sub1 > 0) parts.push(`${sub1} ${p.sub_unit_1}`);
  if (p.sub_unit_2 && sub2 > 0) parts.push(`${sub2} ${p.sub_unit_2}`);
  if (parts.length === 0) return `0 ${baseUnitName(p)}`;
  return parts.join(" + ");
}

/** Back-compat alias used by older imports. */
export const formatStock = formatBaseQuantity;

/** Build the list of unit options for a line item (purchase/invoice). */
export function unitOptions(p: ProductUnitTree): Array<{ level: UnitLevel; name: string; ratio: number }> {
  const opts: Array<{ level: UnitLevel; name: string; ratio: number }> = [];
  if (p.main_unit) opts.push({ level: "main", name: p.main_unit, ratio: baseUnitsPer(p, "main") });
  if (p.sub_unit_1) opts.push({ level: "sub1", name: p.sub_unit_1, ratio: baseUnitsPer(p, "sub1") });
  if (p.sub_unit_2) opts.push({ level: "sub2", name: p.sub_unit_2, ratio: 1 });
  return opts;
}
