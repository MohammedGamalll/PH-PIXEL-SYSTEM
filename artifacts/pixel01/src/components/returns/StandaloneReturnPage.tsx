import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { useSearch } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { pickDefaultLinkedTreasuryId, useLinkedTreasuries } from "@/hooks/use-linked-treasuries";
import { useCashierSessions } from "@/hooks/use-invoices";
import { useContacts } from "@/hooks/use-contacts";
import { useContactBalances, computeContactDue } from "@/hooks/use-contact-balances";
import { Button } from "@/components/ui/button";
import { createStandaloneReturn } from "@/lib/standalone-returns.functions";
import { formatCurrency } from "@/lib/format";
import { useSettings } from "@/contexts/SettingsContext";
import { unitOptions, toBase, formatBaseQuantity, baseUnitsPer, type UnitLevel, type ProductUnitTree } from "@/lib/units";
import { priceForUnitLevel } from "@/lib/stock-display";
import { computeProductBatches } from "@/lib/product-batches";
import { PHARMACY_UNITS } from "@/lib/pharmacy-units";
import { DateInput } from "@/components/shared/DateInput";

type ProductRow = {
  id: string;
  name: string;
  name_en?: string | null;
  sku: string | null;
  price: number;
  cost: number;
  stock: number;
  has_expiry?: boolean | null;
  main_unit: string | null;
  sub_unit_1: string | null;
  sub_unit_1_ratio: number | null;
  sub_unit_2: string | null;
  sub_unit_2_ratio: number | null;
};

type UnitChoice = { level: UnitLevel; name: string; ratio: number };

type Row = {
  key: string;
  product_id: string | null;
  product_name: string;
  is_new: boolean;
  quantity: number;
  unit_price: number;
  discount: number;
  base_price: number;
  unit_level: UnitLevel;
  unit_name: string;
  base_factor: number;
  unit_choices: UnitChoice[];
  product_units: ProductUnitTree | null;
  current_stock_base: number;
  expiry_date: string;
  // per-row autocomplete state
  searchText: string;
  showDropdown: boolean;
  dropdownIndex: number;
};

const newRow = (): Row => ({
  key: crypto.randomUUID(),
  product_id: null,
  product_name: "",
  is_new: false,
  quantity: 1,
  unit_price: 0,
  discount: 0,
  base_price: 0,
  unit_level: "main",
  unit_name: "",
  base_factor: 1,
  unit_choices: [],
  product_units: null,
  current_stock_base: 0,
  expiry_date: "",
  searchText: "",
  showDropdown: false,
  dropdownIndex: -1,
});

function useProductSearch() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["products-for-standalone-return"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase.from("products") as any)
        .select("id,name,name_en,sku,price,cost,stock,has_expiry,main_unit,sub_unit_1,sub_unit_1_ratio,sub_unit_2,sub_unit_2_ratio")
        .order("name")
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });
}

// Filter products by search term against Arabic name, English name, and SKU
function filterProducts(products: ProductRow[], term: string): ProductRow[] {
  if (!term.trim()) return [];
  const lower = term.trim().toLowerCase();
  return products.filter(
    (p) =>
      p.name.toLowerCase().includes(lower) ||
      (p.name_en && p.name_en.toLowerCase().includes(lower)) ||
      (p.sku && p.sku.toLowerCase().includes(lower)),
  ).slice(0, 20);
}

