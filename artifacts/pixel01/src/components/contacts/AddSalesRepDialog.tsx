import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useCreateSalesRep } from "@/hooks/use-sales-reps";
import { useI18n } from "@/lib/i18n";

const BLUE = "#3b82f6";
const DARK = "#111827";
const RED = "#ef4444";
const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db", backgroundColor: "#ffffff",
  borderRadius: 6, height: 38, padding: "0 10px", width: "100%", fontSize: 14, outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 13, color: "#374151", marginBottom: 4, display: "block" };

export function AddSalesRepDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [prefix, setPrefix] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [commission, setCommission] = useState("");
  const create = useCreateSalesRep();
  const { t, dir } = useI18n();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!first.trim()) { toast.error(t("users.rep.toast_required")); return; }
    await create.mutateAsync({
      prefix: prefix || null,
      first_name: first.trim(),
      last_name: last.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      commission_percent: commission ? Number(commission) : 0,
    });
    setPrefix(""); setFirst(""); setLast(""); setEmail(""); setPhone(""); setAddress(""); setCommission("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-xl" style={{ backgroundColor: "#ffffff" }}>
        <DialogHeader><DialogTitle className="text-start" style={{ color: DARK }}>{t("users.rep.title")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>{t("users.rep.prefix")}</label>
              <select style={inputStyle} value={prefix} onChange={(e) => setPrefix(e.target.value)}>
                <option value="">{t("users.cg.please_select")}</option>
                <option value="السيد">{t("users.rep.mr")}</option>
                <option value="السيدة">{t("users.rep.mrs")}</option>
                <option value="الأستاذ">{t("users.rep.prof")}</option>
                <option value="الدكتور">{t("users.rep.dr")}</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t("users.rep.first")}<span style={{ color: RED }}>*</span></label>
              <input style={inputStyle} value={first} onChange={(e) => setFirst(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>{t("users.rep.last")}</label>
              <input style={inputStyle} value={last} onChange={(e) => setLast(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>{t("users.rep.email")}</label>
              <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>{t("users.rep.phone")}</label>
              <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>{t("users.rep.commission")}</label>
              <input type="number" step="0.01" style={inputStyle} value={commission} onChange={(e) => setCommission(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label style={labelStyle}>{t("users.rep.address")}</label>
              <textarea style={{ ...inputStyle, height: 70, padding: 8 }} value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
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
