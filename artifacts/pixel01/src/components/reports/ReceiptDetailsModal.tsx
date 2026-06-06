import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  receipt: any | null;
};

export function ReceiptDetailsModal({ open, onOpenChange, receipt }: Props) {
  const { t, dir } = useI18n();
  if (!receipt) return null;
  const row: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, color: "#374151" };
  const lbl: React.CSSProperties = { color: "#6b7280", fontWeight: 600 };
  const fields: Array<[string, any]> = [
    [t("reports.col.ref"), receipt.ref],
    [t("reports.col.paid_on"), receipt.paid_on],
    [t("reports.col.paid_amount"), `${Number(receipt.paid_amount || 0).toFixed(2)}`],
    [t("reports.col.customer"), receipt.customer],
    [t("reports.col.group"), receipt.group],
    [t("reports.col.method"), receipt.method],
    [t("reports.col.sale_no"), receipt.sale_no],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir={dir}>
        <DialogHeader>
          <DialogTitle>{t("reports.col.ref")} #{receipt.ref}</DialogTitle>
        </DialogHeader>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8 }}>
          {fields.map(([k, v]) => (
            <div key={k} style={row}>
              <span style={lbl}>{k}</span>
              <span>{v ?? "—"}</span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.close") || "Close"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
