import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInvoiceItems, useCreateSalesReturn, useUpdateSalesReturn, useReturnableQuantities, returnItemKey, type ReturnLineInput } from "@/hooks/use-invoices";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  original: any | null;
  /** If provided, the modal opens in edit mode for this existing sale_return invoice. */
  returnInvoice?: any | null;
  /** Active cashier session id; attached to the return invoice so it shows in session reports. */
  sessionId?: string | null;
};

type Row = {
  item: any;        // original invoice item
  selected: boolean;
  qty: number;      // requested return qty (in original unit_name)
};

export function ReturnFormModal({ open, onOpenChange, original, returnInvoice, sessionId }: Props) {
  const { t, dir } = useI18n();
  const isEdit = !!returnInvoice;
  const { data: origItems = [] } = useInvoiceItems(original?.id);
  const { data: returnItems = [] } = useInvoiceItems(isEdit ? returnInvoice?.id : undefined);
  const { data: returnedMap = {} } = useReturnableQuantities(original?.id, isEdit ? returnInvoice?.id : null);
  const create = useCreateSalesReturn();
  const update = useUpdateSalesReturn();
  const [rows, setRows] = useState<Row[]>([]);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");

  // Compute remaining returnable per row key (aggregated across duplicate items)
  const remainingByKey = useMemo(() => {
    const items = Array.isArray(origItems) ? (origItems as any[]) : [];
    const origTotals: Record<string, number> = {};
    for (const it of items) {
      const k = returnItemKey(it);
      origTotals[k] = (origTotals[k] || 0) + Math.abs(Number(it.quantity || 0));
    }
    const map: Record<string, number> = {};
    for (const k of Object.keys(origTotals)) {
      map[k] = Math.max(0, origTotals[k] - Number((returnedMap as any)[k] || 0));
    }
    return map;
  }, [origItems, returnedMap]);

  // Block opening when nothing is returnable (create mode only)
  useEffect(() => {
    if (!open || isEdit) return;
    const items = Array.isArray(origItems) ? (origItems as any[]) : [];
    if (!items.length) return;
    const totalRemaining = items.reduce((a, it) => a + (remainingByKey[returnItemKey(it)] || 0), 0);
    if (totalRemaining <= 0) {
      toast.error(t("sales.toast.fully_returned"));
      onOpenChange(false);
    }
  }, [open, isEdit, origItems, remainingByKey, onOpenChange]);

  const initKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { initKeyRef.current = null; return; }
    const items = Array.isArray(origItems) ? (origItems as any[]) : [];
    if (!items.length) return;
    if (isEdit && !Array.isArray(returnItems)) return;
    const remKey = Object.entries(remainingByKey).map(([k, v]) => `${k}:${v}`).join(",");
    const key = `${original?.id || ""}|${returnInvoice?.id || ""}|${items.length}|${isEdit ? (returnItems as any[]).length : 0}|${remKey}`;
    if (initKeyRef.current === key) return;
    initKeyRef.current = key;
    if (isEdit) {
      const ret = (returnItems as any[]) || [];
      setRows(items.map((it) => {
        const match = ret.find((r) =>
          (it.product_id && r.product_id === it.product_id && r.description === it.description) ||
          (!it.product_id && r.description === it.description),
        );
        const qty = match ? Math.abs(Number(match.quantity || 0)) : 0;
        return { item: it, selected: qty > 0, qty };
      }));
      setDiscount(Number(returnInvoice?.discount || 0));
      setNotes(returnInvoice?.notes || "");
    } else {
      setRows(items.map((it) => {
        const rem = remainingByKey[returnItemKey(it)] ?? Math.abs(Number(it.quantity || 0));
        return { item: it, selected: rem > 0, qty: rem };
      }));
      setDiscount(0);
      setNotes("");
    }
  }, [open, origItems, returnItems, isEdit, original?.id, returnInvoice?.id, returnInvoice?.discount, returnInvoice?.notes, remainingByKey]);

  const total = useMemo(
    () => rows.filter((r) => r.selected).reduce((a, r) => a + Number(r.item.sold_price_at_time ?? r.item.unit_price ?? 0) * r.qty, 0),
    [rows],
  );
  const final = Math.max(0, total - (Number(discount) || 0));

  const buildLines = (): ReturnLineInput[] => {
    const active = rows.filter((r) => r.selected && r.qty > 0);
    return active.map((r) => {
      const origQty = Math.abs(Number(r.item.quantity || 0)) || 1;
      const origBase = Math.abs(Number(r.item.base_quantity || r.item.quantity || 0)) || origQty;
      const baseRatio = origBase / origQty;
      const refundPrice = Number(r.item.sold_price_at_time ?? r.item.unit_price ?? 0);
      return {
        product_id: r.item.product_id,
        description: r.item.description,
        quantity: r.qty,
        unit_price: refundPrice,
        unit_name: r.item.unit_name,
        base_quantity: r.qty * baseRatio,
        discount_amount: 0,
      };
    });
  };

  const submit = async () => {
    if (!original?.id) return;
    const lines = buildLines();
    if (!lines.length) {
      const { toast } = await import("sonner");
      toast.error(t("sales.toast.select_item"));
      return;
    }
    if (isEdit && returnInvoice) {
      await update.mutateAsync({
        returnId: returnInvoice.id,
        originalId: original.id,
        lines,
        discount: Number(discount) || 0,
        notes: notes || returnInvoice.notes,
        sessionId: sessionId ?? undefined,
      });
    } else {
      await create.mutateAsync({ original, lines, discount: Number(discount) || 0, notes: notes || t("sales.return.default_note").replace("{n}", String(original.invoice_number)), sessionId: sessionId ?? null });
    }
    onOpenChange(false);
  };

  if (!original) return null;
  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("sales.return.edit_title").replace("{r}", String(returnInvoice?.invoice_number)).replace("{n}", String(original.invoice_number))
              : t("sales.return.create_title").replace("{n}", String(original.invoice_number))}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-x-auto" style={{ border: "1px solid #d1d5db", borderRadius: 4 }}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead style={{ backgroundColor: "#f3f4f6" }}>
              <tr>
                {["", t("sales.return.col.item"), t("sales.return.col.unit"), t("sales.return.col.orig_qty"), t("sales.return.col.return_qty"), t("sales.return.col.price"), t("sales.return.col.total")].map((h, idx) => (
                  <th key={idx} className="text-start p-2" style={{ borderBottom: "1px solid #d1d5db" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const origQty = Math.abs(Number(r.item.quantity || 0));
                const k = returnItemKey(r.item);
                const remaining = remainingByKey[k] ?? origQty;
                const alreadyReturned = Math.max(0, origQty - remaining);
                const maxAllowed = remaining;
                const disabled = maxAllowed <= 0;
                const originalPrice = Number(r.item.unit_price || 0);
                const refundPrice = Number(r.item.sold_price_at_time ?? r.item.unit_price ?? 0);
                return (
                  <tr key={r.item.id ?? i}>
                    <td className="p-2" style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <input type="checkbox" checked={r.selected && !disabled} disabled={disabled} onChange={(e) =>
                        setRows((rs) => rs.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x))} />
                    </td>
                    <td
                      className="p-2"
                      style={{
                        borderBottom: "1px solid #e5e7eb",
                        maxWidth: 260,
                        whiteSpace: "normal",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {r.item.description}
                    </td>
                    <td className="p-2" style={{ borderBottom: "1px solid #e5e7eb" }}>{r.item.unit_name || "—"}</td>
                    <td className="p-2" style={{ borderBottom: "1px solid #e5e7eb" }}>{origQty}</td>
                    <td className="p-2" style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <Input type="number" min={0} max={maxAllowed} step="0.01"
                        value={disabled ? 0 : r.qty}
                        disabled={disabled} readOnly={disabled}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(maxAllowed, Number(e.target.value) || 0));
                          setRows((rs) => rs.map((x, j) => j === i ? { ...x, qty: v } : x));
                        }} className="h-8 w-24" />
                      <div className="text-[11px] text-gray-500 mt-1">
                        {t("sales.return.available").replace("{n}", String(maxAllowed))}
                        {alreadyReturned > 0 ? t("sales.return.already").replace("{n}", String(alreadyReturned)) : ""}
                      </div>
                    </td>
                    <td className="p-2" style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontWeight: 700 }}>{refundPrice.toFixed(2)}</span>
                        {Math.abs(originalPrice - refundPrice) > 0.0001 && (
                          <span style={{ fontSize: 11, color: "#6b7280", textDecoration: "line-through" }}>
                            {originalPrice.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2" style={{ borderBottom: "1px solid #e5e7eb" }}>{(refundPrice * r.qty).toFixed(2)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="p-4 text-center text-gray-500">{t("sales.return.no_items")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm">{t("sales.return.discount")}</label>
            <Input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
          </div>
          <div>
            <label className="text-sm">{t("sales.return.notes")}</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("sales.return.notes_placeholder").replace("{n}", String(original.invoice_number))} />
          </div>
        </div>
        <div className="text-sm flex justify-between font-bold pt-2">
          <span>{t("sales.return.total")}</span>
          <span>{final.toFixed(2)} ج.م</span>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t("sales.actions.cancel")}</Button>
          <Button onClick={submit} disabled={pending}>
            {isEdit ? t("sales.return.save_edits") : t("sales.return.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
