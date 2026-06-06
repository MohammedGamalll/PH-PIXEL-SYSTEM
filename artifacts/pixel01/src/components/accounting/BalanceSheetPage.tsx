import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { ReportToolbar } from "./ReportToolbar";
import { PrintStyles, PrintHeader } from "./PrintStyles";
import { useBalanceSheet, type BalanceAccount } from "@/hooks/use-reports";
import { useI18n } from "@/lib/i18n";

const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "8px 10px", borderBottom: "1px solid #e5e7eb", fontSize: 12 };
const headerStyle: React.CSSProperties = { background: "#f3f4f6", padding: "8px 10px", fontWeight: 700, fontSize: 13, borderBottom: "1px solid #d1d5db", textAlign: "center" };

function Section({ title, items, total, totalLabel, emptyLabel }: { title: string; items: { label: string; value: number; muted?: boolean }[]; total: number; totalLabel: string; emptyLabel: string }) {
  const { t } = useI18n();
  const fmt = (n: number) => t("accounting.currency", { n: (Number(n) || 0).toFixed(2) });
  return (
    <div style={{ border: "1px solid #d1d5db", borderRadius: 4 }}>
      <div style={headerStyle}>{title}</div>
      {items.length === 0 ? (
        <div style={{ ...rowStyle, color: "#9ca3af", justifyContent: "center" }}>{emptyLabel}</div>
      ) : items.map((it, i) => (
        <div key={i} style={{ ...rowStyle, color: it.muted ? "#6b7280" : "#374151" }}>
          <span>{it.label}:</span>
          <span style={{ fontWeight: 500 }}>{fmt(it.value)}</span>
        </div>
      ))}
      <div style={{ ...rowStyle, background: "#f9fafb", fontWeight: 700, fontSize: 13 }}>
        <span>{totalLabel}:</span>
        <span>{fmt(total)}</span>
      </div>
    </div>
  );
}

export function BalanceSheetPage() {
  const { t, dir, lang } = useI18n();
  const { data, isLoading } = useBalanceSheet();
  const balanced = data ? Math.abs(data.totalAssets - data.totalLiabEquity) < 0.01 : true;
  const fmt = (n: number) => t("accounting.currency", { n: (Number(n) || 0).toFixed(2) });

  const assetItems = (data?.assets ?? []).map((a: BalanceAccount) => ({ label: a.name, value: a.balance }));
  const liabItems = (data?.liabilities ?? []).map((a: BalanceAccount) => ({ label: a.name, value: a.balance }));
  const equityItems = [
    ...(data?.equity ?? []).map((a: BalanceAccount) => ({ label: a.name, value: a.balance })),
    ...(data ? [{ label: t("accounting.bs.net_profit"), value: data.netProfit }] : []),
  ];
  const totalLiabEquityCombined = (data?.totalLiabEquity ?? 0);

  return (
    <div className="space-y-3" dir={dir}>
      <PrintStyles />
      <PageHeader title={t("accounting.bs.title")} subtitle={t("accounting.bs.subtitle")} />

      <DataCard className="border-gray-300 print-area">
        <PrintHeader title={t("accounting.bs.title")} subtitle={new Date().toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")} />
        <ReportToolbar />

        {isLoading ? (
          <div className="text-center text-sm text-gray-500 py-8">{t("accounting.loading")}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Section title={t("accounting.bs.assets")} items={assetItems} total={data?.totalAssets ?? 0} totalLabel={t("accounting.bs.total_assets")} emptyLabel={t("accounting.no_data")} />
              <div className="space-y-3">
                <Section title={t("accounting.bs.liabilities")} items={liabItems} total={liabItems.reduce((s, i) => s + i.value, 0)} totalLabel={t("accounting.bs.total_liab")} emptyLabel={t("accounting.no_data")} />
                <Section title={t("accounting.bs.equity")} items={equityItems} total={equityItems.reduce((s, i) => s + i.value, 0)} totalLabel={t("accounting.bs.total_equity")} emptyLabel={t("accounting.no_data")} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div style={{ background: balanced ? "#dcfce7" : "#fee2e2", border: "1px solid " + (balanced ? "#86efac" : "#fca5a5"), borderRadius: 4, padding: "10px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#374151" }}>{t("accounting.bs.total_assets")}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: balanced ? "#166534" : "#991b1b" }}>{fmt(data?.totalAssets ?? 0)}</div>
              </div>
              <div style={{ background: balanced ? "#dcfce7" : "#fee2e2", border: "1px solid " + (balanced ? "#86efac" : "#fca5a5"), borderRadius: 4, padding: "10px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#374151" }}>{t("accounting.bs.total_le")}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: balanced ? "#166534" : "#991b1b" }}>{fmt(totalLiabEquityCombined)}</div>
              </div>
            </div>

            {data && (
              <div className="mt-3 text-xs text-center" style={{ color: "#6b7280" }}>
                {t("accounting.bs.inventory", { amount: fmt(data.inventoryValue) })}
              </div>
            )}
          </>
        )}
      </DataCard>
    </div>
  );
}
