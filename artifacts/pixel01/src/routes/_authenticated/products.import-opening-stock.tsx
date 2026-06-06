import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csv";
import { toBase, formatBaseQuantity } from "@/lib/units";
import { useI18n } from "@/lib/i18n";
import { DateInput } from "@/components/shared/DateInput";
import { normalizeArabicText } from "@/lib/arabic";

export const Route = createFileRoute("/_authenticated/products/import-opening-stock")({
  component: ImportOpeningStockPage,
});

const BLUE = "#3b82f6";
const GREEN = "#10b981";
const RED = "#ef4444";

const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151" };

const rows: { num: number; name: string; note: string; required?: boolean }[] = [
  { num: 1, name: "SKU الباركود (إلزامي)", note: "يتم البحث عن الصنف بالـ SKU", required: true },
  { num: 2, name: "اسم الصنف بالعربي (للمرجعية)", note: "اختياري — للمرجعية فقط" },
  { num: 3, name: "اسم الصنف بالإنجليزي (للمرجعية)", note: "اختياري — للمرجعية فقط" },
  { num: 4, name: "الكمية (إلزامي)", note: "تُضاف إلى الكمية الحالية", required: true },
  { num: 5, name: "سعر الشراء (إلزامي)", note: "قبل الضريبة — يحدّث تكلفة الصنف", required: true },
  { num: 6, name: "سعر البيع (اختياري)", note: "يحدّث سعر بيع الصنف إن وُجد" },
  { num: 7, name: "تاريخ الانتهاء (إلزامي)", note: "يقبل 1/15/2028 أو yyyy-mm-dd — لا يُقبل تاريخ ماضي", required: true },
];

/** Flexible date parser: accepts Date objects, M/D/YYYY, MM/DD/YYYY, yyyy-mm-dd, yyyy/mm/dd. */
function parseFlexibleDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const mo = parseInt(m[1], 10), da = parseInt(m[2], 10), yr = parseInt(m[3], 10);
    const d = new Date(yr, mo - 1, da);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m) {
    const yr = parseInt(m[1], 10), mo = parseInt(m[2], 10), da = parseInt(m[3], 10);
    const d = new Date(yr, mo - 1, da);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isPastDate(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

/** Strip parentheticals, asterisks, collapse whitespace for tolerant header matching. */
function normKey(s: string): string {
  return String(s ?? "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Look up a value in a row by header label, tolerating "(...)", "*", and extra spaces. */
function pick(row: Record<string, any>, ...labels: string[]): any {
  const normalized: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) normalized[normKey(k)] = v;
  for (const label of labels) {
    const v = normalized[normKey(label)];
    if (v != null && v !== "") return v;
  }
  return undefined;
}

function normalizeRow(r: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).trim(), v]));
}

async function parseFile(file: File): Promise<Record<string, any>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, any>>(file, {
        header: true, skipEmptyLines: true,
        complete: (res) => resolve(res.data.map(normalizeRow)),
        error: reject,
      });
    });
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, any>>(ws).map(normalizeRow);
}

