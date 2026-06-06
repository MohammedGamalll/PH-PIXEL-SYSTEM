import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Printer } from "lucide-react";
import { LabelDesign, type LabelDesignProduct } from "./LabelDesign";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/contexts/SettingsContext";
import { useProductExpiry, formatExpiryShort } from "@/hooks/use-product-batches";

export type LabelProduct = LabelDesignProduct;

export function PrintLabelDialog({
  open, onOpenChange, product,
}: { open: boolean; onOpenChange: (v: boolean) => void; product: LabelProduct | null }) {
  const { t, dir } = useI18n();
  const { settings } = useSettings();
  const [copies, setCopies] = useState(1);
  const { data: expiryIso } = useProductExpiry(product?.id);
  if (!product) return null;
  const storeName = settings.business_name || "";
  const expiry = formatExpiryShort(expiryIso);


  const n = Math.max(1, Math.min(200, Number(copies) || 1));
  const items = Array.from({ length: n });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-md" style={{ backgroundColor: "#ffffff" }}>
        <DialogHeader>
          <DialogTitle className="text-start">{t("products.labels.dialog_title")}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 justify-end">
          <label className="text-sm" style={{ color: "#374151" }}>{t("products.labels.count")}</label>
          <input
            type="number"
            min={1}
            max={200}
            value={copies}
            onChange={(e) => setCopies(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
            className="h-9 w-24 rounded-md px-2 text-sm text-end"
            style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff" }}
          />
        </div>

        <div
          className="print-area print-area--stickers flex flex-wrap gap-2 justify-center py-4"
          style={{ maxHeight: 320, overflowY: "auto", backgroundColor: "#f9fafb", borderRadius: 8, padding: 12 }}
        >
          {items.map((_, i) => (
            <div key={i} style={{ border: "1px dashed #d1d5db", backgroundColor: "#ffffff" }}>
              <LabelDesign product={product} storeName={storeName} expiry={expiry} />
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 px-4 rounded-md text-sm"
            style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151" }}
          >
            {t("products.form.close")}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="h-9 px-4 rounded-md text-white text-sm inline-flex items-center gap-2"
            style={{ backgroundColor: "#3b82f6" }}
          >
            <Printer className="h-4 w-4" /> {t("products.labels.print")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
