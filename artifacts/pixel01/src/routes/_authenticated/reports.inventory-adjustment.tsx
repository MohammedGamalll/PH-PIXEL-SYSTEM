import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/products/PageHeader";
import { ReportTable, StatCard } from "@/components/reports/ReportTable";
import { StockAdjustmentDetailsModal } from "@/components/reports/StockAdjustmentDetailsModal";
import type { ColumnDef } from "@/components/products/TableToolbar";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/reports/inventory-adjustment")({
  component: AdjustmentReportPage,
});

function AdjustmentReportPage() {
  const { t, dir, lang } = useI18n();
  const { user } = useAuth();
  const locale = lang === "ar" ? "ar-EG" : "en-US";
  const cur = (n: number) => t("reports.currency", { n: n.toFixed(2) });
  const [selected, setSelected] = useState<any | null>(null);

  const cols: ColumnDef[] = [
    { key: "option", label: t("reports.col.option"), visible: true },
    { key: "date", label: t("reports.col.date"), visible: true },
    { key: "ref", label: t("reports.col.ref"), visible: true },
    { key: "type", label: t("reports.col.type"), visible: true },
    { key: "total", label: t("reports.col.total"), visible: true },
    { key: "recovered", label: t("reports.col.recovered"), visible: true },
    { key: "reason", label: t("reports.col.reason"), visible: true },
    { key: "added_by", label: t("reports.col.added_by"), visible: true },
  ];

  const { data: rows = [] } = useQuery({
    queryKey: ["damaged_stock"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("damaged_stock")
        .select("*")
        .order("damage_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const data = useMemo(
    () =>
      (rows as any[]).map((r) => ({
        id: r.id,
        option: "",
        date: r.damage_date ? new Date(r.damage_date).toLocaleDateString(locale) : t("reports.dash"),
        ref: r.ref_number || t("reports.dash"),
        branch: r.branch || t("reports.dash"),
        type: r.damage_type === "abnormal" ? t("reports.adjustment.type_abnormal") : t("reports.adjustment.type_normal"),
        total: Number(r.total || 0),
        recovered: Number(r.recovered_total || 0),
        reason: r.reason || t("reports.dash"),
        added_by: t("reports.dash"),
      })),
    [rows, locale, t],
  );

  const sums = useMemo(() => {
    const normalLabel = t("reports.adjustment.type_normal");
    const abnormalLabel = t("reports.adjustment.type_abnormal");
    const normal = data.filter((d) => d.type === normalLabel).reduce((s, r) => s + r.total, 0);
    const abnormal = data.filter((d) => d.type === abnormalLabel).reduce((s, r) => s + r.total, 0);
    const recovered = data.reduce((s, r) => s + r.recovered, 0);
    const totalLoss = data.reduce((s, r) => s + r.total, 0);
    const net = recovered - totalLoss;
    return { normal, abnormal, net };
  }, [data, t]);

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("reports.adjustment.title")} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg p-4" style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb" }}>
          <div className="text-sm" style={{ color: "#374151" }}>{t("reports.adjustment.normal")}</div>
          <div className="text-lg font-bold" style={{ color: "#10b981" }}>{cur(sums.normal)}</div>
          <div className="text-sm mt-2" style={{ color: "#374151" }}>{t("reports.adjustment.abnormal")}</div>
          <div className="text-lg font-bold" style={{ color: "#ef4444" }}>{cur(sums.abnormal)}</div>
        </div>
        <StatCard label={t("reports.adjustment.net")} value={cur(sums.net)} accent={sums.net >= 0 ? "#10b981" : "#ef4444"} />
      </div>
      <ReportTable
        rows={data}
        initialCols={cols}
        rowKey={(r) => r.id}
        searchFields={(r) => `${r.ref} ${r.reason} ${r.branch}`}
        cellFor={(r, k) => {
          if (k === "option") {
            return (
              <button
                type="button"
                onClick={() => setSelected(r)}
                title="عرض التفاصيل"
                style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer", color: "#1d4ed8" }}
              >
                <Eye className="h-4 w-4" />
              </button>
            );
          }
          const v = (r as any)[k];
          if (typeof v === "number") return v.toFixed(2);
          return v;
        }}
        numericKeys={["total", "recovered"]}
        exportName="inventory-adjustment-report"
        printTitle="inventory-adjustment-report"
      />
      <StockAdjustmentDetailsModal
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
        adjustmentId={selected?.id ?? null}
        row={selected}
      />
    </div>
  );
}