function ImportOpeningStockPage() {
  const { t, dir } = useI18n();
  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("products.opening.title")} />
      <Tabs defaultValue="file" dir={dir} className="w-full">
        <TabsList className="w-full flex justify-start">
          <TabsTrigger value="file">{t("products.opening.tab.file")}</TabsTrigger>
          <TabsTrigger value="manual">{t("products.opening.tab.manual")}</TabsTrigger>
        </TabsList>

        <TabsContent value="file" className="space-y-3 mt-3">
          <FileImportTab />
        </TabsContent>

        <TabsContent value="manual" className="space-y-3 mt-3">
          <ManualEntryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FileImportTab() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const headStyle: React.CSSProperties = {
    backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px",
    fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb",
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = fileRef.current?.files?.[0];
    if (!f) { toast.error(t("products.toast.choose_file")); return; }
    if (!user) return;
    try {
      const parsed = await parseFile(f);
      if (parsed.length === 0) { toast.error(t("products.toast.empty_file")); return; }
      const { data: products, error } = await supabase
        .from("products")
        .select("id, sku, stock");
      if (error) throw error;

      // Pre-validate everything before any DB write — prevent partial imports
      const errors: string[] = [];
      type Plan = { productId: string; sku: string; patch: Record<string, any> };
      const plans: Plan[] = [];
      let skippedNoSku = 0;

      parsed.forEach((r, i) => {
        const line = i + 2;
        const sku = String(pick(r, "SKU الباركود", "SKU") ?? "").trim();
        if (!sku) { skippedNoSku++; return; }
        const match = (products as any[]).find((p) => p.sku === sku);
        if (!match) { errors.push(`سطر ${line} (${sku}): الصنف غير موجود`); return; }

        // Quantity (required, > 0)
        const qty = Number(pick(r, "الكمية") ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) {
          errors.push(`سطر ${line} (${sku}): الكمية مطلوبة وأكبر من صفر`); return;
        }

        // Purchase price (required)
        const costRaw = pick(r, "سعر الشراء", "سعر الشراء (قبل الضريبة)", "السعر قبل الضريبة", "السعر");
        if (costRaw == null || costRaw === "") {
          errors.push(`سطر ${line} (${sku}): سعر الشراء مطلوب`); return;
        }
        const cost = Number(costRaw);
        if (!Number.isFinite(cost) || cost < 0) {
          errors.push(`سطر ${line} (${sku}): سعر الشراء غير صحيح`); return;
        }

        // Expiry (required, flexible format, not past)
        const rawExp = pick(r, "تاريخ الانتهاء", "تاريخ انتهاء الصلاحية", "expiry_date");
        if (rawExp == null || rawExp === "") {
          errors.push(`سطر ${line} (${sku}): تاريخ الانتهاء مطلوب`); return;
        }
        const d = parseFlexibleDate(rawExp);
        if (!d) { errors.push(`سطر ${line} (${sku}): صيغة التاريخ غير صحيحة (مثال: 1/15/2028)`); return; }
        const expIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (isPastDate(expIso)) { errors.push(`سطر ${line} (${sku}): تاريخ صلاحية قديم`); return; }

        const patch: Record<string, any> = {
          stock: Number(match.stock ?? 0) + qty,
          cost,
          has_expiry: true,
          expiry_date: expIso,
        };

        // Sale price (optional)
        const sellRaw = pick(r, "سعر البيع");
        if (sellRaw != null && sellRaw !== "") {
          const sell = Number(sellRaw);
          if (Number.isFinite(sell)) patch.price = sell;
        }

        plans.push({ productId: match.id, sku, patch });
      });

      if (errors.length > 0) {
        errors.slice(0, 5).forEach((m) => toast.error(m));
        return;
      }
      if (plans.length === 0) {
        if (skippedNoSku > 0) {
          toast.error("تحقق من عناوين الأعمدة في الملف — لم نجد أي صف بـ SKU صحيح");
        } else {
          toast.error(t("products.toast.no_valid_rows"));
        }
        return;
      }

      const results = await Promise.all(
        plans.map((p) => (supabase.from("products") as any).update(p.patch).eq("id", p.productId))
      );
      const failed = results.filter((r: any) => r.error).length;
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(t("products.opening.updated_of", { a: plans.length - failed, b: parsed.length }));
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: any) {
      toast.error(err.message || t("products.toast.import_failed"));
    }
  };


  const downloadTemplate = () =>
    exportToCsv("opening-stock-template.csv", rows.map(r => r.name), [rows.map(() => "")]);

  return (
    <form onSubmit={submit} className="space-y-3">
      <DataCard>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          <div className="md:col-start-3 text-start space-y-2">
            <label className="text-sm font-semibold" style={{ color: "#374151" }}>{t("products.import.file_label")}</label>
            <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="text-sm block"
              style={{ border: "1px solid #d1d5db", padding: 6, borderRadius: 6, backgroundColor: "#ffffff" }} />
            <p className="text-xs" style={{ color: "#6b7280" }}>{t("products.import.ext_hint")}</p>
            <p className="text-xs" style={{ color: RED }}>{t("products.import.size_hint")}</p>
          </div>
          <div className="md:col-start-2 flex items-center justify-center">
            <button type="submit" className="h-10 px-8 rounded-md text-white text-sm" style={{ backgroundColor: BLUE }}>{t("products.import.submit")}</button>
          </div>
          <div className="md:col-start-1 flex items-end">
            <button type="button" onClick={downloadTemplate} className="h-10 px-4 rounded-md text-white text-sm flex items-center gap-2" style={{ backgroundColor: GREEN }}>
              <Download className="h-4 w-4" /> {t("products.import.template")}
            </button>
          </div>
        </div>
      </DataCard>

      <DataCard>
        <div className="text-start mb-3">
          <h2 className="text-lg font-semibold" style={{ color: "#111827" }}>{t("products.import.instructions")}</h2>
          <p className="text-sm" style={{ color: "#6b7280" }}>{t("products.import.instructions_text")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...headStyle, width: 110 }}>{t("products.import.col_number")}</th>
                <th style={headStyle}>{t("products.import.col_name")}</th>
                <th style={headStyle}>{t("products.import.col_note")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.num}>
                  <td style={cellStyle}>{r.num}</td>
                  <td style={{ ...cellStyle, color: r.required ? RED : "#374151" }}>{r.name}</td>
                  <td style={cellStyle}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataCard>
    </form>
  );
}

