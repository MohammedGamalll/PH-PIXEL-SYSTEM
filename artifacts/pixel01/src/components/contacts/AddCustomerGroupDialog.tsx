import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { useCreateCustomerGroup } from "@/hooks/use-customer-groups";
import { usePriceGroups } from "@/hooks/use-product-meta";
import { useI18n } from "@/lib/i18n";

const BLUE = "#3b82f6";
const DARK = "#111827";
const RED = "#ef4444";
const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db", backgroundColor: "#ffffff",
  borderRadius: 6, height: 38, padding: "0 10px", width: "100%", fontSize: 14, outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 13, color: "#374151", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 };

export function AddCustomerGroupDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState("");
  const [calcType, setCalcType] = useState("percentage");
  const [amount, setAmount] = useState("");
  const [priceGroupId, setPriceGroupId] = useState("");
  const create = useCreateCustomerGroup();
  const { data: pgs = [] } = usePriceGroups();
  const { t, dir } = useI18n();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error(t("users.cg.toast_required")); return; }
    await create.mutateAsync({
      name: name.trim(),
      calc_type: calcType,
      amount: amount ? Number(amount) : 0,
      price_group_id: priceGroupId || null,
    });
    setName(""); setAmount(""); setPriceGroupId(""); setCalcType("percentage");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-md" style={{ backgroundColor: "#ffffff" }}>
        <DialogHeader><DialogTitle className="text-start" style={{ color: DARK }}>{t("users.cg.title")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label style={labelStyle}>{t("users.cg.name")}<span style={{ color: RED }}>*</span></label>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>{t("users.cg.calc_type")}</label>
            <select style={inputStyle} value={calcType} onChange={(e) => setCalcType(e.target.value)}>
              <option value="percentage">{t("users.cg.percentage")}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>
              {t("users.cg.percent_label")}
              <Info className="h-3.5 w-3.5" style={{ color: "#6b7280" }} />
            </label>
            <input type="number" step="0.01" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>{t("users.cg.price_group")}</label>
            <select style={inputStyle} value={priceGroupId} onChange={(e) => setPriceGroupId(e.target.value)}>
              <option value="">{t("users.cg.please_select")}</option>
              {(pgs as any[]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <DialogFooter className="flex-row-reverse sm:flex-row-reverse gap-2">
            <button type="submit" disabled={create.isPending} className="h-10 px-5 rounded-md text-white text-sm" style={{ backgroundColor: BLUE }}>{t("users.actions.save")}</button>
            <button type="button" onClick={() => onOpenChange(false)} className="h-10 px-5 rounded-md text-white text-sm" style={{ backgroundColor: DARK }}>{t("users.actions.close")}</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
