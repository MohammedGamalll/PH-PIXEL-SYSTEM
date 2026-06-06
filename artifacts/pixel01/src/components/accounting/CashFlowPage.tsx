import { useMemo, useState } from "react";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { inputStyle } from "@/components/sales/cashier/win7";
import { ReportToolbar } from "./ReportToolbar";
import { PrintStyles, PrintHeader } from "./PrintStyles";
import { useCashFlow } from "@/hooks/use-reports";
import { useAccounts } from "@/hooks/use-accounts";
import { useI18n } from "@/lib/i18n";
import { DateInput } from "@/components/shared/DateInput";

export function CashFlowPage() {
  const { t, dir } = useI18n();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [accountId, setAccountId] = useState("");
  const [perPage, setPerPage] = useState<string>("25");
  const { data: accounts = [] } = useAccounts();
  const { data, isLoading } = useCashFlow(from || undefined, to || undefined, accountId || undefined);
  const cashAccounts = accounts.filter((a) => /cash|bank|نقد|بنك|صندوق|خزينة/i.test(`${a.sub_account_type || ""} ${a.name}`));
  const fmt = (n: number) => t("accounting.currency", { n: (Number(n) || 0).toFixed(2) });
  const align = dir === "rtl" ? "right" : "left";
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "8px 10px", fontWeight: 600, textAlign: align as any, fontSize: 12, borderBottom: "1px solid #d1d5db" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #e5e7eb", padding: "6px 10px", color: "#374151", fontSize: 12 };

  const allRows = data?.rows ?? [];
  const visibleRows = useMemo(() => {
    if (perPage === "all") return allRows;
    const n = Number(perPage);
    return allRows.slice(0, n);
  }, [allRows, perPage]);

  return (
    <div className="space-y-3" dir={dir}>
      <PrintStyles />
      <PageHeader title={t("accounting.cf.title")} subtitle={t("accounting.cf.subtitle")} />

      <DataCard className="border-gray-300 print-area">
        <PrintHeader title={t("accounting.cf.title")} subtitle={from || to ? t("accounting.cf.range", { from: from || "—", to: to || "—" }) : ""} />
        <ReportToolbar>
          <label className="text-xs text-gray-600 flex flex-col gap-1">
            {t("accounting.toolbar.from")}
            <DateInput value={from} onChange={setFrom} style={inputStyle} />
          </label>
          <label className="text-xs text-gray-600 flex flex-col gap-1">
            {t("accounting.toolbar.to")}
            <DateInput value={to} onChange={setTo} style={inputStyle} />
          </label>
          <label className="text-xs text-gray-600 flex flex-col gap-1">
            {t("accounting.cf.account")}
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={inputStyle}>
              <option value="">{t("accounting.cf.all_accounts")}</option>
              {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600 flex flex-col gap-1">
            عرض
            <select value={perPage} onChange={(e) => setPerPage(e.target.value)} style={inputStyle}>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
              <option value="all">الكل</option>
            </select>
          </label>
        </ReportToolbar>

        <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #d1d5db" }}>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headStyle}>{t("accounting.cf.col.date")}</th>
                <th style={headStyle}>{t("accounting.cf.col.account")}</th>
                <th style={headStyle}>{t("accounting.cf.col.desc")}</th>
                <th style={headStyle}>{t("accounting.cf.col.method")}</th>
                <th style={headStyle}>{t("accounting.cf.col.ref")}</th>
                <th style={headStyle}>{t("accounting.cf.col.debit")}</th>
                <th style={headStyle}>{t("accounting.cf.col.credit")}</th>
                <th style={headStyle}>{t("accounting.cf.col.balance")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} style={{ ...cellStyle, textAlign: "center" }}>{t("accounting.loading")}</td></tr>
              ) : visibleRows.length === 0 ? (
                <tr><td colSpan={8} style={{ ...cellStyle, textAlign: "center", color: "#9ca3af" }}>{t("accounting.no_movements")}</td></tr>
              ) : visibleRows.map((r) => (
                <tr key={r.line_id}>
                  <td style={cellStyle}>{r.entry_date}</td>
                  <td style={cellStyle}>{r.account_name}</td>
                  <td style={cellStyle}>{r.description || "—"}</td>
                  <td style={cellStyle}>{r.payment_method || t("accounting.payment.cash")}</td>
                  <td style={cellStyle}>{r.ref_no || "—"}</td>
                  <td style={{ ...cellStyle, color: "#166534" }}>{r.debit ? fmt(r.debit) : "—"}</td>
                  <td style={{ ...cellStyle, color: "#991b1b" }}>{r.credit ? fmt(r.credit) : "—"}</td>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>{fmt(r.balance)}</td>
                </tr>
              ))}
              {data && data.rows.length > 0 && (
                <tr>
                  <td colSpan={5} style={{ ...cellStyle, background: "#f3f4f6", fontWeight: 700 }}>{t("accounting.cf.total")}</td>
                  <td style={{ ...cellStyle, background: "#f3f4f6", fontWeight: 700, color: "#166534" }}>{fmt(data.totalDebit)}</td>
                  <td style={{ ...cellStyle, background: "#f3f4f6", fontWeight: 700, color: "#991b1b" }}>{fmt(data.totalCredit)}</td>
                  <td style={{ ...cellStyle, background: "#f3f4f6", fontWeight: 700 }}>{fmt(data.closing)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          عرض {visibleRows.length} من {allRows.length}
        </div>
      </DataCard>
    </div>
  );
}
