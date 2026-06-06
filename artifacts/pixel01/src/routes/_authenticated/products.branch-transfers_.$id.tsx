import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useBranchTransferDetails } from "@/hooks/use-branch-transfers";
import { useI18n } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format";
import { useSettings } from "@/contexts/SettingsContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/products/branch-transfers_/$id")({
  component: BranchTransferDetailsPage,
});

function BranchTransferDetailsPage() {
  const { id } = useParams({ from: "/_authenticated/products/branch-transfers_/$id" });
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const t = (ar: string, en: string) => (isAr ? ar : en);
  const { settings } = useSettings();
  const fc = (n: number) => formatCurrency(n, settings);
  const { data, isLoading, isFetching } = useBranchTransferDetails(id);

  if (isLoading || (isFetching && !data?.header)) {
    return (
      <div className="p-10 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-2" /> {t("جاري التحميل...", "Loading...")}
      </div>
    );
  }
  if (!data?.header) {
    return (
      <div className="p-6">
        <Link to="/products/branch-transfers" style={{ color: "#1d4ed8", textDecoration: "underline" }}>
          <ArrowLeft className="h-4 w-4 inline mx-1" /> {t("رجوع", "Back")}
        </Link>
        <div className="mt-4 text-center text-muted-foreground">{t("التحويل غير موجود", "Transfer not found")}</div>
      </div>
    );
  }


  const h = data.header as any;
  const items = (data.items as any[]) ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4" dir={isAr ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <Link to="/products/branch-transfers" style={{ color: "#1d4ed8", textDecoration: "underline" }}>
          <ArrowLeft className="h-4 w-4 inline mx-1" /> {t("رجوع", "Back")}
        </Link>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mx-1" /> {t("طباعة", "Print")}
        </Button>
      </div>

      <Card className="p-4">
        <h1 className="text-xl font-bold mb-3">{t("تفاصيل التحويل", "Transfer details")}</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <Field label={t("التاريخ", "Date")} value={h.transfer_date} />
          <Field label={t("الفرع المستقبل", "Destination")} value={h.target_name_snapshot ?? "—"} />
          <Field label={t("بواسطة", "Created by")} value={h.created_by_name_snapshot ?? "—"} />
          <Field label={t("إجمالي الأصناف", "Total items")} value={String(items.length)} />
          <Field label={t("تكلفة المخزون", "Stock cost")} value={fc(Number(h.total_cost ?? 0))} />
          <Field label={t("قيمة النقدية", "Cash value")} value={fc(Number(h.cash_value ?? 0))} />
          {h.notes ? <Field label={t("ملاحظات", "Notes")} value={h.notes} /> : null}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-start">{t("الصنف", "Product")}</th>
              <th className="p-3 text-start">SKU</th>
              <th className="p-3 text-start">{t("الكمية", "Qty")}</th>
              <th className="p-3 text-start">{t("الوحدة", "Unit")}</th>
              <th className="p-3 text-start">{t("تكلفة الوحدة", "Unit cost")}</th>
              <th className="p-3 text-start">{t("الإجمالي", "Total")}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">
                {t("لا توجد أصناف", "No items")}
              </td></tr>
            ) : items.map((it) => {
              const qty = Number(it.quantity ?? 0);
              const total = Number(it.total ?? 0);
              const perUnit = qty > 0 ? total / qty : Number(it.unit_cost ?? 0);
              return (
                <tr key={it.id} className="border-t">
                  <td className="p-3">{it.product_name}</td>
                  <td className="p-3">{it.sku || "—"}</td>
                  <td className="p-3">{qty}</td>
                  <td className="p-3">{it.unit_name || "—"}</td>
                  <td className="p-3">{fc(perUnit)}</td>
                  <td className="p-3">{fc(total)}</td>
                </tr>
              );
            })}

          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
