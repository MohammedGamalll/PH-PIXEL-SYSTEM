import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/lib/owner";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onFound: (purchase: any) => void;
};

export function PurchaseReturnLookupModal({ open, onOpenChange, onFound }: Props) {
  const { dir } = useI18n();
  const ownerId = useOwnerId();
  const [num, setNum] = useState("");
  const [loading, setLoading] = useState(false);

  const search = async () => {
    const q = num.trim();
    if (!q || !ownerId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("purchases")
        .select("*")
        .eq("owner_id", ownerId)
        .or(`purchase_number.eq.${q},ref_no.eq.${q}`)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const found = (data ?? [])[0];
      if (!found) {
        toast.error("لم يتم العثور على فاتورة شراء بهذا الرقم");
        return;
      }
      onFound(found);
      onOpenChange(false);
      setNum("");
    } catch (e: any) {
      toast.error(e.message || "تعذر البحث");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-sm">
        <DialogHeader><DialogTitle>بحث عن فاتورة شراء لإرجاعها</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <label className="text-sm">رقم الفاتورة المرجعي</label>
          <Input value={num} onChange={(e) => setNum(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") search(); }}
            placeholder="مثال: P-00001" autoFocus />
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={search} disabled={loading}>بحث</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
