import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSalesReps } from "@/hooks/use-sales-reps";
import { useUpdateInvoiceShipping } from "@/hooks/use-invoices";
import { useI18n } from "@/lib/i18n";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: any | null;
};

export function EditShippingModal({ open, onOpenChange, invoice }: Props) {
  const { t, dir } = useI18n();
  const { data: reps = [] } = useSalesReps();
  const update = useUpdateInvoiceShipping();
  const [values, setValues] = useState<any>({});

  useEffect(() => {
    if (invoice) {
      setValues({
        shipping_details: invoice.shipping_details || "",
        shipping_address: invoice.shipping_address || "",
        delivery_person: invoice.delivery_person || "",
        delivered_to: invoice.delivered_to || "",
        shipping_status: invoice.shipping_status || "pending",
        shipping_note: invoice.shipping_note || "",
      });
    }
  }, [invoice]);

  if (!invoice) return null;
  const set = (k: string, v: any) => setValues((s: any) => ({ ...s, [k]: v }));

  const onSubmit = async () => {
    await update.mutateAsync({ id: invoice.id, values });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir={dir}>
        <DialogHeader>
          <DialogTitle>{t("sales.shipping.edit_title").replace("{n}", String(invoice.invoice_number))}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>{t("sales.form.shipping_details")}</Label>
            <Textarea value={values.shipping_details || ""} onChange={(e) => set("shipping_details", e.target.value)} rows={3} />
          </div>
          <div>
            <Label>{t("sales.form.shipping_address")}</Label>
            <Textarea value={values.shipping_address || ""} onChange={(e) => set("shipping_address", e.target.value)} rows={3} />
          </div>
          <div>
            <Label>{t("sales.form.shipping_status")}</Label>
            <Select value={values.shipping_status} onValueChange={(v) => set("shipping_status", v)}>
              <SelectTrigger><SelectValue placeholder={t("sales.form.please_select")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">{t("sales.ship.pending")}</SelectItem>
                <SelectItem value="shipped">{t("sales.ship.shipped")}</SelectItem>
                <SelectItem value="delivered">{t("sales.ship.delivered")}</SelectItem>
                <SelectItem value="returned">{t("sales.ship.returned")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("sales.form.delivered_to")}</Label>
            <Input value={values.delivered_to || ""} onChange={(e) => set("delivered_to", e.target.value)} placeholder={t("sales.form.delivered_to")} />
          </div>
          <div>
            <Label>{t("sales.form.delivery_person")}</Label>
            <Select value={values.delivery_person} onValueChange={(v) => set("delivery_person", v)}>
              <SelectTrigger><SelectValue placeholder={t("sales.form.please_select")} /></SelectTrigger>
              <SelectContent>
                {(reps as any[]).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{[r.prefix, r.first_name, r.last_name].filter(Boolean).join(" ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>{t("sales.shipping.note")}</Label>
            <Textarea value={values.shipping_note || ""} onChange={(e) => set("shipping_note", e.target.value)} rows={3} />
          </div>
          <div className="col-span-2">
            <Label>{t("sales.shipping.docs")}</Label>
            <div className="border-2 border-dashed border-gray-300 rounded p-10 text-center text-gray-500">
              {t("sales.shipping.drop")}
            </div>
            <div className="text-xs text-gray-500 mt-2">{t("sales.shipping.no_attach")}</div>
          </div>
        </div>

        <DialogFooter style={{ display: "flex", flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", marginTop: 16, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
          <Button variant="outline" onClick={() => onOpenChange(false)} style={{ marginInlineEnd: 8, marginBottom: 4 }}>{t("sales.actions.cancel")}</Button>
          <Button onClick={onSubmit} disabled={update.isPending} className="bg-blue-600 hover:bg-blue-700" style={{ marginBottom: 4 }}>{t("sales.actions.update")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
