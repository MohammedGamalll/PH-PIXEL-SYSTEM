import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/contexts/SettingsContext";
import { formatCurrency } from "@/lib/format";
import { computeProductBatches } from "@/lib/product-batches";
import { Save, CheckCircle2, Printer, X, Trash2, Search } from "lucide-react";
import { z } from "zod";
import {
  formatBaseQuantity,
  formatMainQuantity,
  varianceValueFromBase,
  baseUnitName,
  baseUnitsPer,
  type ProductUnitTree,
} from "@/lib/units";
import { useUnsavedChangesPrompt } from "@/hooks/use-unsaved-prompt";

type Row = {
  key: string;
  id?: string;
  product_id: string;
  product_name: string;
  sku: string;
  system_qty: number; // base units (per-batch)
  cost_at_time: number; // per main unit (matches products.cost)
  expiry_date: string;
  original_expiry_date: string; // remembers the loaded expiry so edits propagate to the right batch
  // physical qty split per unit level — all stored as input strings, converted to base on save
  phys_main: string;
  phys_sub1: string;
  phys_sub2: string;
  is_new_batch: boolean;
  expiry_locked: boolean; // true for auto-loaded batches
  unit_tree: ProductUnitTree;
};

const PRODUCT_COLS =
  "id,name,name_en,sku,stock,cost,is_active,has_expiry,main_unit,sub_unit_1,sub_unit_1_ratio,sub_unit_2,sub_unit_2_ratio";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const headerSchema = z.object({ count_date: z.string().regex(dateRe, "Invalid date") });

function normalizeArabic(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/[\u064B-\u065F\u0640\u0670]/g, "") // tashkeel, tatweel, dagger alef
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .trim();
}


function unitTreeFrom(p: any): ProductUnitTree {
  return {
    main_unit: p?.main_unit ?? null,
    sub_unit_1: p?.sub_unit_1 ?? null,
    sub_unit_1_ratio: p?.sub_unit_1_ratio ?? null,
    sub_unit_2: p?.sub_unit_2 ?? null,
    sub_unit_2_ratio: p?.sub_unit_2_ratio ?? null,
  };
}

/** Physical qty (in base units) from a row's 3 input fields. */
function physBaseFromRow(r: Row): number {
  const m = Number(r.phys_main) || 0;
  const s1 = Number(r.phys_sub1) || 0;
  const s2 = Number(r.phys_sub2) || 0;
  const tree = r.unit_tree;
  let total = 0;
  if (tree.main_unit) total += m * baseUnitsPer(tree, "main");
  else total += m; // no tree → main field is base
  if (tree.sub_unit_1) total += s1 * baseUnitsPer(tree, "sub1");
  if (tree.sub_unit_2) total += s2; // sub2 is base
  return Math.max(0, Math.round(total));
}

function rowHasPhysicalInput(r: Row): boolean {
  return r.phys_main !== "" || r.phys_sub1 !== "" || r.phys_sub2 !== "";
}

/** Decompose a stored base qty into the row's input fields (for loading). */
function splitBaseToFields(base: number, tree: ProductUnitTree): { main: string; sub1: string; sub2: string } {
  let remaining = Math.max(0, Math.floor(Number(base) || 0));
  let main = 0, sub1 = 0, sub2 = 0;
  if (tree.main_unit) {
    const perMain = baseUnitsPer(tree, "main");
    main = Math.floor(remaining / perMain);
    remaining -= main * perMain;
  }
  if (tree.sub_unit_1) {
    const perSub1 = baseUnitsPer(tree, "sub1");
    sub1 = Math.floor(remaining / perSub1);
    remaining -= sub1 * perSub1;
  }
  if (tree.sub_unit_2) sub2 = remaining;
  else if (!tree.sub_unit_1 && !tree.main_unit) main = remaining;
  return {
    main: main ? String(main) : "",
    sub1: sub1 ? String(sub1) : "",
    sub2: sub2 ? String(sub2) : "",
  };
}

/** Load remaining-per-expiry batches for a product.
 * Uses the shared helper so count form, product card, and details
 * always show identical numbers. No reconciliation with products.stock —
 * batch totals are the raw movement-based truth. */
async function loadBatchesForProduct(productId: string): Promise<Array<{ expiry_date: string; remaining: number }>> {
  const list = await computeProductBatches(productId);
  return list
    .filter((b) => b.remaining > 0)
    .map((b) => ({ expiry_date: b.expiry_date, remaining: Math.round(b.remaining) }));
}


