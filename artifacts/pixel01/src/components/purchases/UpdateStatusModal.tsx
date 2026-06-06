import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpdatePurchaseStatus } from "@/hooks/use-purchases";

export function UpdateStatusModal({
  open, onOpenChange, purchase,
}: { open: boolean; onOpenChange: (v: boolean) => void; purchase: any | null }) {
  const [status, setStatus] = useState("استلم");
  const mut = useUpdatePurchaseStatus();

  useEffect(() => { if (purchase) setStatus(purchase.status || "استلم"); }, [purchase]);

  if (!purchase) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>Update Status</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-semibold">حالة الشراء: *</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="استلم">استلم</option>
            <option value="قيد الانتظار">قيد الانتظار</option>
            <option value="تم الطلب">تم الطلب</option>
          </select>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
          <Button
            style={{ backgroundColor: "#6366f1", color: "#ffffff" }}
            disabled={mut.isPending}
            onClick={() => {
              mut.mutate({ id: purchase.id, status }, { onSuccess: () => onOpenChange(false) });
            }}
          >
            تحديث
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
