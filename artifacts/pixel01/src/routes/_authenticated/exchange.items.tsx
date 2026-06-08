import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2, ArrowLeftRight, Search } from "lucide-react";
import { DataCard } from "@/components/products/DataCard";
import { useContacts } from "@/hooks/use-contacts";
import { pickDefaultLinkedTreasuryId, useLinkedTreasuries } from "@/hooks/use-linked-treasuries";
import { useOwnerId } from "@/lib/owner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { requireTreasuryAccountId } from "@/lib/treasury-account";
import { baseUnitsPer, toBase, formatBaseQuantity, type UnitLevel, unitOptions } from "@/lib/units";
import { normalizeArabicText } from "@/lib/arabic";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/exchange/items")({
  component: ItemExchangePage,
});

type Dir = "incoming" | "outgoing";

type ExchangeRow = {
  key: string;
  product_id: string;
  quantity: number;
  unit_level: UnitLevel;
  unit_price: number;
  discount_pct: number;
};

function rowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Price for one unit at `level`, derived from the product's MAIN-unit price.
 *  Main price is divided down across the smaller units. */
function unitPriceForLevel(p: any, level: UnitLevel, dir: Dir): number {
  const mainPrice = dir === "incoming" ? Number(p?.cost || 0) : Number(p?.price ?? p?.sell_price ?? 0);
  const perMain = baseUnitsPer(p || {}, "main") || 1;
  const perLevel = baseUnitsPer(p || {}, level) || 1;
  return Number(((mainPrice * perLevel) / perMain).toFixed(4));
}

function rowTotal(r: ExchangeRow): number {
  const gross = Number(r.quantity || 0) * Number(r.unit_price || 0);
  const net = gross * (1 - Math.min(100, Math.max(0, Number(r.discount_pct || 0))) / 100);
  return Math.max(0, net);
}

