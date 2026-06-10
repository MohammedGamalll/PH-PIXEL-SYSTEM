import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Search, Trash2, Plus } from "lucide-react";
import { unitOptions, toBase, toMainUnits, formatBaseQuantity, baseUnitsPer, type UnitLevel, type ProductUnitTree } from "@/lib/units";
import { priceForUnitLevel } from "@/lib/stock-display";
import { useI18n } from "@/lib/i18n";
import { DateInput } from "@/components/shared/DateInput";
import { normalizeArabicText } from "@/lib/arabic";
import { KeyboardHints } from "@/components/shared/KeyboardHints";
import { useProductStockForCurrentWarehouse, useWarehouseStockMap } from "@/hooks/use-warehouse-stock";



export type Row = {
  id?: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  /** Cost per MAIN unit — used to derive per-unit cost when the unit level changes. */
  base_price?: number;
  discount_percent: number;
  total: number;
  sell_price: number;
  unit_level: UnitLevel;
  unit_name: string;
  base_factor: number;
  base_quantity: number;
  unit_choices: Array<{ level: UnitLevel; name: string; ratio: number }>;
  product_units?: ProductUnitTree;
  has_expiry?: boolean;
  expiry_date?: string;
  previous_cost?: number | null;
  last_purchase_discount?: number | null;
  current_stock_base?: number;
  main_unit_name?: string;
};

export function newRow(): Row {
  return {
    product_id: null, description: "", quantity: 1, unit_price: 0,
    discount_percent: 0, total: 0, sell_price: 0,
    unit_level: "main", unit_name: "", base_factor: 1, base_quantity: 1,
    unit_choices: [], has_expiry: false, expiry_date: "",
  };
}

export function calcRowTotal(r: Row) {
  const gross = (Number(r.quantity) || 0) * (Number(r.unit_price) || 0);
  const disc = gross * ((Number(r.discount_percent) || 0) / 100);
  return Math.max(0, gross - disc);
}