function makeRow(opts: {
  product: any;
  expiry_date?: string;
  original_expiry_date?: string;
  system_qty: number;
  is_new_batch?: boolean;
  expiry_locked?: boolean;
}): Row {
  const tree = unitTreeFrom(opts.product);
  const exp = opts.expiry_date || "";
  return {
    key: crypto.randomUUID(),
    product_id: opts.product.id,
    product_name: opts.product.name,
    sku: opts.product.sku || "",
    system_qty: Number(opts.system_qty || 0),
    cost_at_time: Number(opts.product.cost || 0),
    expiry_date: exp,
    original_expiry_date: opts.original_expiry_date ?? (opts.expiry_locked ? exp : ""),
    phys_main: "",
    phys_sub1: "",
    phys_sub2: "",
    is_new_batch: !!opts.is_new_batch,
    expiry_locked: !!opts.expiry_locked,
    unit_tree: tree,
  };
}

export function CountForm({
  existingId,
  initial,
  readOnly = false,
  autoPrint = false,
}: {
  existingId?: string;
  initial?: any;
  readOnly?: boolean;
  autoPrint?: boolean;
}) {
  const { dir, lang } = useI18n();
  const isAr = lang === "ar";
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { settings } = useSettings();

  const today = new Date().toISOString().slice(0, 10);
  const [refNo, setRefNo] = useState<string>(initial?.ref_no || "");
  const [countDate, setCountDate] = useState<string>(initial?.count_date || today);
  const [categoryId, setCategoryId] = useState<string>(initial?.category_filter_id || "");
  const [brandId, setBrandId] = useState<string>(initial?.brand_filter_id || "");
  const [notes, setNotes] = useState<string>(initial?.notes || "");
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const submittedRef = useRef(false);
  const dirtySnap = JSON.stringify({ refNo, countDate, categoryId, brandId, notes, rows });
  const baselineRef = useRef(dirtySnap);
  useEffect(() => { baselineRef.current = dirtySnap; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [initial?.id]);
  useUnsavedChangesPrompt(() => !readOnly && !submittedRef.current && dirtySnap !== baselineRef.current);


  const [searchTerm, setSearchTerm] = useState("");
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const autoAddRef = useRef<string | null>(null);

  const { data: cats = [] } = useQuery({
    queryKey: ["product-categories-min"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id,name").order("name");
      return (data as any[]) || [];
    },
  });
  const { data: brands = [] } = useQuery({
    queryKey: ["brands-min"],
    queryFn: async () => {
      const { data } = await supabase.from("brands").select("id,name").order("name");
      return (data as any[]) || [];
    },
  });

  const trimmedSearch = searchTerm.trim();
  const { data: allProducts = [] } = useQuery({
    queryKey: ["count-product-search-all", categoryId, brandId],
    enabled: !readOnly,
    queryFn: async () => {
      let q = supabase.from("products").select(PRODUCT_COLS).eq("is_active", true).limit(500);
      if (categoryId) q = q.eq("category_id", categoryId);
      if (brandId) q = q.eq("brand_id", brandId);
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const searchResults = useMemo(() => {
    if (!trimmedSearch) return [];
    const norm = normalizeArabic(trimmedSearch);
    return allProducts.filter(
      (p) =>
        normalizeArabic(p.name).includes(norm) ||
        normalizeArabic((p as any).name_en).includes(norm) ||
        normalizeArabic(p.sku || "").includes(norm)
    );
  }, [allProducts, trimmedSearch]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Auto-add when exactly one match
  useEffect(() => {
    if (readOnly || searchResults.length !== 1 || !trimmedSearch) return;
    const p = searchResults[0];
    if (autoAddRef.current === p.id) return;
    autoAddRef.current = p.id;
    addProductWithBatches(p);
    setSearchTerm("");
    setShowResults(false);
  }, [searchResults, trimmedSearch, readOnly]);

  // Load existing items if editing
  useEffect(() => {
    if (!existingId) return;
    (async () => {
      const { data, error } = await supabase
        .from("stock_adjustment_items" as any)
        .select(`*, products(${PRODUCT_COLS})`)
        .eq("adjustment_id", existingId);
      if (error) { toast.error(error.message); return; }
      const mapped: Row[] = (data as any[]).map((it, i) => {
        const tree = unitTreeFrom(it.products);
        const split = splitBaseToFields(Number(it.physical_qty || 0), tree);
        const exp = it.expiry_date || "";
        return {
          key: it.id || String(i),
          id: it.id,
          product_id: it.product_id,
          product_name: it.products?.name || "—",
          sku: it.products?.sku || "",
          system_qty: Number(it.system_qty || 0),
          cost_at_time: Number(it.products?.cost ?? it.cost_at_time ?? 0),
          expiry_date: exp,
          original_expiry_date: it.original_expiry_date || (it.is_new_batch ? "" : exp),
          phys_main: Number(it.physical_qty || 0) > 0 ? split.main : "",
          phys_sub1: Number(it.physical_qty || 0) > 0 ? split.sub1 : "",
          phys_sub2: Number(it.physical_qty || 0) > 0 ? split.sub2 : "",
          is_new_batch: !!it.is_new_batch,
          expiry_locked: !!it.expiry_date && !it.is_new_batch,
          unit_tree: tree,
        };
      });
      setRows(mapped);
      // Reset unsaved-changes baseline once edit data has populated
      setTimeout(() => { baselineRef.current = JSON.stringify({ refNo, countDate, categoryId, brandId, notes, rows: mapped }); }, 0);
    })();
  }, [existingId]);

  /** Expand a product into per-batch rows when it has expiry; one row otherwise. */
  const addProductWithBatches = async (p: any) => {
    if (rows.some((r) => !r.is_new_batch && r.product_id === p.id)) {
      toast.info(isAr ? "الصنف مضاف بالفعل" : "Already added");
      return;
    }
    const hasExpiry = !!p.has_expiry;
    if (hasExpiry) {
      try {
        const batches = await loadBatchesForProduct(p.id);
        if (batches.length > 0) {
          const newRows = batches.map((b) =>
            makeRow({
              product: p,
              expiry_date: b.expiry_date,
              original_expiry_date: b.expiry_date,
              system_qty: b.remaining,
              expiry_locked: !!b.expiry_date, // no-expiry batch stays editable
            }),
          );
          setRows((prev) => [...prev, ...newRows]);
          return;
        }
      } catch (e: any) {
        toast.error(e.message || "batch load failed");
      }
    }
    setRows((prev) => [...prev, makeRow({ product: p, system_qty: Number(p.stock || 0), expiry_date: p.expiry_date || "" })]);
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (searchResults.length >= 1) {
        addProductWithBatches(searchResults[0]);
        setSearchTerm("");
        setShowResults(false);
      }
    } else if (e.key === "Escape") {
      setShowResults(false);
    }
  };

  const loadProducts = useMutation({
    mutationFn: async () => {
      let q = supabase.from("products").select(PRODUCT_COLS).eq("is_active", true);
      if (categoryId) q = q.eq("category_id", categoryId);
      if (brandId) q = q.eq("brand_id", brandId);
      const { data, error } = await q.order("name");
      if (error) throw error;
      return data as any[];
    },
    onSuccess: async (products) => {
      const existingIds = new Set(rows.filter((r) => !r.is_new_batch).map((r) => r.product_id));
      const fresh = products.filter((p) => !existingIds.has(p.id));
      const additions: Row[] = [];
      for (const p of fresh) {
        if (p.has_expiry) {
          try {
            const batches = await loadBatchesForProduct(p.id);
            if (batches.length > 0) {
              batches.forEach((b) =>
                additions.push(makeRow({
                  product: p,
                  expiry_date: b.expiry_date,
                  original_expiry_date: b.expiry_date,
                  system_qty: b.remaining,
                  expiry_locked: !!b.expiry_date,
                })),
              );
              continue;
            }
          } catch { /* fall through */ }
        }
        additions.push(makeRow({ product: p, system_qty: Number(p.stock || 0), expiry_date: p.expiry_date || "" }));
      }
      setRows((prev) => [...prev, ...additions]);
      toast.success(isAr ? `تم تحميل ${additions.length} صف` : `Loaded ${additions.length} rows`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const baseVarianceForRow = (r: Row): number => {
    if (!rowHasPhysicalInput(r)) return 0;
    const physBase = physBaseFromRow(r);
    return physBase - (r.is_new_batch ? 0 : r.system_qty);
  };

  const totals = useMemo(() => {
    let qty = 0, val = 0;
    const groups = new Map<string, { tree: any; base: number }>();
    for (const r of rows) {
      if (!rowHasPhysicalInput(r)) continue;
      const v = baseVarianceForRow(r);
      qty += v;
      val += varianceValueFromBase(v, r.cost_at_time, r.unit_tree);
      const key = r.product_id;
      const g = groups.get(key);
      if (g) g.base += v;
      else groups.set(key, { tree: r.unit_tree, base: v });
    }
    const qtyDisplay = Array.from(groups.values())
      .filter(g => g.base !== 0)
      .map(g => (g.base > 0 ? "+" : "-") + formatBaseQuantity(Math.abs(g.base), g.tree))
      .join(" | ") || "0";
    return { qty, val, qtyDisplay };
  }, [rows]);


  const updateRow = (key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));


  const persist = async (status: "draft" | "approved") => {
    const h = headerSchema.safeParse({ count_date: countDate });
    if (!h.success) throw new Error(isAr ? "تاريخ غير صالح (YYYY-MM-DD)" : "Invalid date (YYYY-MM-DD)");
    for (const r of rows) {
      if (r.expiry_date && !dateRe.test(r.expiry_date)) {
        throw new Error(isAr ? "صيغة تاريخ صلاحية خاطئة" : "Bad expiry format");
      }
    }
    if (status === "approved" && rows.every((r) => !rowHasPhysicalInput(r))) {
      throw new Error(isAr ? "أدخل كمية فعلية لصف واحد على الأقل" : "Enter physical qty in at least one row");
    }

    let id = existingId;
    let currentRef = refNo;
    if (!id) {
      if (!ownerId) throw new Error(isAr ? "جاري تحميل بيانات الحساب، حاول مرة أخرى" : "Loading account, try again");
      if (!currentRef) {
        const { data: rn, error: rnErr } = await supabase.rpc("next_doc_number" as any, {
          _owner: ownerId, _table: "stock_adjustments", _column: "ref_no", _prefix: "ADJ-", _pad: 4,
        });
        if (rnErr) throw rnErr;
        currentRef = rn as string;
      }
      const { data: ins, error: insErr } = await supabase
        .from("stock_adjustments" as any)
        .insert({
          owner_id: ownerId, created_by: user!.id, ref_no: currentRef, count_date: countDate,
          status: "draft", category_filter_id: categoryId || null, brand_filter_id: brandId || null,
          notes: notes || null,
        } as any)
        .select("id,ref_no").single();
      if (insErr) {
        if ((insErr as any).code === "23505") {
          throw new Error(isAr ? "رقم الجرد مستخدم بالفعل، حاول مرة أخرى" : "Reference number already used, try again");
        }
        throw insErr;
      }
      id = (ins as any).id;
      setRefNo((ins as any).ref_no);

    } else {
      // If editing an already-approved count, unsettle it first so the
      // header/items can be modified, then re-approve at the end.
      if (initial?.status === "approved") {
        const { error: usErr } = await (supabase as any).rpc("unsettle_stock_adjustment", { _adj_id: id });
        if (usErr) throw usErr;
        const { error: draftErr } = await supabase
          .from("stock_adjustments" as any)
          .update({ status: "draft" } as any)
          .eq("id", id);
        if (draftErr) throw draftErr;
      }
      const { error: upErr } = await supabase
        .from("stock_adjustments" as any)
        .update({
          count_date: countDate, category_filter_id: categoryId || null,
          brand_filter_id: brandId || null, notes: notes || null,
        } as any)
        .eq("id", id);
      if (upErr) throw upErr;
    }

    await supabase.from("stock_adjustment_items" as any).delete().eq("adjustment_id", id!);
    if (rows.length) {
      const payload = rows.map((r) => {
        const physBase = rowHasPhysicalInput(r) ? physBaseFromRow(r) : 0;
        const costMain = r.cost_at_time;
        return {
          adjustment_id: id, owner_id: ownerId, product_id: r.product_id,
          expiry_date: r.expiry_date || null,
          original_expiry_date: r.original_expiry_date || null,
          is_new_batch: r.is_new_batch,
          system_qty: r.system_qty,
          physical_qty: physBase,
          cost_at_time: costMain,
        };
      });
      const { error: itemsErr } = await supabase.from("stock_adjustment_items" as any).insert(payload as any);
      if (itemsErr) throw itemsErr;
    }

    if (status === "approved") {
      const { error: apErr } = await supabase
        .from("stock_adjustments" as any).update({ status: "approved" } as any).eq("id", id!);
      if (apErr) throw apErr;
      const { error: recalcErr } = await (supabase as any).rpc("recalc_product_stock");
      if (recalcErr) console.warn("recalc_product_stock failed:", recalcErr.message);
      const { error: settleErr } = await (supabase as any).rpc("settle_stock_adjustment", { _adj_id: id! });
      if (settleErr) {
        const msg = String(settleErr.message || "");
        const msgLower = msg.toLowerCase();
        if (msgLower.includes("pws_stock_nonneg")) {
          await supabase.from("stock_adjustments" as any).update({ status: "draft" } as any).eq("id", id!);
          throw new Error(isAr ? "الفرق يجعل رصيد المخزن سالباً — راجع الكميات الفعلية" : "Variance would make warehouse stock negative — review physical quantities");
        }
        if (!msgLower.includes("already") && !msgLower.includes("settled") && !msgLower.includes("معتمد")) {
          await supabase.from("stock_adjustments" as any).update({ status: "draft" } as any).eq("id", id!);
          throw settleErr;
        }
      }
    }
    return id!;
  };

  const onSaveDraft = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await persist("draft");
      submittedRef.current = true;
      toast.success(isAr ? "تم حفظ المسودة" : "Draft saved");
      qc.invalidateQueries({ queryKey: ["stock_adjustments"] });
      navigate({ to: "/inventory-count" });
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  const onApprove = async () => {
    if (readOnly || saving || submittedRef.current) return;
    if (!confirm(isAr ? "اعتماد الجرد وتسوية المخزون والقيود؟" : "Approve and settle?")) return;
    setSaving(true);
    try {
      await persist("approved");
      submittedRef.current = true;
      toast.success(isAr ? "تم الاعتماد والتسوية" : "Approved & settled");
      qc.invalidateQueries({ queryKey: ["stock_adjustments"] });
      navigate({ to: "/inventory-count" });
    } catch (e: any) {
      const msg = String(e.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("settled") || msg.includes("معتمد")) {
        submittedRef.current = true;
        toast.success(isAr ? "تم الاعتماد والتسوية" : "Approved & settled");
        qc.invalidateQueries({ queryKey: ["stock_adjustments"] });
        navigate({ to: "/inventory-count" });
        return;
      }
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  const onPrintEmpty = () => printSheet({ rows, refNo, countDate, isAr, filled: false, settings });
  const onPrintFilled = () => printSheet({ rows, refNo, countDate, isAr, filled: true, totals, settings });

  useEffect(() => {
    if (autoPrint && rows.length) onPrintFilled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint, rows.length]);

  const headStyle: React.CSSProperties = {
    backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px",
    fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13,
    borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap",
  };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "8px 10px", verticalAlign: "middle" };

  return (
    <div dir={dir} className="space-y-4 pb-24">
      {/* Top action bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 -mx-3 px-3 py-3 flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-bold text-gray-900">
            {isAr ? "ورقة جرد" : "Count sheet"} {refNo && <span className="text-blue-600">#{refNo}</span>}
          </h2>
          {readOnly && (
            <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800 font-medium">
              {isAr ? "معتمد - للقراءة فقط" : "Approved (read-only)"}
            </span>
          )}
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={onPrintEmpty} disabled={rows.length === 0}
            style={{ height: 36, padding: "0 12px", borderRadius: 6, display: "inline-flex", alignItems: "center", color: "#fff", fontSize: 13, marginInlineEnd: 8, marginBottom: 4, backgroundColor: "#2563eb", border: "1px solid #2563eb", cursor: rows.length === 0 ? "not-allowed" : "pointer", opacity: rows.length === 0 ? 0.5 : 1 }}>
            <Printer className="h-4 w-4" style={{ marginInlineEnd: 6 }} /> {isAr ? "طباعة ورقة جرد" : "Print empty sheet"}
          </button>
          {readOnly ? (
            <button type="button" onClick={onPrintFilled}
              style={{ height: 36, padding: "0 12px", borderRadius: 6, display: "inline-flex", alignItems: "center", color: "#fff", fontSize: 13, marginInlineEnd: 8, marginBottom: 4, backgroundColor: "#374151", border: "1px solid #374151", cursor: "pointer" }}>
              <Printer className="h-4 w-4" style={{ marginInlineEnd: 6 }} /> {isAr ? "طباعة التقرير" : "Print report"}
            </button>
          ) : (
            <>
              <button type="button" onClick={onSaveDraft} disabled={saving || !ownerId}
                style={{ height: 36, padding: "0 12px", borderRadius: 6, display: "inline-flex", alignItems: "center", color: "#fff", fontSize: 13, marginInlineEnd: 8, marginBottom: 4, backgroundColor: "#eab308", border: "1px solid #eab308", cursor: (saving || !ownerId) ? "not-allowed" : "pointer", opacity: (saving || !ownerId) ? 0.5 : 1 }}>
                <Save className="h-4 w-4" style={{ marginInlineEnd: 6 }} /> {isAr ? "حفظ كمسودة" : "Save draft"}
              </button>
              <button type="button" onClick={onApprove} disabled={saving || !ownerId}
                style={{ height: 36, padding: "0 12px", borderRadius: 6, display: "inline-flex", alignItems: "center", color: "#fff", fontSize: 13, marginInlineEnd: 8, marginBottom: 4, backgroundColor: "#16a34a", border: "1px solid #16a34a", cursor: (saving || !ownerId) ? "not-allowed" : "pointer", opacity: (saving || !ownerId) ? 0.5 : 1 }}>
                <CheckCircle2 className="h-4 w-4" style={{ marginInlineEnd: 6 }} /> {isAr ? "اعتماد وتسوية الجرد" : "Approve & settle"}
              </button>
              <button type="button" onClick={() => navigate({ to: "/inventory-count" })}
                style={{ height: 36, padding: "0 12px", borderRadius: 6, display: "inline-flex", alignItems: "center", color: "#fff", fontSize: 13, marginBottom: 4, backgroundColor: "#dc2626", border: "1px solid #dc2626", cursor: "pointer" }}>
                <X className="h-4 w-4" style={{ marginInlineEnd: 6 }} /> {isAr ? "إلغاء" : "Cancel"}
              </button>
            </>
          )}
        </div>

      </div>

      {/* Header inputs */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">{isAr ? "تاريخ الجرد" : "Count date"}</label>
            <input type="text" value={countDate} onChange={(e) => setCountDate(e.target.value)}
              placeholder="YYYY-MM-DD" disabled={readOnly}
              className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm disabled:bg-gray-50" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">{isAr ? "الفئة" : "Category"}</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={readOnly}
              className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm disabled:bg-gray-50">
              <option value="">{isAr ? "كل الفئات" : "All categories"}</option>
              {cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">{isAr ? "الماركة" : "Brand"}</label>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} disabled={readOnly}
              className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm disabled:bg-gray-50">
              <option value="">{isAr ? "كل الماركات" : "All brands"}</option>
              {brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            {!readOnly && (
              <button type="button" onClick={() => loadProducts.mutate()} disabled={loadProducts.isPending}
                className="h-9 px-4 rounded-md text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 w-full">
                {loadProducts.isPending ? "..." : (isAr ? "تحميل الأصناف" : "Load products")}
              </button>
            )}
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block text-xs text-gray-600 mb-1">{isAr ? "ملاحظات" : "Notes"}</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} rows={2}
              className="w-full px-3 py-2 rounded-md border border-gray-200 text-sm disabled:bg-gray-50" />
          </div>
        </div>
      </div>

      {/* Product search */}
      {!readOnly && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="block text-xs text-gray-600 mb-1">
            {isAr ? "بحث عن صنف (يتم الإضافة تلقائياً عند تطابق صنف واحد)" : "Search product (auto-adds when one match)"}
          </label>
          <div ref={searchRef} className="relative">
            <div className="flex items-center gap-2 border border-gray-200 rounded-md px-3 h-10 bg-white">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setShowResults(true); if (!e.target.value.trim()) autoAddRef.current = null; }}
                onFocus={() => setShowResults(true)}
                onKeyDown={onSearchKey}
                placeholder={isAr ? "اكتب اسم الصنف أو SKU..." : "Type product name or SKU..."}
                className="flex-1 h-full bg-transparent outline-none text-sm"
              />
            </div>
            {showResults && trimmedSearch.length >= 1 && (
              <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-72 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <div className="p-3 text-sm text-gray-500 text-center">
                    {isAr ? "لا توجد نتائج" : "No results"}
                  </div>
                ) : searchResults.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { addProductWithBatches(p); setSearchTerm(""); setShowResults(false); }}
                    className="w-full text-start px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="text-sm font-medium text-gray-900">{p.name}</div>
                    <div className="text-xs text-gray-500 flex gap-3">
                      {p.sku && <span>SKU: {p.sku}</span>}
                      <span>{isAr ? "الرصيد" : "Stock"}: {formatBaseQuantity(Number(p.stock || 0), unitTreeFrom(p))}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 1200 }}>
            <thead>
              <tr>
                <th style={headStyle}>#</th>
                <th style={headStyle}>{isAr ? "الصنف / شجرة الوحدات" : "Product / unit tree"}</th>
                <th style={headStyle}>SKU</th>
                <th style={headStyle}>{isAr ? "الرصيد الدفتري" : "System qty"}</th>
                <th style={headStyle}>{isAr ? "تاريخ الصلاحية" : "Expiry"}</th>
                <th style={headStyle}>{isAr ? "الرصيد الفعلي" : "Physical qty"}</th>
                <th style={headStyle}>{isAr ? "التكلفة" : "Cost"}</th>
                <th style={headStyle}>{isAr ? "الفرق" : "Variance"}</th>
                <th style={headStyle} title={isAr ? "قيمة الفرق = الفرق × التكلفة" : "Variance value = variance × cost"}>
                  {isAr ? "قيمة الفرق" : "Variance value"}
                </th>
                {!readOnly && <th style={headStyle}>{isAr ? "إجراءات" : "Actions"}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={readOnly ? 9 : 10} style={{ ...cellStyle, textAlign: "center", color: "#6b7280", padding: 24 }}>
                  {isAr ? "ابحث عن صنف أو اضغط «تحميل الأصناف» للبدء" : "Search for a product or click \"Load products\" to begin"}
                </td></tr>
              ) : rows.map((r, idx) => {
                const tree = r.unit_tree;
                const variance = baseVarianceForRow(r);
                const value = varianceValueFromBase(variance, r.cost_at_time, tree);
                const hasInput = rowHasPhysicalInput(r);
                const systemDisplay = r.is_new_batch ? "—" : formatBaseQuantity(r.system_qty, tree);
                const varianceDisplay = !hasInput
                  ? "—"
                  : variance === 0 ? formatMainQuantity(0, tree) : (variance > 0 ? "+" : "-") + formatMainQuantity(Math.abs(variance), tree);
                const physBase = physBaseFromRow(r);
                const physDisplay = !hasInput ? "—" : formatMainQuantity(physBase, tree);
                return (
                  <tr key={r.key} className={r.is_new_batch ? "bg-blue-50/50" : ""}>
                    <td style={cellStyle}>{idx + 1}</td>
                    <td style={cellStyle}>
                      <div className="font-medium">{r.product_name}</div>
                      {/* Unit tree visual */}
                      <div className="mt-1 text-[11px] text-gray-600 leading-tight">
                        {tree.main_unit && tree.sub_unit_1 && (
                          <div>1 {tree.main_unit} = {tree.sub_unit_1_ratio || 1} {tree.sub_unit_1}</div>
                        )}
                        {tree.sub_unit_1 && tree.sub_unit_2 && (
                          <div>1 {tree.sub_unit_1} = {tree.sub_unit_2_ratio || 1} {tree.sub_unit_2}</div>
                        )}
                        <div className="text-gray-400">
                          {isAr ? "الأساس" : "Base"}: {baseUnitName(tree)}
                        </div>
                      </div>
                    </td>
                    <td style={cellStyle} className="text-gray-500">{r.sku || "—"}</td>
                    <td style={cellStyle}>
                      <span className="font-medium">{systemDisplay}</span>
                    </td>
                    <td style={cellStyle}>
                      <input type="text" value={r.expiry_date}
                        onChange={(e) => updateRow(r.key, { expiry_date: e.target.value })}
                        placeholder="YYYY-MM-DD"
                        disabled={readOnly}
                        className="w-32 h-8 px-2 rounded border border-gray-200 text-xs disabled:bg-gray-50 disabled:text-gray-700" />
                    </td>

                    <td style={cellStyle}>
                      {readOnly ? (
                        <span className="font-medium">{physDisplay}</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {tree.main_unit && (
                            <div className="flex items-center gap-1">
                              <input type="number" min={0} step="any" value={r.phys_main}
                                onChange={(e) => updateRow(r.key, { phys_main: e.target.value })}
                                className="w-20 h-7 px-2 rounded border border-gray-200 text-sm" />
                              <span className="text-xs text-gray-600 min-w-[60px]">{tree.main_unit}</span>
                            </div>
                          )}
                          {tree.sub_unit_1 && (
                            <div className="flex items-center gap-1">
                              <input type="number" min={0} step="any" value={r.phys_sub1}
                                onChange={(e) => updateRow(r.key, { phys_sub1: e.target.value })}
                                className="w-20 h-7 px-2 rounded border border-gray-200 text-sm" />
                              <span className="text-xs text-gray-600 min-w-[60px]">{tree.sub_unit_1}</span>
                            </div>
                          )}
                          {tree.sub_unit_2 && (
                            <div className="flex items-center gap-1">
                              <input type="number" min={0} step="any" value={r.phys_sub2}
                                onChange={(e) => updateRow(r.key, { phys_sub2: e.target.value })}
                                className="w-20 h-7 px-2 rounded border border-gray-200 text-sm" />
                              <span className="text-xs text-gray-600 min-w-[60px]">{tree.sub_unit_2}</span>
                            </div>
                          )}
                          {!tree.main_unit && !tree.sub_unit_1 && !tree.sub_unit_2 && (
                            <div className="flex items-center gap-1">
                              <input type="number" min={0} step="any" value={r.phys_main}
                                onChange={(e) => updateRow(r.key, { phys_main: e.target.value })}
                                className="w-20 h-7 px-2 rounded border border-gray-200 text-sm" />
                              <span className="text-xs text-gray-600">{baseUnitName(tree)}</span>
                            </div>
                          )}
                          {hasInput && (
                            <div className="text-[11px] text-blue-700">= {physDisplay}</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={cellStyle}>
                      <div className="text-sm">{formatCurrency(r.cost_at_time, settings)}</div>
                      <div className="text-[11px] text-gray-400">{isAr ? `لكل ${tree.main_unit || baseUnitName(tree)}` : `per ${tree.main_unit || baseUnitName(tree)}`}</div>
                    </td>

                    <td style={cellStyle}>
                      <span className={variance < 0 ? "text-red-600 font-medium" : variance > 0 ? "text-green-600 font-medium" : "text-gray-500"}>
                        {varianceDisplay}
                      </span>
                    </td>
                    <td style={cellStyle}>
                      <span className={value < 0 ? "text-red-600" : value > 0 ? "text-green-600" : "text-gray-500"}>
                        {!hasInput ? "—" : formatCurrency(value, settings)}
                      </span>
                    </td>
                    {!readOnly && (
                      <td style={cellStyle}>
                        <button type="button" onClick={() => removeRow(r.key)} title={isAr ? "حذف" : "Remove"}
                          className="h-7 w-7 rounded text-red-600 hover:bg-red-50 flex items-center justify-center">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </td>
                    )}

                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: "#f9fafb", fontWeight: 600 }}>
                  <td colSpan={7} style={{ ...cellStyle, textAlign: dir === "rtl" ? "left" : "right" }}>
                    {isAr ? "الإجماليات" : "Totals"}
                  </td>
                  <td style={cellStyle}>
                    <span className={totals.qty < 0 ? "text-red-600" : totals.qty > 0 ? "text-green-600" : ""}>
                      {totals.qtyDisplay}
                    </span>
                  </td>

                  <td style={cellStyle}>
                    <span className={totals.val < 0 ? "text-red-600" : totals.val > 0 ? "text-green-600" : ""}>
                      {formatCurrency(totals.val, settings)}
                    </span>
                  </td>
                  {!readOnly && <td style={cellStyle} />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------- Print helper ----------
function printSheet({
  rows, refNo, countDate, isAr, filled, totals, settings,
}: {
  rows: Row[]; refNo: string; countDate: string; isAr: boolean; filled: boolean;
  totals?: { qty: number; val: number; qtyDisplay: string };
  settings: any;
}) {
  const w = window.open("", "_blank", "width=1000,height=700");
  if (!w) return;
  const title = isAr ? "ورقة جرد المخزون" : "Inventory count sheet";
  const html = `
    <html dir="${isAr ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${title} ${refNo}</title>
    <style>
      body{font-family:Tahoma,Arial,sans-serif;padding:24px;color:#111}
      h1{font-size:18px;margin:0 0 4px}
      .meta{color:#555;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:${isAr ? "right" : "left"}}
      th{background:#f3f4f6}
      .blank{height:28px}
      tfoot td{font-weight:700;background:#fafafa}
      .neg{color:#b91c1c}.pos{color:#15803d}
      .units{font-size:10px;color:#666;line-height:1.3;margin-top:2px}
      @media print{button{display:none}}
    </style></head><body>
    <h1>${title}</h1>
    <div class="meta">${isAr ? "رقم" : "Ref"}: <b>${refNo || "—"}</b> · ${isAr ? "التاريخ" : "Date"}: <b>${countDate}</b></div>
    <table>
      <thead><tr>
        <th>#</th><th>${isAr ? "الصنف" : "Product"}</th><th>SKU</th>
        <th>${isAr ? "الرصيد الدفتري" : "System"}</th>
        <th>${isAr ? "تاريخ الصلاحية" : "Expiry"}</th>
        <th>${isAr ? "الرصيد الفعلي" : "Physical"}</th>
        <th>${isAr ? "التكلفة" : "Cost"}</th>
        ${filled ? `<th>${isAr ? "الفرق" : "Variance"}</th><th>${isAr ? "قيمة الفرق" : "Value"}</th>` : ""}
      </tr></thead>
      <tbody>
        ${rows.map((r, i) => {
          const hasInput = rowHasPhysicalInput(r);
          const physBase = hasInput ? physBaseFromRow(r) : 0;
          const variance = physBase - (r.is_new_batch ? 0 : r.system_qty);
          const value = varianceValueFromBase(variance, r.cost_at_time, r.unit_tree);
          const cls = variance < 0 ? "neg" : variance > 0 ? "pos" : "";
          const systemDisp = r.is_new_batch ? "—" : escape_(formatMainQuantity(r.system_qty, r.unit_tree));
          const physDisp = !filled || !hasInput ? "" : escape_(formatMainQuantity(physBase, r.unit_tree));
          const varDisp = variance === 0 ? formatMainQuantity(0, r.unit_tree) : (variance > 0 ? "+" : "-") + escape_(formatMainQuantity(Math.abs(variance), r.unit_tree));
          const tree = r.unit_tree;
          const unitLines: string[] = [];
          if (tree.main_unit && tree.sub_unit_1) unitLines.push(`1 ${tree.main_unit} = ${tree.sub_unit_1_ratio || 1} ${tree.sub_unit_1}`);
          if (tree.sub_unit_1 && tree.sub_unit_2) unitLines.push(`1 ${tree.sub_unit_1} = ${tree.sub_unit_2_ratio || 1} ${tree.sub_unit_2}`);
          const unitsHtml = unitLines.map(escape_).join("<br/>");
          const costDisp = escape_(formatCurrency(r.cost_at_time, settings));
          return `<tr${filled ? "" : ' class="blank"'}>
            <td>${i + 1}</td>
            <td>${escape_(r.product_name)}${unitsHtml ? `<div class="units">${unitsHtml}</div>` : ""}</td>
            <td>${escape_(r.sku)}</td>
            <td>${systemDisp}</td>
            <td>${filled ? (r.expiry_date || "—") : (r.expiry_date || "")}</td>
            <td>${physDisp}</td>
            <td>${costDisp}</td>
            ${filled ? `<td class="${cls}">${!hasInput ? "—" : varDisp}</td><td class="${cls}">${!hasInput ? "—" : escape_(formatCurrency(value, settings))}</td>` : ""}
          </tr>`;
        }).join("")}
      </tbody>
      ${filled && totals ? `<tfoot><tr>
        <td colspan="7" style="text-align:${isAr ? "left" : "right"}">${isAr ? "الإجماليات" : "Totals"}</td>
        <td class="${totals.qty < 0 ? "neg" : totals.qty > 0 ? "pos" : ""}">${escape_(totals.qtyDisplay)}</td>
        <td class="${totals.val < 0 ? "neg" : totals.val > 0 ? "pos" : ""}">${escape_(formatCurrency(totals.val, settings))}</td>
      </tr></tfoot>` : ""}
    </table>
    <script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script>
    </body></html>`;
  w.document.write(html);
  w.document.close();
}
function escape_(s: string) {
  return String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
}
