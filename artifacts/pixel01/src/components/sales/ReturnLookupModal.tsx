import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFindInvoiceByNumber } from "@/hooks/use-invoices";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onFound: (invoice: any) => void;
};

export function ReturnLookupModal({ open, onOpenChange, onFound }: Props) {
  const { t, dir } = useI18n();
  const [num, setNum] = useState("");
  const find = useFindInvoiceByNumber();

  const search = async () => {
    if (!num.trim()) return;
    try {
      const inv = await find.mutateAsync(num.trim());
      if (!inv || !inv.id) {
        toast.error(t("sales.toast.invoice_not_found"));
        return;
      }
      onFound(inv);
      onOpenChange(false);
      setNum("");
    } catch (e: any) {
      toast.error(e.message || t("sales.toast.search_error"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-sm">
        <DialogHeader><DialogTitle>{t("sales.return.lookup_title")}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <label className="text-sm">{t("sales.return.invoice_no")}</label>
          <Input value={num} onChange={(e) => setNum(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") search(); }} placeholder={t("sales.return.placeholder")} autoFocus />
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t("sales.actions.cancel")}</Button>
          <Button onClick={search} disabled={find.isPending}>{t("sales.actions.search")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