export function PurchaseItemsTable({
  rows, onChange, searchRef: externalSearchRef, autoFocus, warehouseId,
}: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  searchRef?: React.MutableRefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  warehouseId?: string | null;
}) {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const localRef = useRef<HTMLInputElement | null>(null);
  const setSearchRef = (el: HTMLInputElement | null) => {
    localRef.current = el;
    if (externalSearchRef) externalSearchRef.current = el;
  };


  const align = dir === "rtl" ? "right" : "left";
  const headStyle: React.CSSProperties = { backgroundColor: "#10b981", color: "#ffffff", padding: "8px 6px", fontWeight: 600, textAlign: align, fontSize: 12, whiteSpace: "nowrap" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "6px 4px", color: "#374151", verticalAlign: "top", whiteSpace: "nowrap" };
  const inputCell: React.CSSProperties = { border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151", height: 30, padding: "0 6px", borderRadius: 6, width: "100%", textAlign: "end", fontSize: 12 };
  const selectCell: React.CSSProperties = { ...inputCell, textAlign: align };


  useEffect(() => {
    if (!autoFocus) return;
    const id = window.setTimeout(() => localRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [autoFocus]);


  const { data: productsRaw = [] } = useQuery({
    queryKey: ["products_for_purchase"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: ctxPwsMap = {} } = useProductStockForCurrentWarehouse();
  const { data: pickedPwsMap = {} } = useWarehouseStockMap(warehouseId ?? null);
  const pwsMap = warehouseId ? pickedPwsMap : ctxPwsMap;
  const products = useMemo(
    () => (productsRaw as any[]).map((p) => ({ ...p, stock: pwsMap[p.id] ?? Number(p.stock ?? 0) })),
    [productsRaw, pwsMap],
  );

  const matches = useMemo(() => {
    if (!search.trim()) return [];
    const q = normalizeArabicText(search);
    return (products as any[]).filter((p) =>
      [p.name, p.name_en, p.sku].filter(Boolean).some((v: string) => normalizeArabicText(String(v)).includes(q))
    ).slice(0, 8);
  }, [products, search]);

  const buildRow = (p: any): Row => {
    const choices = unitOptions(p);
    const first = choices[0] || { level: "main" as UnitLevel, name: p.unit || t("purchases.items.default_unit"), ratio: 1 };
    const tree: ProductUnitTree = {
      main_unit: p.main_unit, sub_unit_1: p.sub_unit_1, sub_unit_1_ratio: p.sub_unit_1_ratio,
      sub_unit_2: p.sub_unit_2, sub_unit_2_ratio: p.sub_unit_2_ratio,
    };
    return {
      product_id: p.id,
      description: p.name,
      quantity: 1,
      unit_price: priceForUnitLevel({ ...tree, price: Number(p.cost ?? 0) }, first.level, baseUnitsPer),
      base_price: Number(p.cost ?? 0),
      discount_percent: 0,
      total: Number(p.cost ?? 0),
      sell_price: Number(p.price ?? 0),
      unit_level: first.level,
      unit_name: first.name,
      base_factor: first.ratio,
      base_quantity: toBase(1, first.level, tree),
      unit_choices: choices.length ? choices : [first],
      product_units: tree,
      has_expiry: !!p.has_expiry,
      expiry_date: "",
      previous_cost: p.previous_cost ?? null,
      last_purchase_discount: p.last_purchase_discount ?? null,
      current_stock_base: Number(p.stock ?? 0),
      main_unit_name: p.main_unit || p.unit || "",
    };
  };

  const addProduct = (p: any) => {
    const next = [...rows, buildRow(p)];
    onChange(next);
    setSearch(""); setShowResults(false);
    const newIdx = next.length - 1;
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLInputElement>(
        `[data-row-index="${newIdx}"] [data-row-cell="qty"] input`
      );
      if (el) { el.focus(); el.select(); } else { localRef.current?.focus(); }
    });
  };

  // Auto-add when exactly one match (debounced)
  useEffect(() => {
    if (!search.trim()) return;
    if (matches.length !== 1) return;
    const id = window.setTimeout(() => {
      // re-check still single match for current search
      addProduct(matches[0]);
    }, 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, matches]);


  // addBlank removed — "صنف جديد" opens product creation page in new tab.

  const update = (i: number, patch: Partial<Row>) => {
    const next = rows.map((r, idx) => idx === i ? { ...r, ...patch } : r);
    const r = next[i];
    r.total = calcRowTotal(r);
    if (r.product_units) {
      r.base_quantity = toBase(Number(r.quantity) || 0, r.unit_level, r.product_units);
    } else {
      r.base_quantity = Math.max(0, Math.round((Number(r.quantity) || 0) * (Number(r.base_factor) || 1)));
    }
    onChange(next);
  };

  const changeUnit = (i: number, level: UnitLevel) => {
    const r = rows[i];
    const choice = r.unit_choices.find((c) => c.level === level);
    if (!choice) return;
    // Divide the per-MAIN-unit cost down the unit tree, exactly like Sales does.
    const newPrice = r.product_units
      ? priceForUnitLevel({ ...r.product_units, price: r.base_price ?? r.unit_price }, level, baseUnitsPer)
      : (r.base_price ?? r.unit_price) * (choice.ratio || 1);
    update(i, { unit_level: level, unit_name: choice.name, base_factor: choice.ratio, unit_price: newPrice });
  };

  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        localRef.current?.focus();
        localRef.current?.select();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const cell = target.closest<HTMLElement>("[data-row-cell]");
      if (!cell) return;
      const rowEl = cell.closest<HTMLElement>("[data-row-index]");
      if (!rowEl) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const cellName = cell.getAttribute("data-row-cell");
        const idx = Number(rowEl.getAttribute("data-row-index"));
        const next = e.key === "ArrowUp" ? idx - 1 : idx + 1;
        const sel = `[data-row-index="${next}"] [data-row-cell="${cellName}"] input, [data-row-index="${next}"] [data-row-cell="${cellName}"] select`;
        const el = document.querySelector<HTMLElement>(sel);
        if (el) {
          el.focus();
          if (el instanceof HTMLInputElement) el.select();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <div dir={dir}>
      <KeyboardHints />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="h-4 w-4 absolute top-1/2 -translate-y-1/2" style={{ insetInlineEnd: "0.75rem", color: "#9ca3af" }} />
          <input
            ref={setSearchRef}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowResults(true); setHighlightIdx(0); }}
            onFocus={() => setShowResults(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearch("");
                setShowResults(false);
                return;
              }
              if (!showResults || matches.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightIdx((i) => Math.min(matches.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightIdx((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const target = matches[highlightIdx] ?? matches[0];
                if (target) addProduct(target);
              }
            }}
            placeholder={t("purchases.items.search_ph")}
            className="h-10 px-3 pe-9 rounded-md text-sm w-full outline-none"
            style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff" }}
          />

          {showResults && matches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md shadow-md max-h-64 overflow-auto" style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb" }}>
              {matches.map((p: any, idx: number) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => addProduct(p)}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  className="w-full text-start px-3 py-2 text-sm"
                  style={{ backgroundColor: idx === highlightIdx ? "#eff6ff" : "transparent" }}
                >
                  <div style={{ color: "#111827", fontWeight: 600 }}>{p.name}{p.name_en ? ` — ${p.name_en}` : ""}</div>
                  <div className="text-xs" style={{ color: "#6b7280" }}>
                    {p.sku || "—"} • {formatBaseQuantity(Number(p.stock ?? 0), p)} • {t("purchases.items.purchase_short", { amount: Number(p.cost ?? 0).toFixed(2) })}
                  </div>
                </button>
              ))}
            </div>
          )}

        </div>
        <button type="button" onClick={() => window.open("/products/add", "_blank")} className="h-10 px-3 rounded-md text-sm flex items-center gap-1.5" style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151" }}>
          <Plus className="h-4 w-4" /> {t("purchases.items.new_item")}
        </button>

      </div>

      <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #e5e7eb" }}>
        <table className="w-full text-xs" style={{ borderCollapse: "collapse", tableLayout: "fixed", minWidth: 1180 }}>
          <thead>
            <tr>
              <th style={{ ...headStyle, width: 32 }}>#</th>
              <th style={{ ...headStyle, minWidth: 160 }}>{t("purchases.items.col_name")}</th>
              <th style={{ ...headStyle, width: 100 }}>المخزون</th>
              <th style={{ ...headStyle, width: 80 }}>{t("purchases.items.col_qty")}</th>
              <th style={{ ...headStyle, width: 110 }}>{t("purchases.items.col_unit")}</th>
              <th style={{ ...headStyle, width: 100 }}>{t("purchases.items.col_price")}</th>
              <th style={{ ...headStyle, width: 80 }}>{t("purchases.items.col_discount")}</th>
              <th style={{ ...headStyle, width: 90 }}>{t("purchases.items.col_total")}</th>
              <th style={{ ...headStyle, width: 100 }}>{t("purchases.items.col_sell_price")}</th>
              <th style={{ ...headStyle, width: 200 }}>{t("purchases.items.col_expiry")}</th>
              <th style={{ ...headStyle, width: 48 }}></th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-6 text-sm" style={{ color: "#6b7280" }}>{t("purchases.items.empty")}</td></tr>
            ) : rows.map((r, i) => {
              const stockBase = Number(r.current_stock_base ?? 0);
              const stockLabel = r.product_units
                ? formatBaseQuantity(stockBase, r.product_units)
                : `${stockBase.toLocaleString()} ${r.main_unit_name || ""}`;
              return (
              <tr key={i} data-row-index={i}>
                <td style={cellStyle}>{i + 1}</td>
                <td style={cellStyle} data-row-cell="desc">
                  <input value={r.description} title={r.description} readOnly onChange={(e) => update(i, { description: e.target.value })} style={{ ...inputCell, textAlign: align, backgroundColor: "#f9fafb", overflow: "hidden", textOverflow: "ellipsis" }} />
                </td>
                <td style={{ ...cellStyle, textAlign: "center", fontWeight: 700, color: r.product_id ? "#374151" : "#9ca3af", overflow: "hidden", textOverflow: "ellipsis" }} title={r.product_id ? stockLabel : ""}>
                  {r.product_id ? stockLabel : "—"}
                </td>



                <td style={cellStyle} data-row-cell="qty">
                  <input type="number" min={0} step="any" value={r.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} style={inputCell} />
                </td>
                <td style={cellStyle} data-row-cell="unit">
                  {r.unit_choices.length > 1 ? (
                    <select value={r.unit_level} onChange={(e) => changeUnit(i, e.target.value as UnitLevel)} style={selectCell}>
                      {r.unit_choices.map((c) => <option key={c.level} value={c.level}>{c.name}</option>)}
                    </select>
                  ) : (
                    <input value={r.unit_name} onChange={(e) => update(i, { unit_name: e.target.value })} style={{ ...inputCell, textAlign: align }} placeholder="—" />
                  )}
                </td>
                <td style={cellStyle} data-row-cell="price">
                  <input type="number" min={0} step="0.01" value={r.unit_price} onChange={(e) => update(i, { unit_price: Number(e.target.value) })} style={inputCell} title={r.previous_cost != null ? `سعر الشراء السابق: ${Number(r.previous_cost).toFixed(2)}` : undefined} />
                  {r.previous_cost != null && <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2, textAlign: "center" }}>سابق: {Number(r.previous_cost).toFixed(2)}</div>}
                </td>
                <td style={cellStyle} data-row-cell="discount">
                  <input type="number" min={0} max={100} step="0.01" value={r.discount_percent} onChange={(e) => update(i, { discount_percent: Number(e.target.value) })} style={inputCell} title={r.last_purchase_discount != null ? `أعلى خصم سابق: ${Number(r.last_purchase_discount).toFixed(2)}%` : undefined} />
                  {r.last_purchase_discount != null && Number(r.last_purchase_discount) > 0 && <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2, textAlign: "center" }}>أعلى: {Number(r.last_purchase_discount).toFixed(1)}%</div>}
                </td>
                <td style={cellStyle}>{r.total.toFixed(2)}</td>
                <td style={cellStyle} data-row-cell="sell"><input type="number" min={0} step="0.01" value={r.sell_price} onChange={(e) => update(i, { sell_price: Number(e.target.value) })} style={inputCell} /></td>
                <td style={{ ...cellStyle, whiteSpace: "normal", overflow: "visible" }} data-row-cell="expiry">
                  <DateInput
                    value={r.expiry_date || ""}
                    onChange={(v: string) => update(i, { expiry_date: v })}
                    style={{ ...inputCell, textAlign: align, minWidth: 180 }}
                  />
                </td>
                <td style={{ ...cellStyle, textAlign: "center", padding: "6px 2px" }}>
                  <button type="button" onClick={() => remove(i)} className="h-8 w-8 inline-flex items-center justify-center" style={{ color: "#ef4444" }}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