function ItemExchangePage() {
  const ownerId = useOwnerId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [contactScope, setContactScope] = useState<"customer" | "supplier">("customer");
  const { data: contacts = [] } = useContacts(contactScope);
  const { data: products = [] } = useQuery({
    queryKey: ["products", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("products") as any)
        .select("*")
        .eq("owner_id", ownerId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const { data: treasuries = [] } = useLinkedTreasuries();
  const [contactId, setContactId] = useState("");
  const [treasuryId, setTreasuryId] = useState("");
  const [exchangeDate, setExchangeDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [incomingRows, setIncomingRows] = useState<ExchangeRow[]>([]);
  const [outgoingRows, setOutgoingRows] = useState<ExchangeRow[]>([]);
  const [saving, setSaving] = useState(false);

  const byId = useMemo(() => new Map((products as any[]).map((p) => [p.id, p])), [products]);
  const selectedContact = (contacts as any[]).find((c) => c.id === contactId);
  const selectedTreasury = (treasuries as any[]).find((t) => t.id === treasuryId);

  useEffect(() => {
    if (!treasuryId && treasuries.length > 0) {
      setTreasuryId(pickDefaultLinkedTreasuryId(treasuries));
    }
  }, [treasuries, treasuryId]);

  const incomingTotal = incomingRows.reduce((s, r) => s + rowTotal(r), 0);
  const outgoingTotal = outgoingRows.reduce((s, r) => s + rowTotal(r), 0);
  const netCash = outgoingTotal - incomingTotal;

  const setRows = (dir: Dir, rows: ExchangeRow[]) => {
    if (dir === "incoming") setIncomingRows(rows);
    else setOutgoingRows(rows);
  };

  const addProduct = (dir: Dir, productId: string) => {
    const rows = dir === "incoming" ? incomingRows : outgoingRows;
    const existing = rows.find((r) => r.product_id === productId);
    const p = byId.get(productId);
    if (existing) {
      setRows(dir, rows.map((r) => (r.product_id === productId ? { ...r, quantity: Number(r.quantity || 0) + 1 } : r)));
      return;
    }
    setRows(dir, [
      ...rows,
      {
        key: rowId(),
        product_id: productId,
        quantity: 1,
        unit_level: "main",
        unit_price: unitPriceForLevel(p, "main", dir),
        discount_pct: 0,
      },
    ]);
  };

  const updateRow = (dir: Dir, key: string, patch: Partial<ExchangeRow>) => {
    const rows = dir === "incoming" ? incomingRows : outgoingRows;
    const next = rows.map((r) => {
      if (r.key !== key) return r;
      const merged = { ...r, ...patch };
      if (patch.unit_level && patch.unit_level !== r.unit_level && merged.product_id) {
        merged.unit_price = unitPriceForLevel(byId.get(merged.product_id), patch.unit_level, dir);
      }
      // Stock guard for outgoing rows: clamp to available stock (in base units)
      if (dir === "outgoing" && (patch.quantity != null || patch.unit_level != null)) {
        const p = byId.get(merged.product_id);
        if (p) {
          const available = Number(p.stock || 0);
          const requestedBase = toBase(Number(merged.quantity || 0), merged.unit_level, p);
          if (requestedBase > available) {
            const per = baseUnitsPer(p, merged.unit_level) || 1;
            const maxQty = Math.floor(available / per);
            toast.error(`الكمية أكبر من المخزون المتاح (${formatBaseQuantity(available, p)})`);
            merged.quantity = Math.max(0, maxQty);
          }
        }
      }
      return merged;
    });
    setRows(dir, next);
  };

  const removeRow = (dir: Dir, key: string) => {
    const rows = dir === "incoming" ? incomingRows : outgoingRows;
    setRows(dir, rows.filter((r) => r.key !== key));
  };

  const submit = async () => {
    if (!ownerId || !user?.id) {
      toast.error("تعذر تحديد حساب الإدارة الحالي");
      return;
    }
    if (!contactId) {
      toast.error("اختر العميل أو المورد");
      return;
    }
    if (!treasuryId) {
      toast.error("اختر الخزنة");
      return;
    }
    if (incomingRows.length === 0 && outgoingRows.length === 0) {
      toast.error("أضف أصناف للتبادل");
      return;
    }

    // Final stock validation for outgoing
    for (const r of outgoingRows) {
      const p = byId.get(r.product_id);
      if (!p) continue;
      const requestedBase = toBase(Number(r.quantity || 0), r.unit_level, p);
      if (requestedBase > Number(p.stock || 0)) {
        toast.error(`الصنف "${p.name}" الكمية المطلوبة أكبر من المخزون`);
        return;
      }
    }

    try {
      setSaving(true);
      const exchangeRef = `EXC-${Date.now().toString(36).toUpperCase()}`;
      const contactName = selectedContact
        ? [selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(" ") || selectedContact.business_name || ""
        : "";

      const allRows = [
        ...incomingRows.map((r) => ({ ...r, direction: "incoming" as const })),
        ...outgoingRows.map((r) => ({ ...r, direction: "outgoing" as const })),
      ];
      const itemsPayload = allRows
        .filter((r) => r.product_id)
        .map((r) => {
          const p: any = byId.get(r.product_id);
          const baseQty = toBase(Number(r.quantity || 0), r.unit_level, p || {});
          return {
            direction: r.direction,
            product_id: r.product_id,
            product_name_snapshot: p?.name || null,
            base_quantity: baseQty,
            total: rowTotal(r),
          };
        });

      if (itemsPayload.length === 0) {
        toast.error("اختر صنفاً واحداً على الأقل");
        return;
      }

      // 1) Update stock (base unit) for every involved product
      const stockMap = new Map<string, number>((products as any[]).map((p: any) => [p.id, Number(p.stock || 0)]));
      for (const item of itemsPayload) {
        const cur = Number(stockMap.get(item.product_id) || 0);
        const delta = item.direction === "incoming" ? Number(item.base_quantity || 0) : -Number(item.base_quantity || 0);
        stockMap.set(item.product_id, cur + delta);
      }
      const touchedIds = new Set(itemsPayload.map((i) => i.product_id));
      for (const productId of touchedIds) {
        const { error } = await (supabase.from("products") as any)
          .update({ stock: stockMap.get(productId) })
          .eq("id", productId)
          .eq("owner_id", ownerId);
        if (error) throw error;
      }

      // 2) Record cash difference in treasury + contact ledger (existing tables only)
      if (Math.abs(netCash) > 0.0001) {
        const txType = netCash >= 0 ? "in" : "out";
        const txAmount = Math.abs(netCash);
        const desc = `تبادل أصناف ${exchangeRef} (${contactScope === "customer" ? "عميل" : "مورد"}: ${contactName})`;
        const treasuryAccountId = await requireTreasuryAccountId(treasuryId);
        const contactDirection = txType === "in" ? "out" : "in";
        const { error: cpErr } = await (supabase.from("contact_payments") as any).insert({
          owner_id: ownerId,
          contact_id: contactId,
          contact_type: contactScope,
          contact_name_snapshot: contactName || null,
          direction: contactDirection,
          amount: txAmount,
          allocated_amount: txAmount,
          payment_method: "cash",
          treasury_account_id: treasuryAccountId,
          payment_date: exchangeDate,
          ref_no: exchangeRef,
          notes: notes ? `${notes} | فرق تبادل أصناف ${exchangeRef}` : `فرق تبادل أصناف ${exchangeRef}`,
          created_by: user.id,
        });
        if (cpErr) throw cpErr;
      }

      toast.success("تم تنفيذ تبادل الأصناف وتحديث المخزون والحسابات");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-alert"] });
      qc.invalidateQueries({ queryKey: ["product_warehouse_stock"] });
      setIncomingRows([]);
      setOutgoingRows([]);
      setNotes("");
    } catch (err: any) {
      toast.error(err?.message || "تعذر حفظ تبادل الأصناف");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <h1 className="text-xl font-bold flex items-center gap-2"><ArrowLeftRight className="h-5 w-5" /> تبادل أصناف</h1>
      <DataCard>
        <div className="text-sm rounded-md p-3 mb-4" style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a" }}>
          الصفحة دي بتسجل تبادل مباشر بين الصيدلية والطرف الآخر. الأصناف <b>الداخلة</b> تزود المخزون،
          و<b>الخارجة</b> تقلله، وفرق القيمة بيتسجل تلقائياً في الخزنة وفي حركة حساب العميل/المورد.
          ابحث عن الصنف بالاسم (عربي/إنجليزي) أو الكود وهيتضاف، وتقدر تختار الوحدة وتحط خصم لكل صنف.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <label className="text-sm">
            الطرف
            <select className="mt-1 w-full border rounded h-10 px-2" value={contactScope} onChange={(e) => { setContactScope(e.target.value as any); setContactId(""); }}>
              <option value="customer">عميل</option>
              <option value="supplier">مورد</option>
            </select>
          </label>
          <label className="text-sm">
            {contactScope === "customer" ? "العميل" : "المورد"}
            <select className="mt-1 w-full border rounded h-10 px-2" value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">اختر...</option>
              {(contacts as any[]).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.contact_id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            الخزنة
            <select className="mt-1 w-full border rounded h-10 px-2" value={treasuryId} onChange={(e) => setTreasuryId(e.target.value)}>
              <option value="">اختر...</option>
              {(treasuries as any[]).map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.is_default_cash ? " ⭐" : ""}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            التاريخ
            <input type="date" className="mt-1 w-full border rounded h-10 px-2" value={exchangeDate} onChange={(e) => setExchangeDate(e.target.value)} />
          </label>
        </div>
        <Section
          title="أصناف داخلة للمخزون (الصيدلية تستلم)"
          dir="incoming"
          rows={incomingRows}
          products={products as any[]}
          byId={byId}
          onAdd={(id) => addProduct("incoming", id)}
          onChange={(k, p) => updateRow("incoming", k, p)}
          onRemove={(k) => removeRow("incoming", k)}
        />
        <Section
          title="أصناف خارجة من المخزون (الصيدلية تسلم)"
          dir="outgoing"
          rows={outgoingRows}
          products={products as any[]}
          byId={byId}
          onAdd={(id) => addProduct("outgoing", id)}
          onChange={(k, p) => updateRow("outgoing", k, p)}
          onRemove={(k) => removeRow("outgoing", k)}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <Stat label="إجمالي الداخل" value={incomingTotal} color="#0f766e" />
          <Stat label="إجمالي الخارج" value={outgoingTotal} color="#b45309" />
          <Stat label={netCash >= 0 ? "فرق نقدي تستلمه الصيدلية" : "فرق نقدي تدفعه الصيدلية"} value={Math.abs(netCash)} color={netCash >= 0 ? "#065f46" : "#991b1b"} />
        </div>
        <label className="block text-sm mt-4">
          ملاحظات للإدارة
          <textarea
            className="mt-1 w-full border rounded p-2 min-h-[84px]"
            placeholder="مثال: فرق القيمة اتحصل نقداً - الصنف الوارد منتهي قريباً"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="text-xs mt-2" style={{ color: "#64748b" }}>
          كل كمية تتحول تلقائياً للوحدة الأساسية (أصغر وحدة) قبل تحديث المخزون. سعر الوحدة بيتحسب من سعر الوحدة الأكبر
          مقسوماً على الوحدات الأصغر. مينفعش تخرج كمية أكبر من المخزون المتاح.
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="mt-4 h-10 px-5 rounded text-white disabled:opacity-60"
          style={{ backgroundColor: "#2563eb" }}
        >
          {saving ? "جاري التنفيذ..." : "تنفيذ التبادل"}
        </button>
      </DataCard>
    </div>
  );
}

function ProductSearch({ products, onPick }: { products: any[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const autoAddRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matches = useMemo(() => {
    const s = normalizeArabicText(q.trim());
    if (!s) return [];
    return (products as any[]).filter((p) => {
      const hay = normalizeArabicText(`${p.name || ""} ${p.name_en || ""} ${p.sku || ""} ${p.barcode || ""}`);
      return hay.includes(s);
    }).slice(0, 8);
  }, [q, products]);

  const pick = (id: string) => { onPick(id); setQ(""); setActiveIdx(0); };

  useEffect(() => {
    setActiveIdx(0);
    if (autoAddRef.current) clearTimeout(autoAddRef.current);
    if (!q.trim() || matches.length !== 1) return;
    autoAddRef.current = setTimeout(() => pick(matches[0].id), 250);
    return () => { if (autoAddRef.current) clearTimeout(autoAddRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, matches]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="h-4 w-4 absolute top-1/2 -translate-y-1/2 start-2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && matches.length > 0) {
              e.preventDefault();
              setActiveIdx((i) => Math.min(matches.length - 1, i + 1));
              return;
            }
            if (e.key === "ArrowUp" && matches.length > 0) {
              e.preventDefault();
              setActiveIdx((i) => Math.max(0, i - 1));
              return;
            }
            if (e.key === "Escape") {
              setQ("");
              return;
            }
            if (e.key === "Enter" && matches.length >= 1) {
              e.preventDefault();
              pick(matches[Math.min(activeIdx, matches.length - 1)].id);
            }
          }}
          placeholder="ابحث بالاسم (عربي/إنجليزي) أو الكود ثم اختر..."
          className="w-full border rounded h-10 ps-8 pe-2"
        />
      </div>
      {q.trim() && matches.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border rounded shadow max-h-64 overflow-auto">
          {matches.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p.id)}
              onMouseEnter={() => setActiveIdx(idx)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-right"
              style={{ backgroundColor: idx === activeIdx ? "#eff6ff" : "transparent" }}
            >
              <span className="flex-1 font-semibold">{p.name}</span>
              {p.sku && <span className="text-xs text-slate-500 font-mono">{p.sku}</span>}
            </button>
          ))}
        </div>
      )}
      {q.trim() && matches.length === 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border rounded shadow px-3 py-2 text-sm text-slate-500">
          لا يوجد تطابق
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  dir,
  rows,
  products,
  byId,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  dir: Dir;
  rows: ExchangeRow[];
  products: any[];
  byId: Map<string, any>;
  onAdd: (productId: string) => void;
  onChange: (key: string, patch: Partial<ExchangeRow>) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="border rounded-md p-3 mt-3">
      <h2 className="font-semibold mb-2">{title}</h2>
      <div className="mb-3">
        <ProductSearch products={products} onPick={onAdd} />
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-500">لا توجد أصناف بعد — استخدم البحث بالأعلى لإضافة صنف</div>
      ) : (
        <div className="space-y-2">
          <div className="hidden md:grid grid-cols-12 gap-2 text-xs text-slate-500 px-1">
            <div className="col-span-3">الصنف</div>
            <div className="col-span-2">الكمية</div>
            <div className="col-span-2">الوحدة</div>
            <div className="col-span-2">سعر الوحدة</div>
            <div className="col-span-1">خصم %</div>
            <div className="col-span-2">الإجمالي</div>
          </div>
          {rows.map((r) => {
            const p = byId.get(r.product_id);
            const opts = unitOptions(p || {});
            const unitTree = [
              p?.main_unit ? `${p.main_unit}` : null,
              p?.sub_unit_1 ? `${p.sub_unit_1} (${p.sub_unit_1_ratio || 1})` : null,
              p?.sub_unit_2 ? `${p.sub_unit_2} (${p.sub_unit_2_ratio || 1})` : null,
            ].filter(Boolean).join(" ‹ ");
            const available = Number(p?.stock || 0);
            return (
              <div key={r.key} className="grid grid-cols-1 md:grid-cols-12 gap-2 border rounded p-2 items-center">
                <div className="md:col-span-3">
                  <div className="font-semibold text-sm">{p?.name || "—"}</div>
                  <div className="text-[11px] text-slate-500">
                    شجرة الوحدات: {unitTree || "وحدة واحدة"}
                    {dir === "outgoing" && p && <> · متاح: {formatBaseQuantity(available, p)}</>}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <input type="number" step="any" min={0} className="w-full border rounded h-10 px-2" value={r.quantity} onChange={(e) => onChange(r.key, { quantity: Number(e.target.value) || 0 })} />
                </div>
                <div className="md:col-span-2">
                  <select className="w-full border rounded h-10 px-2" value={r.unit_level} onChange={(e) => onChange(r.key, { unit_level: e.target.value as UnitLevel })}>
                    {opts.length === 0 ? <option value="main">وحدة</option> : opts.map((u) => <option key={u.level} value={u.level}>{u.name}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <input type="number" step="any" min={0} className="w-full border rounded h-10 px-2" value={r.unit_price} onChange={(e) => onChange(r.key, { unit_price: Number(e.target.value) || 0 })} />
                </div>
                <div className="md:col-span-1">
                  <input type="number" step="any" min={0} max={100} className="w-full border rounded h-10 px-2" value={r.discount_pct} onChange={(e) => onChange(r.key, { discount_pct: Number(e.target.value) || 0 })} />
                </div>
                <div className="md:col-span-2 flex items-center justify-between gap-2">
                  <span className="font-semibold">{rowTotal(r).toFixed(2)}</span>
                  <button type="button" onClick={() => onRemove(r.key)} className="h-8 w-8 rounded border text-red-600 inline-flex items-center justify-center"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-bold" style={{ color }}>{Number(value || 0).toFixed(2)}</div>
    </div>
  );
}
