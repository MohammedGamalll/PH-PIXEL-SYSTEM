import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { ReportToolbar } from "./ReportToolbar";
import { PrintStyles, PrintHeader } from "./PrintStyles";
import { useTrialBalance } from "@/hooks/use-reports";
import { useI18n } from "@/lib/i18n";

export function TrialBalancePage() {
  const { t, dir } = useI18n();
  const { data, isLoading } = useTrialBalance();
  const balanced = Math.abs((data?.totalDebit ?? 0) - (data?.totalCredit ?? 0)) < 0.01;
  const fmt = (n: number) => t("accounting.currency", { n: (Number(n) || 0).toFixed(2) });
  const align = dir === "rtl" ? "right" : "left";
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "8px 10px", fontWeight: 600, textAlign: align as any, fontSize: 12, borderBottom: "1px solid #d1d5db" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #e5e7eb", padding: "6px 10px", color: "#374151", fontSize: 12 };

  return (
    <div className="space-y-3" dir={dir}>
      <PrintStyles />
      <PageHeader title={t("accounting.trial.title")} subtitle={t("accounting.trial.subtitle")} />

      <DataCard className="border-gray-300 print-area">
        <PrintHeader title={t("accounting.trial.title")} />
        <ReportToolbar />

        <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #d1d5db" }}>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headStyle}>{t("accounting.trial.col.account")}</th>
                <th style={{ ...headStyle, textAlign: "center" }}>{t("accounting.trial.col.debit")}</th>
                <th style={{ ...headStyle, textAlign: "center" }}>{t("accounting.trial.col.credit")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={3} style={{ ...cellStyle, textAlign: "center" }}>{t("accounting.loading")}</td></tr>
              ) : (data?.rows.length ?? 0) === 0 ? (
                <tr><td colSpan={3} style={{ ...cellStyle, textAlign: "center", color: "#9ca3af" }}>{t("accounting.no_data")}</td></tr>
              ) : data!.rows.map((r) => (
                <tr key={r.account_id}>
                  <td style={cellStyle}>{r.account_name}</td>
                  <td style={{ ...cellStyle, textAlign: "center", color: r.debit ? "#166534" : "#9ca3af" }}>{r.debit ? fmt(r.debit) : "—"}</td>
                  <td style={{ ...cellStyle, textAlign: "center", color: r.credit ? "#991b1b" : "#9ca3af" }}>{r.credit ? fmt(r.credit) : "—"}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...cellStyle, background: "#f3f4f6", fontWeight: 700 }}>{t("accounting.trial.total")}</td>
                <td style={{ ...cellStyle, background: "#f3f4f6", fontWeight: 700, textAlign: "center", color: balanced ? "#166534" : "#991b1b" }}>{fmt(data?.totalDebit ?? 0)}</td>
                <td style={{ ...cellStyle, background: "#f3f4f6", fontWeight: 700, textAlign: "center", color: balanced ? "#166534" : "#991b1b" }}>{fmt(data?.totalCredit ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {!balanced && data && (
          <div className="mt-3 p-2 text-xs text-center" style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", borderRadius: 4 }}>
            {t("accounting.trial.imbalance", { amount: fmt(Math.abs(data.totalDebit - data.totalCredit)) })}
          </div>
        )}
      </DataCard>
    </div>
  );
}
