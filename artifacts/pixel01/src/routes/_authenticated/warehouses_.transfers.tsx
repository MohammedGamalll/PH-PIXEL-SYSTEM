import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useWarehouses } from "@/hooks/use-warehouses";
import { useWarehouseTransfers, useCreateWarehouseTransfer, type TransferItemInput } from "@/hooks/use-warehouse-transfers";
import { useWarehouseContext } from "@/contexts/WarehouseContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeftRight, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { unitOptions, formatBaseQuantity, type UnitLevel } from "@/lib/units";

export const Route = createFileRoute("/_authenticated/warehouses_/transfers")({
  component: WarehouseTransfersPage,
});

function WarehouseTransfersPage() {
  const { data: warehouses = [], isLoading: whLoading } = useWarehouses();
  const { data: transfers = [], isLoading: trLoading } = useWarehouseTransfers();
  const { currentWarehouseId } = useWarehouseContext();
  const create = useCreateWarehouseTransfer();
  const [open, setOpen] = useState(false);

  const { data: products = [], isLoading: prodLoading } = useQuery({
    queryKey: ["products-min-units"],
    queryFn: async () => {
      const { data } = await supabase.from("products")
        .select("id,name,sku,unit,main_unit,sub_unit_1,sub_unit_1_ratio,sub_unit_2,sub_unit_2_ratio")
        .limit(2000);
      return data ?? [];
    },
  });

  const validWarehouses = useMemo(
    () => (warehouses ?? []).filter((w) => !!w?.id),
    [warehouses]
  );
  const validProducts = useMemo(
    () => (products ?? []).filter((p: any) => !!p?.id),
    [products]
  );

  type RowItem = TransferItemInput & { unit_level?: UnitLevel };

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [refNo, setRefNo] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<RowItem[]>([]);

  const productsMap = useMemo(
    () => Object.fromEntries(validProducts.map((p: any) => [p.id, p])),
    [validProducts]
  );
  const whMap = useMemo(
    () => Object.fromEntries(validWarehouses.map((w) => [w.id, w])),
    [validWarehouses]
  );

  // source warehouse stock map (for client-side validation)
  const { data: sourceStock = {} } = useQuery({
    queryKey: ["pws-by-warehouse", from],
    enabled: !!from,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_warehouse_stock")
        .select("product_id, stock")
        .eq("warehouse_id", from);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as any[]) map[r.product_id] = Number(r.stock ?? 0);
      return map;
    },
  });

  const reset = () => {
    setRefNo(""); setNotes(""); setItems([]);
    // re-prefill from/to to current + alternative
    prefillFromTo();
  };

  const prefillFromTo = () => {
    if (validWarehouses.length < 2) {
      setFrom(validWarehouses[0]?.id ?? "");
      setTo("");
      return;
    }
    const fromId = currentWarehouseId && validWarehouses.some((w) => w.id === currentWarehouseId)
      ? currentWarehouseId
      : validWarehouses[0].id;
    const toId = validWarehouses.find((w) => w.id !== fromId)?.id ?? "";
    setFrom(fromId);
    setTo(toId);
  };

  // prefill when warehouses arrive or dialog opens
  useEffect(() => {
    if (!open) return;
    prefillFromTo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, validWarehouses.length, currentWarehouseId]);

  const defaultLevelFor = (p: any): UnitLevel => {
    // largest defined unit
    if (p?.main_unit) return "main";
    if (p?.sub_unit_1) return "sub1";
    return "sub2";
  };

  const addRow = () => setItems((arr) => [...arr, { product_id: "", description: "", quantity: 1 }]);
  const removeRow = (i: number) => setItems((arr) => arr.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<RowItem>) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const ratioFor = (p: any, level: UnitLevel | undefined): number => {
    if (!p || !level) return 1;
    const opts = unitOptions(p);
    return opts.find((o) => o.level === level)?.ratio ?? 1;
  };

  const submit = async () => {
    if (!from || !to) return toast.error("اختر المخزن المصدر والوجهة");
    if (from === to) return toast.error("لا يمكن التحويل لنفس المخزن");
    const valid = items.filter((it) => it?.product_id && Number(it?.quantity) > 0);
    if (!valid.length) return toast.error("أضف صنفاً واحداً على الأقل");

    // client-side stock check against source warehouse PWS (in BASE units)
    for (const it of valid) {
      const p = productsMap[it.product_id];
      const ratio = ratioFor(p, it.unit_level ?? defaultLevelFor(p));
      const baseNeed = Math.round(Number(it.quantity) * ratio);
      const have = Number(sourceStock?.[it.product_id] ?? 0);
      if (baseNeed > have) {
        const name = p?.name ?? "صنف";
        return toast.error(`الكمية المطلوبة للصنف "${name}" تتجاوز المتوفر في المخزن المصدر (المتوفر: ${formatBaseQuantity(have, p || {})})`);
      }
    }

    await create.mutateAsync({
      from_warehouse_id: from,
      to_warehouse_id: to,
      ref_no: refNo || null,
      notes: notes || null,
      items: valid.map((it) => {
        const p = productsMap[it.product_id];
        const level = it.unit_level ?? defaultLevelFor(p);
        const ratio = ratioFor(p, level);
        const opts = unitOptions(p || {});
        const unitName = opts.find((o) => o.level === level)?.name || p?.unit || null;
        return {
          product_id: it.product_id,
          description: it.description || p?.name || "",
          quantity: Number(it.quantity),
          unit_name: unitName,
          base_quantity: Math.round(Number(it.quantity) * ratio),
        };
      }),
    });
    reset();
    setOpen(false);
  };

  const pageLoading = whLoading || trLoading;

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">تحويلات بين المخازن</h1>
        </div>
        <Button onClick={() => setOpen(true)} disabled={validWarehouses.length < 2 || pageLoading}>
          <Plus className="h-4 w-4 ms-1" /> تحويل جديد
        </Button>
      </div>

      {!pageLoading && validWarehouses.length < 2 && (
        <div className="text-sm text-muted-foreground bg-muted/40 rounded p-3">
          يلزم وجود مخزنين على الأقل لتنفيذ تحويلات.
        </div>
      )}

      <Card className="overflow-hidden">
        {pageLoading ? (
          <div className="p-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin ms-2" /> جاري التحميل...
          </div>
        ) : (
          <table className="w-full text-sm data-table">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-start">التاريخ</th>
                <th className="p-3 text-start">المرجع</th>
                <th className="p-3 text-start">من</th>
                <th className="p-3 text-start">إلى</th>
                <th className="p-3 text-start">الأصناف والكميات</th>
                <th className="p-3 text-start">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {(transfers?.length ?? 0) === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد تحويلات بعد</td></tr>
              ) : (transfers as any[]).map((t: any) => {
                const lines: string[] = (t?.warehouse_transfer_items ?? []).map((it: any) => {
                  const p = productsMap[it?.product_id];
                  const baseQty = Number(it?.base_quantity ?? it?.quantity ?? 0);
                  const formatted = p ? formatBaseQuantity(baseQty, p) : `${baseQty} ${it?.unit_name ?? ""}`.trim();
                  const name = p?.name ?? it?.description ?? "صنف";
                  return `${name}: ${formatted}`;
                });
                return (
                  <tr key={t?.id} className="border-t">
                    <td className="p-3 font-semibold">{t?.transfer_date ?? (t?.created_at ? new Date(t.created_at).toLocaleDateString("ar-EG") : "—")}</td>
                    <td className="p-3 font-semibold">{t?.ref_no || "-"}</td>
                    <td className="p-3 font-semibold">{whMap[t?.from_warehouse_id]?.name ?? "—"}</td>
                    <td className="p-3 font-semibold">{whMap[t?.to_warehouse_id]?.name ?? "—"}</td>
                    <td className="p-3 font-semibold" title={lines.join("\n")}>
                      {lines.length === 0 ? "—" : (
                        <span className="line-clamp-2 whitespace-pre-line">{lines.join("، ")}</span>
                      )}
                    </td>
                    <td className="p-3 font-semibold">{t?.status ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent dir="rtl" className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>تحويل بين المخازن</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>من مخزن</Label>
                <Select value={from} onValueChange={setFrom}>
                  <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
                  <SelectContent>
                    {validWarehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>إلى مخزن</Label>
                <Select value={to} onValueChange={setTo}>
                  <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
                  <SelectContent>
                    {validWarehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>المرجع</Label>
                <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="اختياري" />
              </div>
            </div>

            {from && to && from === to && (
              <div className="text-xs text-destructive bg-destructive/10 rounded p-2">
                لا يمكن التحويل لنفس المخزن. اختر مخزناً مختلفاً.
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>الأصناف</Label>
                <Button size="sm" variant="outline" onClick={addRow} disabled={prodLoading}>
                  <Plus className="h-3 w-3 ms-1" /> إضافة صف
                </Button>
              </div>
              <table className="w-full text-sm border">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-start">الصنف</th>
                    <th className="p-2 text-start w-28">الكمية</th>
                    <th className="p-2 text-start w-32">الوحدة</th>
                    <th className="p-2 text-start w-40">المتوفر</th>
                    <th className="p-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const p = it?.product_id ? productsMap[it.product_id] : null;
                    const opts = p ? unitOptions(p) : [];
                    const level: UnitLevel = it?.unit_level ?? (p ? defaultLevelFor(p) : "main");
                    const ratio = ratioFor(p, level);
                    const haveBase = it?.product_id ? Number(sourceStock?.[it.product_id] ?? 0) : null;
                    const needBase = Math.round(Number(it?.quantity || 0) * ratio);
                    const over = haveBase !== null && needBase > haveBase;
                    return (
                      <tr key={i} className="border-t">
                        <td className="p-2">
                          <Select
                            value={it?.product_id || undefined}
                            onValueChange={(v) => {
                              const np = productsMap[v];
                              updateRow(i, {
                                product_id: v,
                                description: np?.name || "",
                                unit_level: np ? defaultLevelFor(np) : "main",
                              });
                            }}
                          >
                            <SelectTrigger><SelectValue placeholder="اختر صنف..." /></SelectTrigger>
                            <SelectContent>
                              {prodLoading ? (
                                <div className="p-3 text-center text-xs text-muted-foreground">جاري التحميل...</div>
                              ) : validProducts.length === 0 ? (
                                <div className="p-3 text-center text-xs text-muted-foreground">لا توجد أصناف</div>
                              ) : (
                                validProducts.map((pp: any) => (
                                  <SelectItem key={pp.id} value={pp.id}>
                                    {pp?.name ?? "—"} {pp?.sku ? `(${pp.sku})` : ""}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          <Input
                            type="number" min="0" step="1" value={it?.quantity ?? 0}
                            onChange={(e) => updateRow(i, { quantity: Number(e.target.value) || 0 })}
                            className={over ? "border-destructive" : ""}
                          />
                        </td>
                        <td className="p-2">
                          {opts.length > 0 ? (
                            <Select
                              value={level}
                              onValueChange={(v) => updateRow(i, { unit_level: v as UnitLevel })}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {opts.map((o) => (
                                  <SelectItem key={o.level} value={o.level}>{o.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={`p-2 font-bold ${over ? "text-destructive" : ""}`}>
                          {haveBase === null ? "—" : (p ? formatBaseQuantity(haveBase, p) : haveBase)}
                        </td>
                        <td className="p-2 text-center">
                          <Button size="sm" variant="ghost" onClick={() => removeRow(i)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr><td colSpan={5} className="p-4 text-center text-muted-foreground text-xs">لا توجد أصناف. اضغط "إضافة صف"</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <Label>ملاحظات</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={submit} disabled={create.isPending || !from || !to || from === to}>
              {create.isPending ? "..." : "تنفيذ التحويل"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