export function StandaloneReturnPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { data: treasuries = [] } = useLinkedTreasuries();
  const { data: products = [] } = useProductSearch();
  const { data: customers = [] } = useContacts("customer");
  const { data: suppliers = [] } = useContacts("supplier");
  const { data: unifiedBalances } = useContactBalances();
  const submitFn = createStandaloneReturn;

  const { data: sessions = [] } = useCashierSessions();
  const { sessionId: urlSessionId } = useSearch({ strict: false }) as { sessionId?: string };
  const activeSession = sessions.find((s: any) => s.status === "open" && s.user_id === user?.id);
  const linkedSessionId = urlSessionId || activeSession?.id;

  const [returnType, setReturnType] = useState<"sales" | "purchase">("sales");
  const [treasuryId, setTreasuryId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<Row[]>([newRow()]);

  // per-row search input refs for focus management
  const searchRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // per-row auto-add timers
  const autoAddTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Contact tabs: cash / customer / supplier
  const [partyMode, setPartyMode] = useState<"cash" | "customer" | "supplier">("cash");
  const [contactId, setContactId] = useState<string>("");
  const [methodDialogOpen, setMethodDialogOpen] = useState(false);

  // When the return type changes, default contact tab back to cash to avoid confusion.
  useEffect(() => { setPartyMode("cash"); setContactId(""); }, [returnType]);

  useEffect(() => {
    if (!treasuryId && treasuries.length > 0) {
      setTreasuryId(pickDefaultLinkedTreasuryId(treasuries));
    }
  }, [treasuries, treasuryId]);

  // Row total = qty * unitPrice - discount
  const rowTotal = (r: Row): number =>
    Math.max(0, (Number(r.quantity) || 0) * (Number(r.unit_price) || 0) - (Number(r.discount) || 0));

  const total = useMemo(
    () => rows.reduce((s, r) => s + rowTotal(r), 0),
    [rows],
  );

  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) =>
    setRows((rs) => (rs.length === 1 ? [newRow()] : rs.filter((r) => r.key !== key)));
  const addRow = () => setRows((rs) => [...rs, newRow()]);

  // Apply matched product to a row
  const applyProduct = (key: string, match: ProductRow) => {
    const choices = unitOptions(match as any) as UnitChoice[];
    const first: UnitChoice = choices[0] || { level: "main", name: match.main_unit || "وحدة", ratio: 1 };
    const tree: ProductUnitTree = {
      main_unit: match.main_unit,
      sub_unit_1: match.sub_unit_1,
      sub_unit_1_ratio: match.sub_unit_1_ratio,
      sub_unit_2: match.sub_unit_2,
      sub_unit_2_ratio: match.sub_unit_2_ratio,
    };
    const unitPrice = priceForUnitLevel(
      { ...match, price: returnType === "sales" ? match.price : match.cost },
      first.level,
      baseUnitsPer,
    );
    const basePrice = priceForUnitLevel(
      { ...match, price: returnType === "sales" ? match.price : match.cost },
      "main",
      baseUnitsPer,
    );
    updateRow(key, {
      product_id: match.id,
      product_name: match.name,
      is_new: false,
      unit_level: first.level,
      unit_name: first.name,
      base_factor: first.ratio,
      unit_choices: choices.length ? choices : [first],
      product_units: tree,
      base_price: basePrice,
      unit_price: unitPrice,
      current_stock_base: Number(match.stock) || 0,
      searchText: match.name,
      showDropdown: false,
      dropdownIndex: -1,
    });
  };

  // Handle search text change for a row
  const onSearchChange = (key: string, value: string) => {
    // Clear any pending auto-add timer
    if (autoAddTimers.current[key]) {
      clearTimeout(autoAddTimers.current[key]);
      delete autoAddTimers.current[key];
    }

    const results = filterProducts(products, value);

    updateRow(key, {
      searchText: value,
      product_name: value,
      product_id: null,
      is_new: false,
      showDropdown: results.length > 0,
      dropdownIndex: -1,
    });

    // Auto-add if exactly one result after 500ms delay
    if (results.length === 1) {
      autoAddTimers.current[key] = setTimeout(() => {
        applyProduct(key, results[0]);
        delete autoAddTimers.current[key];
      }, 500);
    }
  };

  // Handle keyboard navigation in the search dropdown
  const onSearchKeyDown = (key: string, e: React.KeyboardEvent<HTMLInputElement>, results: ProductRow[]) => {
    const row = rows.find((r) => r.key === key);
    if (!row) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min((row.dropdownIndex ?? -1) + 1, results.length - 1);
      updateRow(key, { dropdownIndex: next, showDropdown: true });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max((row.dropdownIndex ?? -1) - 1, 0);
      updateRow(key, { dropdownIndex: prev, showDropdown: true });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (row.dropdownIndex >= 0 && results[row.dropdownIndex]) {
        applyProduct(key, results[row.dropdownIndex]);
      } else if (results.length === 1) {
        applyProduct(key, results[0]);
      } else {
        // Mark as new product
        const trimmed = row.searchText.trim();
        updateRow(key, {
          product_id: null,
          product_name: trimmed,
          is_new: trimmed.length > 0,
          showDropdown: false,
        });
      }
    } else if (e.key === "Escape") {
      updateRow(key, { showDropdown: false });
    }
  };

  const changeUnit = (key: string, level: UnitLevel) => {
    const r = rows.find((x) => x.key === key);
    if (!r) return;
    const choice = r.unit_choices.find((c) => c.level === level);
    if (!choice) return;
    const unitPrice = r.product_units
      ? priceForUnitLevel(
          { ...r.product_units, price: r.base_price || r.unit_price },
          level,
          baseUnitsPer,
        )
      : (r.base_price || 0) * (choice.ratio || 1);
    updateRow(key, {
      unit_level: level,
      unit_name: choice.name,
      base_factor: choice.ratio,
      unit_price: unitPrice,
    });
  };

  const computeBase = (r: Row): number => {
    if (r.product_units) return toBase(Number(r.quantity) || 0, r.unit_level, r.product_units);
    return Math.max(0, Math.round((Number(r.quantity) || 0) * (Number(r.base_factor) || 1)));
  };

  const stockError = (r: Row): string | null => {
    // Expiry guard for both sales/purchase returns: refuse expired batches.
    if (r.expiry_date) {
      const today = new Date(); today.setHours(0,0,0,0);
      const exp = new Date(r.expiry_date);
      if (!isNaN(exp.getTime()) && exp < today) return "هذه الدفعة منتهية الصلاحية — لا يمكن إرجاعها";
    }
    if (returnType !== "purchase") return null;
    if (!r.product_id) return null;
    const need = computeBase(r);
    if (r.current_stock_base <= 0) return "الرصيد الحالي صفر — لا يمكن عمل مرتجع مشتريات";
    if (need > r.current_stock_base) return `الرصيد غير كافٍ (المتاح: ${r.current_stock_base})`;
    return null;
  };

  const hasBlockingError = rows.some((r) => stockError(r) !== null);

  // Contacts available for the active tab.
  const contacts = partyMode === "customer" ? customers : partyMode === "supplier" ? suppliers : [];
  const balances = unifiedBalances;
  const selectedContact = contacts.find((c: any) => c.id === contactId);
  const contactDue = selectedContact && partyMode !== "cash"
    ? computeContactDue(selectedContact, balances?.get(selectedContact.id))
    : null;

  const submit = useMutation({
    mutationFn: async (paymentMethod: "cash" | "account") => {
      if (hasBlockingError) throw new Error("يوجد أصناف برصيد غير كافٍ — صحّح الكميات أولاً");
      const items = rows
        .filter((r) => r.quantity > 0 && (r.product_id || r.product_name.trim()))
        .map((r) => ({
          product_id: r.product_id,
          new_product_name: r.product_id ? null : r.product_name.trim(),
          quantity: Number(r.quantity),
          base_quantity: computeBase(r) || Number(r.quantity),
          unit_price: Number(r.unit_price) || 0,
          discount: Number(r.discount) || 0,
          expiry_date: r.expiry_date || null,
          _row: r,
        }));
      if (items.length === 0) throw new Error("أضف صنف واحد على الأقل بكمية صحيحة");
      if (!treasuryId) throw new Error("اختر الخزينة");
      if (returnType === "purchase") {
        for (const it of items) {
          if (!it.product_id) continue;
          const prod = products.find((p) => p.id === it.product_id);
          if (prod?.has_expiry && !it.expiry_date) {
            throw new Error(`اختر دفعة الصلاحية للصنف: ${prod.name}`);
          }
          if (it.expiry_date) {
            const batches = await computeProductBatches(it.product_id);
            const batch = batches.find((b) => b.expiry_date === it.expiry_date);
            if (!batch || Number(it.base_quantity || 0) > Number(batch.remaining || 0)) {
              throw new Error(`الكمية أكبر من المتاح في دفعة الصلاحية للصنف: ${prod?.name || it.product_id}`);
            }
          }
        }
      }
      return submitFn({
        data: {
          return_type: returnType,
          warehouse_id: null,
          treasury_id: treasuryId,
          reason: reason || null,
          items: items.map(({ _row, ...it }) => it),
          contact_id: partyMode === "cash" ? null : (contactId || null),
          contact_type: partyMode === "cash" ? null : partyMode,
          payment_method: paymentMethod,
          session_id: linkedSessionId ?? undefined,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`تم تسجيل المرتجع ${res.reference_no}`);
      setRows([newRow()]);
      setReason("");
      setMethodDialogOpen(false);
      setContactId("");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-alert"] });
      qc.invalidateQueries({ queryKey: ["products-for-standalone-return"] });
      qc.invalidateQueries({ queryKey: ["product_warehouse_stock"] });
      qc.invalidateQueries({ queryKey: ["product-batches"] });
      qc.invalidateQueries({ queryKey: ["item-card-bundle"] });
      qc.invalidateQueries({ queryKey: ["product-card"] });
      qc.invalidateQueries({ queryKey: ["treasuries"] });
      qc.invalidateQueries({ queryKey: ["treasury_transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account_balances"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["standalone_returns"] });
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      qc.invalidateQueries({ queryKey: ["contact_payments"] });
      qc.invalidateQueries({ queryKey: ["session-standalone-returns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onClickSave = () => {
    if (partyMode === "cash") {
      submit.mutate("cash");
    } else {
      if (!contactId) { toast.error(partyMode === "customer" ? "اختر العميل" : "اختر المورد"); return; }
      setMethodDialogOpen(true);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      <h1 className="text-2xl font-bold mb-1">مرتجع حر</h1>
      {linkedSessionId && (
        <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
          مرتبط بجلسة الكاشير الحالية
          {urlSessionId ? ` (${urlSessionId.slice(0, 8)}…)` : ""}
        </div>
      )}
      <p className="text-sm text-muted-foreground mb-4">
        تسجيل مرتجع مبيعات أو مشتريات بدون فاتورة. يحدّث المخزون والخزينة والقيد المحاسبي تلقائياً.
      </p>

      {/* Type tabs */}
      <div className="inline-flex rounded-md border bg-card mb-4 overflow-hidden">
        <button
          onClick={() => setReturnType("sales")}
          className={`px-5 py-2 text-sm font-semibold ${returnType === "sales" ? "bg-primary text-primary-foreground" : "text-foreground"}`}
        >
          مرتجع مبيعات
        </button>
        <button
          onClick={() => setReturnType("purchase")}
          className={`px-5 py-2 text-sm font-semibold ${returnType === "purchase" ? "bg-primary text-primary-foreground" : "text-foreground"}`}
        >
          مرتجع مشتريات
        </button>
      </div>

      {/* Party tabs */}
      <div className="bg-card p-4 rounded-md border mb-5">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[13px] font-bold ml-2">الطرف:</span>
          {[
            { id: "cash", label: "نقدي" },
            { id: "customer", label: "عميل" },
            { id: "supplier", label: "مورد" },
          ].filter((p) => p.id !== "supplier" || returnType === "purchase")
            .filter((p) => p.id !== "customer" || returnType === "sales" || true)
            .map((p) => (
              <button
                key={p.id}
                onClick={() => { setPartyMode(p.id as any); setContactId(""); }}
                className={`px-4 py-1.5 text-sm rounded-md border ${partyMode === p.id ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground"}`}
              >
                {p.label}
              </button>
            ))}
        </div>

        {partyMode !== "cash" && (
          <div>
            <label className="block mb-1.5 text-[13px] font-bold text-foreground">
              {partyMode === "customer" ? "العميل" : "المورد"} <span className="text-destructive">*</span>
            </label>
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="h-10 px-3 rounded-md text-sm w-full md:w-1/2 border bg-background"
            >
              <option value="">— اختر —</option>
              {contacts.map((c: any) => {
                const nm = c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "بدون اسم";
                return <option key={c.id} value={c.id}>{nm}</option>;
              })}
            </select>
            {contactDue && (
              <div className="mt-2 text-[12px] font-semibold">
                {contactDue.gross > 0 && (
                  <span className="text-red-600">
                    رصيد مستحق: {formatCurrency(Math.abs(contactDue.gross), settings)} (عليه)
                  </span>
                )}
                {contactDue.gross < 0 && (
                  <span className="text-green-600">
                    رصيد مستحق: {formatCurrency(Math.abs(contactDue.gross), settings)} (له)
                  </span>
                )}
                {contactDue.gross === 0 && (
                  <span className="text-muted-foreground">الرصيد: 0</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Header form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 bg-card p-4 rounded-md border">
        <div>
          <label className="block mb-1.5 text-[13px] font-bold text-foreground">
            الخزينة <span className="text-destructive">*</span>
          </label>
          <select
            value={treasuryId}
            onChange={(e) => setTreasuryId(e.target.value)}
            className="h-10 px-3 rounded-md text-sm w-full border bg-background"
          >
            <option value="">— اختر الخزينة —</option>
            {treasuries.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}{t.is_default_cash ? " ⭐" : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block mb-1.5 text-[13px] font-bold text-foreground">السبب / ملاحظة</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: تالف، خطأ في الطلب…"
            className="h-10 px-3 rounded-md text-sm w-full border bg-background"
          />
        </div>
      </div>

      {/* Items table — horizontally scrollable */}
      <div className="bg-card border rounded-md overflow-x-auto mb-4" style={{ paddingBottom: "180px" }}>
        <table className="text-sm" style={{ minWidth: "900px", width: "100%", whiteSpace: "nowrap" }}>
          <thead className="bg-muted">
            <tr className="text-right">
              <th className="p-2 font-semibold" style={{ minWidth: "220px" }}>الصنف</th>
              <th className="p-2 font-semibold" style={{ minWidth: "120px" }}>الوحدة</th>
              <th className="p-2 font-semibold" style={{ minWidth: "90px" }}>الكمية</th>
              <th className="p-2 font-semibold" style={{ minWidth: "110px" }}>سعر الوحدة</th>
              <th className="p-2 font-semibold" style={{ minWidth: "100px" }}>الخصم</th>
              <th className="p-2 font-semibold" style={{ minWidth: "140px" }}>تاريخ الصلاحية</th>
              <th className="p-2 font-semibold" style={{ minWidth: "110px" }}>الإجمالي</th>
              <th className="p-2" style={{ minWidth: "48px" }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const err = stockError(r);
              const searchResults = filterProducts(products, r.searchText);
              return (
                <tr key={r.key} className="border-t align-top">
                  {/* Product autocomplete cell */}
                  <td className="p-2" style={{ position: "relative" }}>
                    <div style={{ position: "relative" }}>
                      <input
                        ref={(el) => { searchRefs.current[r.key] = el; }}
                        value={r.searchText}
                        onChange={(e) => onSearchChange(r.key, e.target.value)}
                        onKeyDown={(e) => onSearchKeyDown(r.key, e, searchResults)}
                        onFocus={() => {
                          if (searchResults.length > 0) updateRow(r.key, { showDropdown: true });
                        }}
                        onBlur={() => {
                          // Delay hiding to allow click on dropdown item
                          setTimeout(() => updateRow(r.key, { showDropdown: false }), 200);
                        }}
                        placeholder="ابحث بالاسم أو الكود…"
                        className="h-9 px-2 rounded-md text-sm w-full border bg-background"
                        autoComplete="off"
                      />
                      {/* Dropdown */}
                      {r.showDropdown && searchResults.length > 0 && (
                        <div
                          style={{
                            position: "absolute",
                            top: "100%",
                            right: 0,
                            left: 0,
                            zIndex: 50,
                            background: "var(--background, #fff)",
                            border: "1px solid var(--border, #e5e7eb)",
                            borderRadius: "6px",
                            boxShadow: "0 4px 16px rgba(0,0,0,0.13)",
                            maxHeight: "220px",
                            overflowY: "auto",
                            minWidth: "500px"
                          }}
                        >
                          {searchResults.map((p, idx) => (
                            <div
                              key={p.id}
                              onMouseDown={() => applyProduct(r.key, p)}
                              style={{
                                padding: "7px 10px",
                                cursor: "pointer",
                                background: idx === r.dropdownIndex ? "var(--accent, #f3f4f6)" : "transparent",
                                borderBottom: idx < searchResults.length - 1 ? "1px solid var(--border, #f0f0f0)" : "none",
                              }}
                            >
                              <span className="font-medium">{p.name}</span>
                              {p.sku && (
                                <span className="text-muted-foreground text-xs mr-2">({p.sku})</span>
                              )}
                              {p.name_en && (
                                <span className="text-muted-foreground text-xs mr-2 dir-ltr">{p.name_en}</span>
                              )}
                            </div>
                          ))}
                          {/* "Add as new product" option */}
                          {r.searchText.trim() && (
                            <div
                              onMouseDown={() => {
                                const trimmed = r.searchText.trim();
                                updateRow(r.key, {
                                  product_id: null,
                                  product_name: trimmed,
                                  is_new: true,
                                  showDropdown: false,
                                });
                              }}
                              style={{
                                padding: "7px 10px",
                                cursor: "pointer",
                                color: "var(--primary, #6366f1)",
                                fontWeight: 600,
                                fontSize: "12px",
                              }}
                            >
                              ➕ إضافة كمنتج جديد: «{r.searchText.trim()}»
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {r.is_new && (
                      <div className="text-[11px] text-emerald-700 mt-1">
                        ➕ سيتم إنشاء منتج جديد: «{r.product_name}»
                      </div>
                    )}
                    {r.product_id && (
                      <div className="text-[11px] text-muted-foreground mt-1">
                        الرصيد الحالي: {r.product_units ? formatBaseQuantity(r.current_stock_base, r.product_units as any) : r.current_stock_base}
                      </div>
                    )}
                    {err && (
                      <div className="text-[11px] text-destructive mt-1 font-semibold">{err}</div>
                    )}
                  </td>
                  {/* Unit */}
                  <td className="p-2">
                    <select
                      value={r.unit_choices.length > 0 ? r.unit_level : `__free__:${r.unit_name}`}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val.startsWith("__free__:")) {
                          updateRow(r.key, {
                            unit_name: val.slice("__free__:".length),
                            unit_level: "main",
                            base_factor: 1,
                          });
                        } else {
                          changeUnit(r.key, val as UnitLevel);
                        }
                      }}
                      className="h-9 px-2 rounded-md text-sm border bg-background"
                    >
                      {r.unit_choices.length > 0 ? (
                        r.unit_choices.map((c) => (
                          <option key={c.level} value={c.level}>{c.name}</option>
                        ))
                      ) : (
                        <>
                          {!r.unit_name && <option value="__free__:">— اختر الوحدة —</option>}
                          {r.unit_name && !PHARMACY_UNITS.includes(r.unit_name) && (
                            <option value={`__free__:${r.unit_name}`}>{r.unit_name}</option>
                          )}
                          {PHARMACY_UNITS.map((u) => (
                            <option key={u} value={`__free__:${u}`}>{u}</option>
                          ))}
                        </>
                      )}
                    </select>
                  </td>
                  {/* Quantity */}
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={r.quantity}
                      onChange={(e) => updateRow(r.key, { quantity: Number(e.target.value) })}
                      className="h-9 px-2 rounded-md text-sm w-full border bg-background"
                    />
                  </td>
                  {/* Unit price */}
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={r.unit_price}
                      onChange={(e) => updateRow(r.key, { unit_price: Number(e.target.value), base_price: (Number(e.target.value) || 0) / (r.base_factor || 1) })}
                      className="h-9 px-2 rounded-md text-sm w-full border bg-background"
                    />
                  </td>
                  {/* Discount (amount) */}
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={r.discount}
                      onChange={(e) => updateRow(r.key, { discount: Number(e.target.value) })}
                      className="h-9 px-2 rounded-md text-sm w-full border bg-background"
                      placeholder="0"
                    />
                  </td>
                  {/* Expiry date */}
                  <td className="p-2">
                    {returnType === "purchase" && r.product_id ? (
                      <StandaloneBatchSelect
                        productId={r.product_id}
                        product={r.product_units}
                        value={r.expiry_date}
                        onChange={(v) => updateRow(r.key, { expiry_date: v })}
                      />
                    ) : (
                      <DateInput
                        value={r.expiry_date}
                        onChange={(v) => updateRow(r.key, { expiry_date: v })}
                        className="h-9 px-2 rounded-md text-sm w-full border bg-background outline-none"
                      />
                    )}
                  </td>
                  {/* Row total */}
                  <td className="p-2 font-semibold" style={{ whiteSpace: "nowrap" }}>
                    {formatCurrency(rowTotal(r), settings)}
                  </td>
                  {/* Delete */}
                  <td className="p-2 text-center">
                    <button onClick={() => removeRow(r.key)} className="text-destructive p-1" title="حذف">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/50">
              <td className="p-2" colSpan={6}>
                <button
                  onClick={addRow}
                  className="inline-flex items-center gap-1 text-sm text-primary font-semibold"
                >
                  <Plus size={14} /> إضافة صنف
                </button>
              </td>
              <td className="p-2 font-bold" style={{ whiteSpace: "nowrap" }}>{formatCurrency(total, settings)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <Button onClick={onClickSave} disabled={submit.isPending || hasBlockingError}>
          {submit.isPending ? "جاري الحفظ…" : returnType === "sales" ? "تسجيل مرتجع مبيعات" : "تسجيل مرتجع مشتريات"}
        </Button>
      </div>

      {/* Payment method dialog */}
      {methodDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => !submit.isPending && setMethodDialogOpen(false)}
        >
          <div
            className="bg-card border rounded-lg p-5 w-full max-w-md mx-4"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-1">طريقة الاسترداد</h3>
            <p className="text-sm text-muted-foreground mb-4">
              قيمة المرتجع: <b>{formatCurrency(total, settings)}</b><br />
              {partyMode === "customer" ? "العميل" : "المورد"}: <b>{selectedContact ? (selectedContact.business_name || [selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(" ")) : ""}</b>
            </p>
            <div className="space-y-2">
              <button
                disabled={submit.isPending}
                onClick={() => submit.mutate("cash")}
                className="w-full text-right p-3 border rounded-md hover:bg-accent transition"
              >
                <div className="font-bold">نقدي فوري من الخزينة</div>
                <div className="text-[12px] text-muted-foreground">
                  {returnType === "sales"
                    ? "سحب من الخزينة وتسليم العميل المبلغ نقدًا."
                    : "استلام من المورد للخزينة نقدًا."}
                </div>
              </button>
              <button
                disabled={submit.isPending}
                onClick={() => submit.mutate("account")}
                className="w-full text-right p-3 border rounded-md hover:bg-accent transition"
              >
                <div className="font-bold">
                  على حساب {partyMode === "customer" ? "العميل" : "المورد"} (رصيد)
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {returnType === "sales"
                    ? "يُضاف للعميل رصيد دائن يستخدمه في فواتير قادمة."
                    : "يُخصم من مديونيتنا تجاه المورد."}
                </div>
              </button>
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setMethodDialogOpen(false)}
                disabled={submit.isPending}
                className="px-4 py-2 text-sm rounded-md border"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StandaloneBatchSelect({
  productId,
  product,
  value,
  onChange,
}: {
  productId: string;
  product: ProductUnitTree | null;
  value: string;
  onChange: (value: string) => void;
}) {
  const { data: batches = [] } = useQuery({
    queryKey: ["product-batches", productId],
    enabled: !!productId,
    queryFn: () => computeProductBatches(productId),
  });
  const available = batches.filter((b) => Number(b.remaining || 0) > 0);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 px-2 rounded-md text-sm w-full border bg-background outline-none"
    >
      <option value="">اختر الدفعة</option>
      {available.map((b) => (
        <option key={b.expiry_date || "__no_expiry__"} value={b.expiry_date || ""}>
          {b.expiry_date || "بدون صلاحية"} - {product ? formatBaseQuantity(b.remaining, product) : b.remaining}
        </option>
      ))}
    </select>
  );
}
