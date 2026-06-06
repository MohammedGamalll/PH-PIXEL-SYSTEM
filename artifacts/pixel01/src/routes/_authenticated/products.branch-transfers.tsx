import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/lib/owner";
import { useI18n } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format";
import { useSettings } from "@/contexts/SettingsContext";
import { formatBaseQuantity } from "@/lib/units";
import {
  useAdminBranches,
  useBranchTransfers,
  useCreateBranchTransfer,
} from "@/hooks/use-branch-transfers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { ArrowLeftRight, Check, ChevronsUpDown, Eye, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { unitOptions, baseUnitsPer, type UnitLevel } from "@/lib/units";
import { useCan } from "@/lib/can";


export const Route = createFileRoute("/_authenticated/products/branch-transfers")({
  component: BranchTransfersPage,
});

type Row = { product_id: string; quantity: number; unit_level?: UnitLevel; expiry_date?: string };

function defaultLevelFor(p: any): UnitLevel {
  if (p?.main_unit) return "main";
  if (p?.sub_unit_1) return "sub1";
  return "sub2";
}


// Normalize Arabic text: remove diacritics, unify hamzas/yaa/taa-marbouta
function normalizeAr(s: string): string {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u0652\u0670]/g, "") // tashkeel
    .replace(/[إأآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

function BranchTransfersPage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const t = (ar: string, en: string) => (isAr ? ar : en);
  const { can } = useCan();

  const ownerId = useOwnerId();
  const { settings } = useSettings();
  const fc = (n: number) => formatCurrency(n, settings);

  const { data: branches = [], isLoading: brLoading } = useAdminBranches();
  const { data: transfers = [], isLoading: trLoading } = useBranchTransfers();
  const create = useCreateBranchTransfer();

  const { data: products = [] } = useQuery({
    queryKey: ["products-min-branch-tr", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,sku,cost,stock,unit,main_unit,sub_unit_1,sub_unit_1_ratio,sub_unit_2,sub_unit_2_ratio")
        .eq("is_active", true)
        .order("name")
        .limit(5000);
      return data ?? [];
    },
  });
  const productsMap = useMemo(
    () => Object.fromEntries((products as any[]).map((p) => [p.id, p])),
    [products]
  );

  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([{ product_id: "", quantity: 1 }]);
  const [cashTouched, setCashTouched] = useState(false);
  const [cashValue, setCashValue] = useState<string>("0");
  const [pageSize, setPageSize] = useState<number | "all">(25);

  const computedCost = useMemo(() => {
    return rows.reduce((sum, r) => {
      const p = productsMap[r.product_id];
      if (!p) return sum;
      const lvl = (r.unit_level ?? defaultLevelFor(p)) as UnitLevel;
      const ratio = baseUnitsPer(p, lvl);
      const baseQty = (Number(r.quantity) || 0) * ratio;
      const cost = Number(p?.cost ?? 0);
      return sum + cost * baseQty;
    }, 0);
  }, [rows, productsMap]);

  const reset = () => {
    setTarget(""); setNotes("");
    setRows([{ product_id: "", quantity: 1 }]);
    setCashTouched(false); setCashValue("0");
  };

  const addRow = () => setRows((arr) => [...arr, { product_id: "", quantity: 1 }]);
  const removeRow = (i: number) => setRows((arr) => arr.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const submit = async () => {
    if (!target) return toast.error(t("اختر الفرع المستقبل", "Select destination branch"));
    const items = rows.filter((r) => r.product_id && Number(r.quantity) > 0);
    if (items.length === 0) return toast.error(t("أضف صنفاً واحداً على الأقل", "Add at least one item"));
    try {
      await create.mutateAsync({
        target_owner_id: target,
        cash_value: cashTouched ? Number(cashValue) || 0 : computedCost,
        notes: notes || null,
        items: items.map((r) => {
          const p = productsMap[r.product_id];
          const lvl = (r.unit_level ?? (p ? defaultLevelFor(p) : "main")) as UnitLevel;
          const ratio = p ? baseUnitsPer(p, lvl) : 1;
          const opts = p ? unitOptions(p) : [];
          const unitName = opts.find((o) => o.level === lvl)?.name || p?.unit || null;
          return {
            product_id: r.product_id,
            quantity: Number(r.quantity),
            base_quantity: Math.round(Number(r.quantity) * ratio),
            unit_name: unitName,
            expiry_date: r.expiry_date || null,
          };
        }),

      });
      reset();
      setOpen(false);
    } catch { /* toast handled */ }
  };


  const sortedTransfers = useMemo(() => {
    const arr = [...(transfers as any[])];
    arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return pageSize === "all" ? arr : arr.slice(0, pageSize);
  }, [transfers, pageSize]);

  const branchName = (id: string) =>
    (branches as any[]).find((b) => b.owner_id === id)?.display_name ?? "—";

  const pageLoading = brLoading || trLoading;

  return (
    <div className="p-4 md:p-6 space-y-4" dir={isAr ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{t("تحويلات بين الفروع", "Branch transfers")}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(v === "all" ? "all" : Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100, 500, 1000].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
              <SelectItem value="all">{t("الكل", "All")}</SelectItem>
            </SelectContent>
          </Select>
          {can("stock_transfers", "create") && (
            <Button
              onClick={() => setOpen(true)}
              disabled={brLoading || (branches as any[]).length === 0}
            >
              <Plus className="h-4 w-4 mx-1" /> {t("تحويل جديد", "New transfer")}
            </Button>
          )}
        </div>

      </div>

      {!brLoading && (branches as any[]).length === 0 && (
        <div className="text-sm bg-muted/40 rounded p-3" style={{ color: "#92400e", backgroundColor: "#fef3c7" }}>
          {t("لا توجد فروع (حسابات أدمن) أخرى للتحويل إليها.", "No other admin branches available for transfer.")}
        </div>
      )}

      <Card className="overflow-x-auto">
        {pageLoading ? (
          <div className="p-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-2" /> {t("جاري التحميل...", "Loading...")}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-start whitespace-nowrap">{t("التاريخ", "Date")}</th>
                <th className="p-3 text-start whitespace-nowrap">{t("النوع", "Direction")}</th>
                <th className="p-3 text-start whitespace-nowrap">{t("الفرع", "Branch")}</th>
                <th className="p-3 text-start whitespace-nowrap">{t("الأصناف", "Items")}</th>
                <th className="p-3 text-start whitespace-nowrap">{t("تكلفة المخزون", "Stock cost")}</th>
                <th className="p-3 text-start whitespace-nowrap">{t("قيمة النقدية", "Cash value")}</th>
                <th className="p-3 text-start whitespace-nowrap">{t("خيارات", "Options")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedTransfers.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">
                  {t("لا توجد تحويلات بعد", "No transfers yet")}
                </td></tr>
              ) : sortedTransfers.map((tr: any) => {
                const incoming = tr.target_owner_id === ownerId;
                return (
                  <tr key={tr.id} className="border-t">
                    <td className="p-3 whitespace-nowrap">{tr.transfer_date}</td>
                    <td className="p-3 whitespace-nowrap">
                      <span style={{
                        padding: "2px 8px", borderRadius: 4, fontSize: 12,
                        backgroundColor: incoming ? "#dcfce7" : "#dbeafe",
                        color: incoming ? "#166534" : "#1e40af",
                      }}>
                        {incoming ? t("وارد", "Incoming") : t("صادر", "Outgoing")}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap max-w-[260px] truncate" title={incoming ? branchName(tr.owner_id) || "—" : (tr.target_name_snapshot || branchName(tr.target_owner_id))}>
                      {incoming ? branchName(tr.owner_id) || "—" : (tr.target_name_snapshot || branchName(tr.target_owner_id))}
                    </td>
                    <td className="p-3 whitespace-nowrap">{Array.isArray(tr.inventory_branch_transfer_items) ? tr.inventory_branch_transfer_items.length : 0}</td>
                    <td className="p-3 whitespace-nowrap">{fc(Number(tr.total_cost ?? 0))}</td>
                    <td className="p-3 whitespace-nowrap">{fc(Number(tr.cash_value ?? 0))}</td>
                    <td className="p-3 whitespace-nowrap">
                      <Link
                        to="/products/branch-transfers/$id"
                        params={{ id: tr.id }}
                        style={{ color: "#1d4ed8", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <Eye className="h-4 w-4" /> {t("عرض", "View")}
                      </Link>

                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent
          dir={isAr ? "rtl" : "ltr"}
          className="w-[calc(100vw-1rem)] sm:w-auto sm:max-w-5xl max-h-[92vh] overflow-y-auto p-3 sm:p-6"
        >
          <DialogHeader>
            <DialogTitle>{t("تحويل بين الفروع", "Branch transfer")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* All header fields on one row on lg, stacked on mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <Label>{t("الفرع المستقبل", "Destination branch")} *</Label>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger><SelectValue placeholder={t("اختر فرعاً", "Select a branch")} /></SelectTrigger>
                  <SelectContent>
                    {(branches as any[]).map((b) => (
                      <SelectItem key={b.owner_id} value={b.owner_id}>
                        {b.display_name} {b.email && b.display_name !== b.email ? `(${b.email})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("قيمة النقدية", "Cash value")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={cashTouched ? cashValue : String(computedCost)}
                  onChange={(e) => { setCashTouched(true); setCashValue(e.target.value); }}
                />
                <div className="text-xs text-muted-foreground mt-1">
                  {t("افتراضي = إجمالي التكلفة", "Default = total cost")} · {fc(computedCost)}
                </div>
              </div>
              <div>
                <Label>{t("ملاحظات", "Notes")}</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("الأصناف", "Items")}</Label>
                <Button type="button" size="sm" variant="outline" onClick={addRow}>
                  <Plus className="h-4 w-4 mx-1" /> {t("إضافة صنف", "Add item")}
                </Button>
              </div>
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <ItemRow
                    key={i}
                    row={r}
                    products={products as any[]}
                    isAr={isAr}
                    onChange={(patch) => updateRow(i, patch)}
                    onRemove={() => removeRow(i)}
                    onPick={(id) => {
                      const np = (products as any[]).find((p) => p.id === id);
                      updateRow(i, { product_id: id, unit_level: np ? defaultLevelFor(np) : "main" });
                    }}
                  />
                ))}

              </div>
            </div>

            <div className="rounded p-3 text-xs sm:text-sm bg-muted/50">
              {t(
                "ملاحظة: سيتم خصم الكمية من مخزنك الافتراضي وإضافتها لمخزن الفرع المستقبل تلقائياً، مع تسجيل إيداع في خزينتك وسحب من خزينة الفرع المستقبل.",
                "Note: stock is deducted from your default warehouse and added to the destination branch automatically, with a deposit on your treasury and a withdrawal on the destination treasury."
              )}
            </div>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }} disabled={create.isPending}>
              {t("إلغاء", "Cancel")}
            </Button>
            <Button onClick={submit} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-1" /> : null}
              {t("تنفيذ التحويل", "Execute transfer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Item row with product Combobox + qty + unit + remove ----
function ItemRow({
  row, products, isAr, onChange, onRemove, onPick,
}: {
  row: Row;
  products: any[];
  isAr: boolean;
  onChange: (p: Partial<Row>) => void;
  onRemove: () => void;
  onPick: (id: string) => void;
}) {
  const t = (ar: string, en: string) => (isAr ? ar : en);
  const selected = products.find((p) => p.id === row.product_id);
  const opts = selected ? unitOptions(selected) : [];
  const level: UnitLevel = (row.unit_level ?? (selected ? defaultLevelFor(selected) : "main")) as UnitLevel;
  const ratio = selected ? baseUnitsPer(selected, level) : 1;
  const availBase = Number(selected?.stock ?? 0);
  const availInUnit = ratio > 0 ? Math.floor(availBase / ratio) : availBase;
  const unitName = opts.find((o) => o.level === level)?.name ?? "";

  return (
    <div className="grid grid-cols-12 gap-2 items-end">
      <div className="col-span-12 sm:col-span-4">
        <ProductCombobox
          value={row.product_id}
          products={products}
          isAr={isAr}
          onChange={onPick}
        />
        {selected && (
          <div className="text-xs text-muted-foreground mt-1">
            {t("المتاح", "Available")}: <b>{availInUnit} {unitName}</b>
            {" · "}{t("تكلفة", "Cost")}: {Number(selected.cost ?? 0).toFixed(2)}
          </div>
        )}
      </div>
      <div className="col-span-4 sm:col-span-2">
        <Input
          type="number"
          min={1}
          value={row.quantity}
          onChange={(e) => onChange({ quantity: Number(e.target.value) })}
          placeholder={t("الكمية", "Qty")}
        />
      </div>
      <div className="col-span-6 sm:col-span-2">
        {opts.length > 0 ? (
          <Select
            value={level}
            onValueChange={(v) => onChange({ unit_level: v as UnitLevel })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {opts.map((o) => (
                <SelectItem key={o.level} value={o.level}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="text-xs text-muted-foreground h-9 flex items-center px-2">—</div>
        )}
      </div>
      <div className="col-span-10 sm:col-span-3">
        <Input
          type="date"
          value={row.expiry_date || ""}
          onChange={(e) => onChange({ expiry_date: e.target.value })}
          placeholder={t("تاريخ الصلاحية", "Expiry")}
          title={t("تاريخ الصلاحية (اختياري)", "Expiry date (optional)")}
        />
      </div>
      <div className="col-span-2 sm:col-span-1 flex justify-end">
        <Button type="button" size="icon" variant="ghost" onClick={onRemove} className="text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

}


function ProductCombobox({
  value, products, isAr, onChange,
}: {
  value: string;
  products: any[];
  isAr: boolean;
  onChange: (id: string) => void;
}) {
  const t = (ar: string, en: string) => (isAr ? ar : en);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = products.find((p) => p.id === value);
  const lastAutoQ = useRef<string>("");

  const filtered = useMemo(() => {
    const nq = normalizeAr(q);
    if (!nq) return products.slice(0, 200);
    return products
      .filter((p) => {
        const hay = normalizeAr(`${p.name || ""} ${p.sku || ""}`);
        return hay.includes(nq);
      })
      .slice(0, 200);
  }, [q, products]);

  // Auto-select when exactly one match (and user has typed)
  useEffect(() => {
    if (!open) return;
    const nq = normalizeAr(q);
    if (!nq) return;
    if (filtered.length === 1 && filtered[0].id !== value && lastAutoQ.current !== nq) {
      lastAutoQ.current = nq;
      onChange(filtered[0].id);
      setOpen(false);
      setQ("");
    }
  }, [filtered, q, open, value, onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-start">
            {selected ? `${selected.name}${selected.sku ? ` (${selected.sku})` : ""}` : t("اختر صنف", "Select product")}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]"
        align="start"
        dir={isAr ? "rtl" : "ltr"}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("ابحث بالاسم أو الكود...", "Search by name or SKU...")}
            value={q}
            onValueChange={setQ}
          />
          <CommandList>
            <CommandEmpty>{t("لا توجد نتائج", "No results")}</CommandEmpty>
            <CommandGroup>
              {filtered.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <Check className={cn("h-4 w-4 mx-1", value === p.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{p.name} {p.sku ? <span className="text-muted-foreground">({p.sku})</span> : null}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("المتاح", "Avail")}: {formatBaseQuantity(Number(p.stock ?? 0), p)}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
