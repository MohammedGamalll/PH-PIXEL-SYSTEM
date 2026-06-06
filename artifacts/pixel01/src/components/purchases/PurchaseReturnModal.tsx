import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePurchaseItemsOf, useCreatePurchaseReturn, useUpdatePurchaseReturn } from "@/hooks/use-purchases";
import { useAutoRef } from "@/hooks/use-auto-ref";
import { supabase } from "@/integrations/supabase/client";

const EMPTY_ITEMS: any[] = [];

export function PurchaseReturnModal({
  open, onOpenChange, purchase, supplierName, existingReturn,
}: { open: boolean; onOpenChange: (v: boolean) => void; purchase: any | null; supplierName?: string; existingReturn?: any | null }) {
  const isEdit = !!existingReturn;
  const { data: purchaseItems } = usePurchaseItemsOf(purchase?.id);
  const items = purchaseItems ?? EMPTY_ITEMS;
  const create = useCreatePurchaseReturn();
  const update = useUpdatePurchaseReturn();
  const [refNo, setRefNo] = useState("");
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [autoRef] = useAutoRef("purchase_returns", "ref_no", "PRT", open && !isEdit);

  // For edit mode: load existing return items + all other returns for caps
  const [existingItems, setExistingItems] = useState<any[]>([]);
  const [otherReturnedByKey, setOtherReturnedByKey] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open || !purchase) return;
    (async () => {
      // Sum quantities from other purchase_returns on the same purchase (excluding current)
      const { data: rets } = await supabase
        .from("purchase_returns").select("id").eq("purchase_id", purchase.id);
      const ids = ((rets ?? []) as any[]).map((r) => r.id).filter((id) => id !== existingReturn?.id);
      let otherMap: Record<string, number> = {};
      if (ids.length) {
        const { data: ritems } = await supabase
          .from("purchase_return_items")
          .select("product_id, description, quantity")
          .in("purchase_return_id", ids);
        for (const it of (ritems ?? []) as any[]) {
          const k = `${it.product_id ?? ""}|${it.description ?? ""}`;
          otherMap[k] = (otherMap[k] ?? 0) + Number(it.quantity || 0);
        }
      }
      setOtherReturnedByKey(otherMap);

      if (isEdit && existingReturn) {
        const { data: cur } = await supabase
          .from("purchase_return_items")
          .select("*").eq("purchase_return_id", existingReturn.id);
        setExistingItems((cur ?? []) as any[]);
      } else {
        setExistingItems([]);
      }
    })();
  }, [open, purchase?.id, existingReturn?.id, isEdit]);

  useEffect(() => {
    if (!open) return;
    if (isEdit && existingReturn) {
      setRefNo(existingReturn.ref_no ?? "");
      const m: Record<string, number> = {};
      for (const it of existingItems) {
        // map by purchase item id when descriptions+product match
        const match = (items as any[]).find((p) =>
          (it.product_id && p.product_id === it.product_id && p.description === it.description) ||
          (!it.product_id && p.description === it.description),
        );
        if (match) m[match.id] = Number(it.quantity || 0);
      }
      setQtys(m);
    } else if (purchase) {
      setRefNo("");
      setQtys({});
    }
  }, [open, isEdit, existingReturn, existingItems, items, purchase]);

  useEffect(() => { if (open && !isEdit && !refNo && autoRef) setRefNo(autoRef); }, [autoRef, open, isEdit, refNo]);

  const itemKey = (it: any) => `${it.product_id ?? ""}|${it.description ?? ""}`;

  const lines = useMemo(() => (items as any[]).map((it) => {
    const q = Number(qtys[it.id] || 0);
    const subtotal = q * Number(it.unit_price || 0);
    const otherReturned = otherReturnedByKey[itemKey(it)] || 0;
    const maxAllowed = Math.max(0, Number(it.quantity || 0) - otherReturned);
    return { ...it, return_qty: q, subtotal, maxAllowed, otherReturned };
  }), [items, qtys, otherReturnedByKey]);

  const totalAmount = lines.reduce((s, l) => s + l.subtotal, 0);
  const taxTotal = 0;

  if (!purchase) return null;

  const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e5e7eb", textAlign: "right", fontSize: 13 };
  const head: React.CSSProperties = { padding: "10px 12px", background: "#10b981", color: "white", textAlign: "right", fontWeight: 700, fontSize: 13 };

  const handleSave = () => {
    const toSave = lines.filter((l) => l.return_qty > 0).map((l) => ({
      product_id: l.product_id,
      description: l.description,
      quantity: l.return_qty,
      unit_price: Number(l.unit_price || 0),
      total: l.subtotal,
      unit_name: l.unit_name,
      base_quantity: l.base_quantity,
    }));
    if (toSave.length === 0) return;
    if (isEdit && existingReturn) {
      update.mutate({
        id: existingReturn.id,
        purchase_id: purchase.id,
        ref_no: refNo || null,
        return_date: existingReturn.return_date || new Date().toISOString().slice(0, 10),
        total_amount: totalAmount,
        items: toSave,
      }, { onSuccess: () => onOpenChange(false) });
    } else {
      create.mutate({
        purchase_id: purchase.id,
        ref_no: refNo || null,
        return_date: new Date().toISOString().slice(0, 10),
        total_amount: totalAmount,
        items: toSave,
      }, { onSuccess: () => onOpenChange(false) });
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>{isEdit ? "تعديل مرتجع مشتريات" : "مرجع مشتريات"}</DialogTitle></DialogHeader>

        <div className="grid grid-cols-3 gap-4 text-sm pb-3 border-b">
          <div><b>المشتريات الأصل</b></div>
          <div>
            <div><b>المورد:</b> {supplierName || "—"}</div>
            <div><b>الفرع:</b> {purchase.branch_id || "—"}</div>
          </div>
          <div>
            <div><b>الرقم المرجعي:</b> {purchase.ref_no || purchase.purchase_number}</div>
            <div><b>تاريخ:</b> {purchase.purchase_date || purchase.issue_date}</div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">الرقم المرجعي:</label>
          <input value={refNo} onChange={(e) => setRefNo(e.target.value)}
            className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background" />
        </div>

        <table className="w-full mt-3" style={{ borderCollapse: "collapse", border: "1px solid #d1d5db" }}>
          <thead>
            <tr>
              <th style={head}>#</th>
              <th style={head}>اسم الصنف أو الخدمة</th>
              <th style={head}>سعر الوحدة</th>
              <th style={head}>كمية المشتريات</th>
              <th style={head}>كمية المرتجع</th>
              <th style={head}>الإجمالي الفرعي المرجع</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((it: any, i: number) => (
              <tr key={it.id}>
                <td style={cell}>{i + 1}</td>
                <td style={cell}>{it.description}</td>
                <td style={cell}>{Number(it.unit_price).toFixed(2)} ج.م</td>
                <td style={cell}>{Number(it.quantity).toFixed(2)} {it.unit_name || ""}</td>
                <td style={cell}>
                  <input type="number" min={0} max={it.maxAllowed} step="0.01"
                    value={qtys[it.id] ?? ""}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(it.maxAllowed, Number(e.target.value) || 0));
                      setQtys((s) => ({ ...s, [it.id]: v }));
                    }}
                    className="w-24 border border-input rounded px-2 py-1 text-sm bg-background" />
                  <div className="text-[11px] text-gray-500 mt-1">
                    المتاح: {it.maxAllowed}
                    {it.otherReturned > 0 ? ` (مرتجع سابقًا: ${it.otherReturned})` : ""}
                  </div>
                </td>
                <td style={cell}>{(Number(qtys[it.id] || 0) * Number(it.unit_price || 0)).toFixed(2)} ج.م</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="text-sm mt-2 space-y-1">
          <div><b>إجمالي ضريبة المرجع:</b> {taxTotal.toFixed(2)} ج.م</div>
          <div><b>إجمالي العائد:</b> {totalAmount.toFixed(2)} ج.م</div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
          <Button style={{ backgroundColor: "#6366f1", color: "#ffffff" }} disabled={create.isPending || update.isPending || totalAmount <= 0} onClick={handleSave}>
            {isEdit ? "حفظ التعديلات" : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
