import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Search, Trash2 } from "lucide-react";
import { unitOptions, toBase, toMainUnits, formatBaseQuantity, type UnitLevel, type ProductUnitTree } from "@/lib/units";
import { normalizeArabicText } from "@/lib/arabic";
import { SelectExpiryDateModal } from "@/components/sales/cashier/SelectExpiryDateModal";
import { KeyboardHints } from "@/components/shared/KeyboardHints";
import { useProductStockForCurrentWarehouse, useWarehouseStockMap } from "@/hooks/use-warehouse-stock";


export type SaleRow = {
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  base_price: number;
  discount_amount: number;
  total: number;
  unit_level: UnitLevel;
  unit_name: string;
  base_factor: number;
  base_quantity: number;
  unit_choices: Array<{ level: UnitLevel; name: string; ratio: number }>;
  product_units?: ProductUnitTree;
  expiry_date?: string | null;
  current_stock_base?: number;
  main_unit_name?: string;
};

export function calcSaleRowTotal(r: SaleRow) {
  const gross = (Number(r.quantity) || 0) * (Number(r.unit_price) || 0);
  const disc = Number(r.discount_amount) || 0;
  return Math.max(0, gross - disc);
}

const headStyleBase: React.CSSProperties = { backgroundColor: "#10b981", color: "#ffffff", padding: "10px 12px", fontWeight: 600, fontSize: 13 };
const cellStyle: React.CSSProperties = { borderBottom: "1px solid #e5e7eb", padding: "8px 8px", color: "#374151", verticalAlign: "top" };
const inputCell: React.CSSProperties = { border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151", height: 32, padding: "0 8px", borderRadius: 6, width: "100%", textAlign: "end" };

export function SalesItemsTable({
  rows, onChange, searchRef: externalSearchRef, autoFocus, warehouseId,
}: {
  rows: SaleRow[];
  onChange: (rows: SaleRow[]) => void;
  searchRef?: React.MutableRefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  warehouseId?: string | null;
}) {
  const { user } = useAuth();
  const { t, dir } = useI18n();
  const headStyle: React.CSSProperties = { ...headStyleBase, textAlign: dir === "rtl" ? "right" : "left" };
  const selectCell: React.CSSProperties = { ...inputCell, textAlign: dir === "rtl" ? "right" : "left" };
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const localRef = useRef<HTMLInputElement | null>(null);
  const setSearchRef = (el: HTMLInputElement | null) => {
    localRef.current = el;
    if (externalSearchRef) externalSearchRef.current = el;
  };

  useEffect(() => {
    if (autoFocus) {
      const id = window.setTimeout(() => localRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [autoFocus]);


  const { data: productsRaw = [] } = useQuery({
    queryKey: ["products_for_sale"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").limit(500);
      if (error) throw error;
      return (data ?? []).filter((p: any) => p.is_active !== false);
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

  const buildRow = (p: any, expiry: string | null): SaleRow => {
    const choices = unitOptions(p);
    const first = choices[0] || { level: "main" as UnitLevel, name: p.unit || t("sales.items.col.unit"), ratio: 1 };
    const tree: ProductUnitTree = {
      main_unit: p.main_unit, sub_unit_1: p.sub_unit_1, sub_unit_1_ratio: p.sub_unit_1_ratio,
      sub_unit_2: p.sub_unit_2, sub_unit_2_ratio: p.sub_unit_2_ratio,
    };
    const basePrice = Number(p.price ?? 0);
    return {
      product_id: p.id,
      description: p.name,
      quantity: 1,
      base_price: basePrice,
      unit_price: basePrice * (first.ratio || 1),
      discount_amount: 0,
      total: basePrice * (first.ratio || 1),
      unit_level: first.level,
      unit_name: first.name,
      base_factor: first.ratio,
      base_quantity: toBase(1, first.level, tree),
      unit_choices: choices.length ? choices : [first],
      product_units: tree,
      expiry_date: expiry,
      current_stock_base: Number(p.stock ?? 0),
      main_unit_name: p.main_unit || p.unit || "",
    };
  };

  const [expiryFor, setExpiryFor] = useState<any | null>(null);

  const addProductWithExpiry = (p: any, expiry: string | null) => {
    const next = [...rows, buildRow(p, expiry)];
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

  const addProduct = async (p: any) => {
    // Mirror cashier logic: detect batches by purchase records and prompt if multiple.
    const today = new Date().toISOString().slice(0, 10);
    const [piRes, iiRes] = await Promise.all([
      (supabase.from("purchase_items") as any)
        .select("expiry_date, base_quantity, quantity")
        .eq("product_id", p.id)
        .not("expiry_date", "is", null)
        .gte("expiry_date", today),
      (supabase.from("invoice_items") as any)
        .select("expiry_date, base_quantity, quantity")
        .eq("product_id", p.id)
        .not("expiry_date", "is", null),
    ]);
    const perDate = new Map<string, number>();
    ((piRes.data as any[]) || []).forEach((r) => {
      const q = Number(r.base_quantity ?? r.quantity ?? 0);
      perDate.set(r.expiry_date, (perDate.get(r.expiry_date) || 0) + q);
    });
    ((iiRes.data as any[]) || []).forEach((r) => {
      const q = Math.abs(Number(r.base_quantity ?? r.quantity ?? 0));
      if (perDate.has(r.expiry_date)) {
        perDate.set(r.expiry_date, (perDate.get(r.expiry_date) || 0) - q);
      }
    });
    const available = Array.from(perDate.entries())
      .filter(([, rem]) => rem > 0)
      .map(([d]) => d)
      .sort();

    if (available.length === 1) {
      addProductWithExpiry(p, available[0]);
      return;
    }
    if (available.length > 1) {
      setExpiryFor(p);
      setSearch(""); setShowResults(false);
      return;
    }
    if (p?.has_expiry === true) {
      setExpiryFor(p);
      setSearch(""); setShowResults(false);
      return;
    }
    addProductWithExpiry(p, null);
  };

  useEffect(() => {
    if (!search.trim()) return;
    if (matches.length !== 1) return;
    const id = window.setTimeout(() => addProduct(matches[0]), 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, matches]);
  useEffect(() => { setActiveIndex(0); }, [search]);



  const update = (i: number, patch: Partial<SaleRow>) => {
    const next = rows.map((r, idx) => idx === i ? { ...r, ...patch } : r);
    const r = next[i];
    r.total = calcSaleRowTotal(r);
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
    const newPrice = (r.base_price || r.unit_price) * (choice.ratio || 1);
    update(i, { unit_level: level, unit_name: choice.name, base_factor: choice.ratio, unit_price: newPrice });
  };

  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  // Global keyboard shortcuts: F2 → focus search, ↑/↓ → move between row inputs
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
      <div className="relative mb-3">
        <Search className="h-4 w-4 absolute top-1/2 -translate-y-1/2" style={{ insetInlineEnd: "0.75rem", color: "#9ca3af" }} />
        <input
          ref={setSearchRef}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setShowResults(true); setActiveIndex(0); }}
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
              setActiveIndex((i) => Math.min(matches.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const p = matches[Math.min(activeIndex, matches.length - 1)];
              if (p) addProduct(p);
            }
          }}
          placeholder={t("sales.items.search_placeholder")}
          className="h-10 px-3 pe-9 rounded-md text-sm w-full outline-none"
          style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff" }}
        />

        {showResults && matches.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md shadow-md max-h-64 overflow-auto" style={{ backgroundColor: "#ffffff", border: "1px solid #d1d5db" }}>
            {matches.map((p: any, idx: number) => (
              <button
                type="button"
                key={p.id}
                onClick={() => addProduct(p)}
                onMouseEnter={() => setActiveIndex(idx)}
                className="w-full text-start px-3 py-2 text-sm"
                style={{ backgroundColor: idx === activeIndex ? "#eff6ff" : "transparent" }}
              >
                <div style={{ color: "#111827", fontWeight: 600 }}>{p.name}{p.name_en ? ` — ${p.name_en}` : ""}</div>
                <div className="text-xs" style={{ color: "#6b7280" }}>{p.sku || "—"} • {t("sales.items.price")} {Number(p.price ?? 0).toFixed(2)}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #d1d5db" }}>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ ...headStyle, minWidth: 240 }}>{t("sales.items.col.item")}</th>
              <th style={{ ...headStyle, width: 110, textAlign: "center" }}>المخزون الحالي</th>
              <th style={{ ...headStyle, width: 130 }}>{t("sales.items.col.unit_price")}</th>
              <th style={{ ...headStyle, width: 110 }}>{t("sales.items.col.qty")}</th>
              <th style={{ ...headStyle, width: 130 }}>{t("sales.items.col.unit")}</th>
              <th style={{ ...headStyle, width: 120 }}>{t("sales.items.col.unit_discount")}</th>
              <th style={{ ...headStyle, width: 110 }}>{t("sales.items.col.total")}</th>
              <th style={{ ...headStyle, width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-6 text-sm" style={{ color: "#6b7280" }}>{t("sales.items.empty")}</td></tr>
            ) : rows.map((r, i) => {
              const stockBase = Number(r.current_stock_base ?? 0);
              const stockLabel = r.product_units
                ? formatBaseQuantity(stockBase, r.product_units)
                : `${stockBase.toLocaleString()} ${r.main_unit_name || ""}`;
              return (
              <tr key={i} data-row-index={i}>
                <td style={cellStyle} data-row-cell="desc">
                  <input value={r.description} title={r.description} readOnly onChange={(e) => update(i, { description: e.target.value })} style={{ ...inputCell, textAlign: dir === "rtl" ? "right" : "left", minWidth: 220, backgroundColor: "#f9fafb", whiteSpace: "normal", wordBreak: "break-word" }} />
                </td>
                <td style={{ ...cellStyle, textAlign: "center", fontWeight: 700, color: r.product_id ? "#374151" : "#9ca3af" }}>
                  {r.product_id ? stockLabel : "—"}
                </td>

                <td style={cellStyle} data-row-cell="price"><input type="number" min={0} step="0.01" value={r.unit_price} onChange={(e) => update(i, { unit_price: Number(e.target.value) })} style={inputCell} /></td>
                <td style={cellStyle} data-row-cell="qty">
                  <input type="number" min={0} step="any" value={r.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} style={inputCell} />
                </td>
                <td style={cellStyle} data-row-cell="unit">
                  <select value={r.unit_level} onChange={(e) => changeUnit(i, e.target.value as UnitLevel)} style={selectCell}>
                    {r.unit_choices.map((c) => <option key={c.level} value={c.level}>{c.name}</option>)}
                  </select>
                </td>
                <td style={cellStyle} data-row-cell="discount"><input type="number" min={0} step="0.01" value={r.discount_amount} onChange={(e) => update(i, { discount_amount: Number(e.target.value) })} style={inputCell} /></td>
                <td style={cellStyle}>{r.total.toFixed(2)}</td>
                <td style={cellStyle}>
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
      {expiryFor && (
        <SelectExpiryDateModal
          product={expiryFor}
          onClose={() => setExpiryFor(null)}
          onSelect={(d) => { addProductWithExpiry(expiryFor, d); setExpiryFor(null); }}
        />
      )}
    </div>
  );
}
