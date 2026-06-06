import { useProductBatches } from "@/hooks/use-product-batches";
import { formatBaseQuantity } from "@/lib/units";

const EXPIRY_WARN_DAYS = 30;

export function BatchChips({ productId, product }: { productId: string; product: any }) {
  const { data: batches = [], isLoading } = useProductBatches(productId, {
    includeEmpty: false,
    includePast: false,
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!isLoading && batches.length === 0) return null;

  return (
    <div className="rounded-md overflow-hidden" style={{ border: "1px solid #e5e7eb", background: "#ffffff" }}>
      <div
        className="px-3 py-2 text-sm font-semibold"
        style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", color: "#111827" }}
      >
        الدُفعات المتاحة
      </div>
      <div className="p-3">
        {isLoading ? (
          <div className="text-sm" style={{ color: "#6b7280" }}>جاري التحميل...</div>
        ) : batches.length === 0 ? (
          <div className="text-sm" style={{ color: "#6b7280" }}>لا توجد دُفعات متاحة.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {batches.map((b) => {
              const noExpiry = !b.expiry_date;
              const d = noExpiry ? null : new Date(b.expiry_date);
              const diffDays = d ? Math.round((d.getTime() - today.getTime()) / 86400000) : 9999;
              const warn = !noExpiry && diffDays <= EXPIRY_WARN_DAYS;
              const bg = noExpiry ? "#f3f4f6" : warn ? "#fef3c7" : "#ecfdf5";
              const border = noExpiry ? "#9ca3af" : warn ? "#f59e0b" : "#10b981";
              const fg = noExpiry ? "#374151" : warn ? "#92400e" : "#065f46";
              return (
                <div
                  key={b.expiry_date || "__no_expiry__"}
                  className="rounded-md px-3 py-2 flex flex-col gap-0.5 min-w-[140px]"
                  style={{ background: bg, border: `1px solid ${border}`, color: fg }}
                >
                  <div className="text-[11px] opacity-80">تاريخ الصلاحية</div>
                  <div className="text-sm font-semibold">
                    {noExpiry ? "بدون تاريخ" : b.expiry_date}
                    {warn && <span className="ms-1">⚠️</span>}
                  </div>
                  <div className="text-[11px] opacity-80 mt-1">المتبقي</div>
                  <div className="text-sm font-bold">
                    {formatBaseQuantity(Math.max(0, b.remaining), product)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