type Row = {
  product_id: string;
  name: string;
  sku: string | null;
  quantity: number;
  cost: number;
  sellPrice: number;
  expiryDate: string | null;
  note: string | null;
  baseQty: number;
  unitLabel: string;
  hasExpiry: boolean;
};

function ManualEntryTab() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const headStyle: React.CSSProperties = {
    backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px",
    fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb",
  };

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, stock, price, cost, has_expiry, main_unit, sub_unit_1, sub_unit_1_ratio, sub_unit_2, sub_unit_2_ratio")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["business_settings_opening"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("business_settings").select("enable_expiry_dates").maybeSingle();
      return data;
    },
  });
  const expiryFeatureOn = settings?.enable_expiry_dates === true;

  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState<string>("");
  const [qty, setQty] = useState<string>("");
  const [cost, setCost] = useState<string>("");
  const [sellPrice, setSellPrice] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [list, setList] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = normalizeArabicText(search);
    if (!q) return (products as any[]).slice(0, 50);
    return (products as any[])
      .filter((p) => normalizeArabicText((p.name || "") + " " + (p.sku ?? "")).includes(q))
      .slice(0, 50);
  }, [search, products]);

  const selectedProduct = (products as any[]).find((p) => p.id === productId);
  const needsExpiry = !!(selectedProduct?.has_expiry && expiryFeatureOn);

  // Auto-fill cost/sell price from existing product values when selecting
  useMemo(() => {
    if (selectedProduct) {
      if (!cost && Number(selectedProduct.cost) > 0) setCost(String(selectedProduct.cost));
      if (!sellPrice && Number(selectedProduct.price) > 0) setSellPrice(String(selectedProduct.price));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const addRow = () => {
    const p = (products as any[]).find((x) => x.id === productId);
    const q = Number(qty);
    const c = Number(cost);
    const sp = Number(sellPrice);
    if (!p) { toast.error(t("products.toast.choose_item")); return; }
    if (!q || q <= 0) { toast.error(t("products.toast.qty_invalid")); return; }
    if (Number.isNaN(c) || c < 0) { toast.error(t("products.toast.unit_price_invalid")); return; }
    if (Number.isNaN(sp) || sp < 0) { toast.error(t("products.opening.sell_price_invalid")); return; }
    if (!expiryDate) {
      toast.error("تاريخ الصلاحية مطلوب");
      return;
    }
    if (isPastDate(expiryDate)) {
      toast.error("تاريخ الصلاحية لا يمكن أن يكون قديمًا");
      return;
    }
    const hasTree = !!(p.main_unit || p.sub_unit_1 || p.sub_unit_2);
    const baseQty = hasTree ? toBase(q, "main", p) : q;
    const unitLabel = p.main_unit || t("products.opening.unit_default");
    setList((prev) => [...prev, {
      product_id: p.id, name: p.name, sku: p.sku,
      quantity: q, cost: c, sellPrice: sp,
      expiryDate: expiryDate || null, note: note || null,
      baseQty, unitLabel, hasExpiry: !!p.has_expiry,
    }]);
    setQty(""); setCost(""); setSellPrice(""); setExpiryDate(""); setNote("");
    setProductId(""); setSearch("");
  };

  const save = async () => {
    if (list.length === 0) { toast.error(t("products.toast.nothing_to_save")); return; }
    setSaving(true);
    try {
      // 1) create a single "opening stock" purchase header per save so FIFO sees real batches
      const { data: numData, error: eNum } = await (supabase as any).rpc("next_doc_number", {
        _owner: ownerId, _table: "purchases", _column: "purchase_number", _prefix: "OS", _pad: 5,
      });
      if (eNum) throw eNum;
      const purchase_number = numData as string;
      const subtotal = list.reduce((s, r) => s + r.cost * r.quantity, 0);
      const { data: purchase, error: ePurch } = await (supabase.from("purchases") as any)
        .insert({
          owner_id: ownerId,
          purchase_number,
          ref_no: purchase_number,
          purchase_date: new Date().toISOString().slice(0, 10),
          status: "received",
          subtotal,
          tax: 0,
          total: subtotal,
          paid_amount: 0,
          due_amount: 0,
          payment_status: "paid",
          is_opening: true,
          notes: t("products.opening.batch_note"),
        })
        .select("id")
        .single();
      if (ePurch) throw ePurch;

      // 2) For each row: if (product_id + expiry_date) already exists in any purchase_item, update; else insert.
      const toInsert: any[] = [];
      for (const r of list) {
        if (r.expiryDate) {
          const { data: existing } = await (supabase.from("purchase_items") as any)
            .select("id, quantity, base_quantity, total")
            .eq("product_id", r.product_id)
            .eq("expiry_date", r.expiryDate)
            .limit(1);
          const existingRow = (existing as any[])?.[0];
          if (existingRow) {
            const newQty = Number(existingRow.quantity || 0) + r.quantity;
            const newBase = Number(existingRow.base_quantity || 0) + r.baseQty;
            const newTotal = Number(existingRow.total || 0) + r.cost * r.quantity;
            const { error: eUpd } = await (supabase.from("purchase_items") as any)
              .update({ quantity: newQty, base_quantity: newBase, total: newTotal })
              .eq("id", existingRow.id);
            if (eUpd) throw eUpd;
            continue;
          }
        }
        toInsert.push({
          purchase_id: purchase.id,
          product_id: r.product_id,
          description: r.name,
          quantity: r.quantity,
          base_quantity: r.baseQty,
          unit_price: r.cost,
          unit_name: r.unitLabel,
          discount_percent: 0,
          total: r.cost * r.quantity,
          sell_price: r.sellPrice,
          expiry_date: r.expiryDate,
        });
      }
      if (toInsert.length) {
        const { error: eItems } = await (supabase.from("purchase_items") as any).insert(toInsert);
        if (eItems) throw eItems;
      }

      // 3) refresh products.price / cost from the latest batch
      const priceUpdates = new Map<string, { price: number; cost: number }>();
      for (const r of list) priceUpdates.set(r.product_id, { price: r.sellPrice, cost: r.cost });
      await Promise.all(
        Array.from(priceUpdates.entries()).map(([id, v]) =>
          (supabase.from("products") as any).update({ price: v.price, cost: v.cost }).eq("id", id)
        )
      );

      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["purchase_items_all"] });
      toast.success(t("products.opening.updated_count", { n: priceUpdates.size }));
      setList([]);
    } catch (err: any) {
      toast.error(err.message || t("products.toast.save_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DataCard>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <Label>{t("products.opening.item")}</Label>
            <ProductCombobox
              products={products as any[]}
              value={productId}
              onChange={setProductId}
              search={search}
              onSearchChange={setSearch}
              filtered={filtered}
              onCreateNew={() => navigate({ to: "/products/add" })}
            />
          </div>
          <div>
            <Label>{t("products.opening.qty")} {selectedProduct?.main_unit ? `(${selectedProduct.main_unit})` : ""}</Label>
            <Input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <Label>{t("products.opening.unit_price")}</Label>
            <Input type="number" min="0" step="any" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div>
            <Label>{t("products.opening.sell_price")}</Label>
            <Input type="number" min="0" step="any" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
          </div>
          <div>
            <Label>{t("products.opening.expiry")} <span style={{ color: RED }}>*</span></Label>
            <DateInput value={expiryDate} onChange={setExpiryDate} />
          </div>
          <div className="md:col-span-2">
            <Label>{t("products.opening.note")}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("products.opening.note_ph")} />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="button" onClick={addRow} disabled={!productId}>{t("products.opening.add")}</Button>
        </div>
      </DataCard>

      <DataCard>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headStyle}>{t("products.opening.item")}</th>
                <th style={headStyle}>SKU</th>
                <th style={headStyle}>{t("products.opening.qty")}</th>
                <th style={headStyle}>{t("products.opening.unit_price")}</th>
                <th style={headStyle}>{t("products.opening.sell_price")}</th>
                <th style={headStyle}>{t("products.opening.expiry")}</th>
                <th style={{ ...headStyle, width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td style={cellStyle} colSpan={7} className="text-center">{t("products.opening.no_items")}</td>
                </tr>
              )}
              {list.map((r, i) => (
                <tr key={i}>
                  <td style={cellStyle}>{r.name}</td>
                  <td style={cellStyle}>{r.sku ?? "—"}</td>
                  <td style={cellStyle}>
                    {r.quantity} {r.unitLabel}
                    {r.baseQty !== r.quantity ? <span style={{ color: "#6b7280", marginInlineStart: 6 }}>(= {r.baseQty} {t("products.opening.base_unit")})</span> : null}
                  </td>
                  <td style={cellStyle}>{r.cost}</td>
                  <td style={cellStyle}>{r.sellPrice}</td>
                  <td style={cellStyle}>{r.expiryDate ?? "—"}</td>
                  <td style={cellStyle}>
                    <button type="button" onClick={() => setList((p) => p.filter((_, idx) => idx !== i))}
                      style={{ color: RED }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={save} disabled={saving || list.length === 0}>
            {saving ? t("products.opening.saving") : t("products.opening.save")}
          </Button>
        </div>
      </DataCard>
    </>
  );
}

function ProductCombobox({
  products, value, onChange, search, onSearchChange, filtered, onCreateNew,
}: {
  products: any[];
  value: string;
  onChange: (id: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
  filtered: any[];
  onCreateNew: () => void;
}) {
  const { t, dir } = useI18n();
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate text-start", !selected && "text-muted-foreground")}>
            {selected ? `${selected.name}${selected.sku ? ` (${selected.sku})` : ""}` : t("products.opening.choose_item")}
          </span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        dir={dir}
        align="start"
        sideOffset={4}
        className="p-0 w-[--radix-popover-trigger-width]"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("products.opening.search_item")}
            value={search}
            onValueChange={onSearchChange}
          />
          <CommandList>
            <CommandEmpty>
              <div className="flex flex-col items-center gap-2 py-2">
                <p className="text-sm text-muted-foreground">{t("products.opening.not_found")}</p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => { setOpen(false); onCreateNew(); }}
                >
                  {t("products.opening.create_new")}
                </Button>
              </div>
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => {
                    onChange(p.id);
                    onSearchChange("");
                    setOpen(false);
                  }}
                  className="text-start"
                >
                  <Check className={cn("ms-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1">
                    {p.name} {p.sku ? `(${p.sku})` : ""} — {t("products.opening.stock")}: {formatBaseQuantity(Number(p.stock ?? 0), p)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
