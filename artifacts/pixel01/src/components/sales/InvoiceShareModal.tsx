import { useMemo } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: any | null;
};

export function InvoiceShareModal({ open, onOpenChange, invoice }: Props) {
  const { t, dir } = useI18n();
  const url = useMemo(() => {
    if (!invoice?.public_share_token) return "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/public/invoice/${invoice.public_share_token}`;
  }, [invoice]);

  if (!invoice) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("sales.toast.copied"));
    } catch {
      toast.error(t("sales.toast.copy_failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-md">
        <DialogHeader><DialogTitle>{t("sales.share.title").replace("{n}", String(invoice.invoice_number))}</DialogTitle></DialogHeader>
        <p className="text-sm text-gray-600">{t("sales.share.desc")}</p>
        <div className="flex gap-2">
          <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <Button onClick={copy} variant="outline"><Copy className="h-4 w-4" /></Button>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t("sales.actions.close")}</Button>
          <a href={url} target="_blank" rel="noreferrer">
            <Button><ExternalLink className="h-4 w-4 ms-1" /> {t("sales.actions.open")}</Button>
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
