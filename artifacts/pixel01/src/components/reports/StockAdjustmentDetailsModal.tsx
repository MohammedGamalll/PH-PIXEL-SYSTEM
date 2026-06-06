import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  adjustmentId: string | null;
  row: any | null;
};

export function StockAdjustmentDetailsModal({ open, onOpenChange, adjustmentId, row }: Props) {
  const { t, dir, lang } = useI18n();
  const locale = lang === "ar" ? "ar-EG" : "en-US";

  const { data: items = [] } = useQuery({
    queryKey: ["damaged_stock_items", adjustmentId],
    enabled: !!adjustmentId && open,
    queryFn: async () => {
      const { data, error } = await (supabase.from("damaged_stock_items") as any)
        .select("*")
        .eq("damaged_stock_id", adjustmentId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["damaged_stock_activity", adjustmentId],
    enabled: !!adjustmentId && open,
    queryFn: async () => {
      const { data, error } = await (supabase.from("employee_activity_log") as any)
        .select("*")
        .eq("subject_type", "damaged_stock")
        .eq("subject_id", adjustmentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!row) return null;
  const align: "right" | "left" = dir === "rtl" ? "right" : "left";
  const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e5e7eb", textAlign: align, fontSize: 13 };
  const head: React.CSSProperties = { padding: "10px 12px", background: "#10b981", color: "white", textAlign: align, fontWeight: 700, fontSize: 13 };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" dir={dir}>
        <DialogHeader>
          <DialogTitle>تفاصيل تسوية المخزون — {row.ref || "—"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm" style={{ color: "#374151" }}>
          <div><b>الرقم المرجعي:</b> {row.ref || "—"}</div>
          <div><b>التاريخ:</b> {row.date || "—"}</div>
          <div><b>النوع:</b> {row.type || "—"}</div>
          <div><b>الفرع:</b> {row.branch || "—"}</div>
          <div><b>الإجمالي:</b> {Number(row.total || 0).toFixed(2)}</div>
          <div><b>المسترد:</b> {Number(row.recovered || 0).toFixed(2)}</div>
          <div className="col-span-2 md:col-span-3"><b>السبب:</b> {row.reason || "—"}</div>
        </div>

        <div className="mt-4">
          <div className="font-semibold mb-2" style={{ color: "#111827" }}>الأصناف</div>
          <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #e5e7eb" }}>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={head}>الصنف</th>
                <th style={head}>الكمية</th>
                <th style={head}>الوحدة</th>
                <th style={head}>سعر الوحدة</th>
                <th style={head}>الإجمالي</th>
                <th style={head}>تاريخ الانتهاء</th>
              </tr></thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td style={{ ...cell, textAlign: "center", color: "#9ca3af" }} colSpan={6}>—</td></tr>
                ) : (items as any[]).map((it) => (
                  <tr key={it.id}>
                    <td style={cell}>{it.product_name_snapshot || it.description || "—"}</td>
                    <td style={cell}>{Number(it.quantity || 0).toFixed(2)}</td>
                    <td style={cell}>{it.unit_name || "—"}</td>
                    <td style={cell}>{Number(it.unit_price || 0).toFixed(2)}</td>
                    <td style={cell}>{Number(it.total || 0).toFixed(2)}</td>
                    <td style={cell}>{it.expiry_date || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4">
          <div className="font-semibold mb-2" style={{ color: "#111827" }}>سجل الأنشطة</div>
          <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #e5e7eb" }}>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={head}>التاريخ</th>
                <th style={head}>المستخدم</th>
                <th style={head}>الإجراء</th>
                <th style={head}>تفاصيل</th>
              </tr></thead>
              <tbody>
                {activity.length === 0 ? (
                  <tr><td style={{ ...cell, textAlign: "center", color: "#9ca3af" }} colSpan={4}>—</td></tr>
                ) : (activity as any[]).map((a) => (
                  <tr key={a.id}>
                    <td style={cell}>{a.created_at ? new Date(a.created_at).toLocaleString(locale) : "—"}</td>
                    <td style={cell}>{a.actor_name || "—"}</td>
                    <td style={cell}>{a.action_type || "—"}</td>
                    <td style={cell}>{a.subject_label || (a.details ? JSON.stringify(a.details) : "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.close") || "إغلاق"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
