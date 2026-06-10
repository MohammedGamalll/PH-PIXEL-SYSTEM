import { supabase } from "@/integrations/supabase/client";
import { priceForUnitLevel } from "@/lib/stock-display";
import {
  baseUnitsPer,
  formatBaseQuantity,
  formatMainQuantity,
  toBase,
  toMainUnits,
  type ProductUnitTree,
  type UnitLevel,
} from "@/lib/units";

export type StandaloneReturnDisplayItem = {
  name: string;
  quantityLabel: string;
  unitPriceMain: number;
  total: number;
};

type RawReturnItem = {
  standalone_return_id: string;
  product_id: string | null;
  product_name_snapshot: string | null;
  quantity: number;
  base_quantity?: number | null;
  unit_price: number;
  total: number;
  expiry_date?: string | null;
};

type ProductRow = ProductUnitTree & {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  cost: number | null;
};

const PRODUCT_SELECT =
  "id, name, sku, price, cost, main_unit, sub_unit_1, sub_unit_1_ratio, sub_unit_2, sub_unit_2_ratio";

function hasUnitTree(p: ProductUnitTree): boolean {
  return !!(p.main_unit || p.sub_unit_1 || p.sub_unit_2);
}

function inferUnitLevel(
  product: ProductRow | null,
  unitPrice: number,
  returnType: "sales" | "purchase" | string,
): UnitLevel {
  if (!product || !hasUnitTree(product)) return "main";

  const perMain = baseUnitsPer(product, "main") || 1;
  const priceField = returnType === "purchase" ? product.cost : product.price;
  const priced = { ...product, price: Number(priceField) || 0 };

  const levels: UnitLevel[] = ["main", "sub1", "sub2"];
  let best: UnitLevel = "main";
  let bestDiff = Infinity;

  for (const level of levels) {
    const perLevel = baseUnitsPer(product, level);
    if (level !== "main" && perLevel === perMain) continue;
    const expected = priceForUnitLevel(priced, level, baseUnitsPer);
    const diff = Math.abs(expected - unitPrice);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = level;
    }
  }

  return best;
}

export function toStandaloneReturnDisplayItem(
  raw: RawReturnItem,
  product: ProductRow | null,
  returnType: "sales" | "purchase" | string,
): StandaloneReturnDisplayItem {
  const name = raw.product_name_snapshot || product?.name || "—";
  const qty = Number(raw.quantity) || 0;
  const unitPrice = Number(raw.unit_price) || 0;
  const total = Number(raw.total) || 0;

  if (!product || !hasUnitTree(product)) {
    const unit = product?.main_unit || "وحدة";
    const qtyLabel = `${qty} ${unit}`;
    return {
      name,
      quantityLabel: qtyLabel,
      unitPriceMain: unitPrice,
      total,
    };
  }

  // Prefer the persisted base_quantity (honours the exact unit selected at
  // return time); fall back to inferring the level from the price only for
  // legacy rows saved before base_quantity existed.
  const level = inferUnitLevel(product, unitPrice, returnType);
  const baseQty = raw.base_quantity != null && Number(raw.base_quantity) > 0
    ? Number(raw.base_quantity)
    : toBase(qty, level, product);
  const quantityLabel = formatBaseQuantity(baseQty, product);
  const perMain = baseUnitsPer(product, "main") || 1;
  const perLevel = baseUnitsPer(product, level) || 1;
  const mainQty = toMainUnits(baseQty, product);
  const unitPriceMain =
    mainQty > 0
      ? Number((total / mainQty).toFixed(2))
      : Number(((unitPrice * perMain) / perLevel).toFixed(2));

  return { name, quantityLabel, unitPriceMain, total };
}

async function loadProductsByIds(ids: string[]): Promise<Map<string, ProductRow>> {
  const map = new Map<string, ProductRow>();
  if (ids.length === 0) return map;

  const { data, error } = await (supabase.from("products") as any)
    .select(PRODUCT_SELECT)
    .in("id", ids);

  if (error) {
    console.warn("loadProductsByIds:", error.message);
    return map;
  }

  for (const p of (data ?? []) as ProductRow[]) {
    if (p?.id) map.set(p.id, p);
  }
  return map;
}

export async function fetchStandaloneReturnItems(
  returnIds: string[],
  returnTypesById: Map<string, string>,
): Promise<Map<string, StandaloneReturnDisplayItem[]>> {
  const map = new Map<string, StandaloneReturnDisplayItem[]>();
  const ids = returnIds.filter(Boolean);
  if (ids.length === 0) return map;

  const { data: items, error } = await (supabase.from("standalone_return_items") as any)
    .select(
      "standalone_return_id, product_id, product_name_snapshot, quantity, base_quantity, unit_price, total, expiry_date",
    )
    .in("standalone_return_id", ids);

  if (error) {
    console.warn("fetchStandaloneReturnItems:", error.message);
    return map;
  }

  const rawItems = (items ?? []) as RawReturnItem[];
  const productIds = [...new Set(rawItems.map((it) => it.product_id).filter(Boolean))] as string[];
  const products = await loadProductsByIds(productIds);

  for (const raw of rawItems) {
    const rid = raw.standalone_return_id;
    if (!rid) continue;
    const returnType = returnTypesById.get(rid) ?? "sales";
    const product = raw.product_id ? products.get(raw.product_id) ?? null : null;
    const display = toStandaloneReturnDisplayItem(raw, product, returnType);
    const list = map.get(rid) ?? [];
    list.push(display);
    map.set(rid, list);
  }

  return map;
}

export async function fetchStandaloneReturnItemsForReturn(
  returnId: string,
  returnType: string,
): Promise<StandaloneReturnDisplayItem[]> {
  const types = new Map<string, string>([[returnId, returnType]]);
  const map = await fetchStandaloneReturnItems([returnId], types);
  return map.get(returnId) ?? [];
}
