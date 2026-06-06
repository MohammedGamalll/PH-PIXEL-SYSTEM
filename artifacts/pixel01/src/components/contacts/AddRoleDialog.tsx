import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useCreateCustomRole } from "@/hooks/use-custom-roles";
import { useI18n } from "@/lib/i18n";

const BLUE = "#3b82f6";
const DARK = "#111827";
const RED = "#ef4444";
const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db", backgroundColor: "#ffffff",
  borderRadius: 6, height: 38, padding: "0 10px", width: "100%", fontSize: 14, outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 13, color: "#374151", marginBottom: 4, display: "block" };

export function AddRoleDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState("");
  const create = useCreateCustomRole();
  const { t, dir } = useI18n();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error(t("users.role.toast_required")); return; }
    await create.mutateAsync({ name: name.trim() });
    setName("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-md" style={{ backgroundColor: "#ffffff" }}>
        <DialogHeader><DialogTitle className="text-start" style={{ color: DARK }}>{t("users.role.title")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label style={labelStyle}>{t("users.role.name")}<span style={{ color: RED }}>*</span></label>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
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
