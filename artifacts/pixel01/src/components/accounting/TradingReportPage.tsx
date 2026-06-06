import { useState } from "react";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { inputStyle } from "@/components/sales/cashier/win7";
import { ReportToolbar } from "./ReportToolbar";
import { PrintStyles, PrintHeader } from "./PrintStyles";
import { useTradingReport } from "@/hooks/use-reports";
import { useI18n } from "@/lib/i18n";
import { DateInput } from "@/components/shared/DateInput";

const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "8px 10px", borderBottom: "1px solid #e5e7eb", fontSize: 13 };
const sectionTitle: React.CSSProperties = { background: "#f3f4f6", padding: "8px 10px", fontWeight: 700, fontSize: 13, borderBottom: "1px solid #d1d5db", textAlign: "center" };

export function TradingReportPage() {
  const { t, dir } = useI18n();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading } = useTradingReport(from || undefined, to || undefined);
  const fmt = (n: number) => t("accounting.currency", { n: (Number(n) || 0).toFixed(2) });

  return (
    <div className="space-y-3" dir={dir}>
      <PrintStyles />
      <PageHeader title={t("accounting.trading.title")} subtitle={t("accounting.trading.subtitle")} />

      <DataCard className="border-gray-300 print-area">
        <PrintHeader title={t("accounting.trading.title")} subtitle={from || to ? t("accounting.cf.range", { from: from || "—", to: to || "—" }) : ""} />
        <ReportToolbar>
          <label className="text-xs text-gray-600 flex flex-col gap-1">
            {t("accounting.toolbar.from")}
            <DateInput value={from} onChange={setFrom} style={inputStyle} />
          </label>
          <label className="text-xs text-gray-600 flex flex-col gap-1">
            {t("accounting.toolbar.to")}
            <DateInput value={to} onChange={setTo} style={inputStyle} />
          </label>
        </ReportToolbar>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div style={{ border: "1px solid #d1d5db", borderRadius: 4 }}>
            <div style={sectionTitle}>{t("accounting.trading.purchases")}</div>
            <div style={rowStyle}><span>{t("accounting.trading.total_purchases")}</span><span>{fmt(data?.totalPurchases ?? 0)}</span></div>
            <div style={rowStyle}><span>{t("accounting.trading.purchases_tax")}</span><span>{fmt(data?.totalPurchases ?? 0)}</span></div>
            <div style={rowStyle}><span>{t("accounting.trading.purchase_returns")}</span><span style={{ color: "#991b1b" }}>{fmt(data?.purchaseReturns ?? 0)}</span></div>
            <div style={{ ...rowStyle, fontWeight: 700, background: "#f9fafb" }}><span>{t("accounting.trading.net_purchases")}</span><span>{fmt(data?.netPurchases ?? 0)}</span></div>
          </div>
          <div style={{ border: "1px solid #d1d5db", borderRadius: 4 }}>
            <div style={sectionTitle}>{t("accounting.trading.sales")}</div>
            <div style={rowStyle}><span>{t("accounting.trading.total_sales")}</span><span>{fmt(data?.totalSales ?? 0)}</span></div>
            <div style={rowStyle}><span>{t("accounting.trading.sales_tax")}</span><span>{fmt(data?.totalSales ?? 0)}</span></div>
            <div style={rowStyle}><span>{t("accounting.trading.sales_returns")}</span><span style={{ color: "#991b1b" }}>{fmt(data?.salesReturns ?? 0)}</span></div>
            <div style={{ ...rowStyle, fontWeight: 700, background: "#f9fafb" }}><span>{t("accounting.trading.net_sales")}</span><span>{fmt(data?.netSales ?? 0)}</span></div>
          </div>
        </div>

        <div className="mt-4" style={{ border: "1px solid #d1d5db", borderRadius: 4 }}>
          <div style={sectionTitle}>{t("accounting.trading.gross_title")}</div>
          <div style={{ padding: "12px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: (data?.grossMargin ?? 0) >= 0 ? "#166534" : "#991b1b" }}>
              {fmt(data?.grossMargin ?? 0)}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{t("accounting.trading.gross_note")}</div>
          </div>
        </div>

        {isLoading && <div className="text-center text-sm text-gray-500 mt-3">{t("accounting.loading")}</div>}
      </DataCard>
    </div>
  );
}
