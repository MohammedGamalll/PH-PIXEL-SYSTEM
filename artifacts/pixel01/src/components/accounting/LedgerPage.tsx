import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { inputStyle } from "@/components/sales/cashier/win7";
import { useAccounts, isDebitNature } from "@/hooks/use-accounts";
import { useAccountLedger } from "@/hooks/use-ledger";
import { useI18n } from "@/lib/i18n";
import { DateInput } from "@/components/shared/DateInput";

export function LedgerPage({ accountId }: { accountId: string }) {
  const { t, dir } = useI18n();
  const { data: accounts = [] } = useAccounts();
  const account = accounts.find((a) => a.id === accountId);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data: rows = [], isLoading } = useAccountLedger(accountId, from || undefined, to || undefined);

  const debitNature = account ? isDebitNature(account.account_type) : true;
  const opening = Number(account?.opening_balance) || 0;
  const fmt = (n: number) => t("accounting.currency", { n: (Number(n) || 0).toFixed(2) });
  const align = dir === "rtl" ? "right" : "left";
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "8px 10px", fontWeight: 600, textAlign: align as any, fontSize: 12, borderBottom: "1px solid #d1d5db" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #e5e7eb", padding: "6px 10px", color: "#374151", fontSize: 12 };
  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;

  // Sorting (chronological balance is preserved per-row; sorting only changes display order)
  const [sortKey, setSortKey] = useState<"time" | "ref" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (key: "time" | "ref") => {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else { setSortKey(null); setSortDir("asc"); }
  };

  const fmtTime = (r: { created_at: string | null; entry_date: string }) => {
    if (!r.created_at) return "—";
    const d = new Date(r.created_at);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString(dir === "rtl" ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const enriched = useMemo(() => {
    let running = opening;
    const withBalance = rows.map((r) => {
      running += debitNature ? r.debit - r.credit : r.credit - r.debit;
      return { ...r, balance: running };
    });
    if (!sortKey) return withBalance;
    const sorted = [...withBalance].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "time") {
        cmp = String(a.created_at ?? a.entry_date).localeCompare(String(b.created_at ?? b.entry_date));
      } else {
        cmp = String(a.ref_no ?? "").localeCompare(String(b.ref_no ?? ""), undefined, { numeric: true });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, opening, debitNature, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: "time" | "ref" }) => {
    if (sortKey !== col) return <ArrowUpDown className="inline h-3 w-3 opacity-50" />;
    return sortDir === "asc" ? <ArrowUp className="inline h-3 w-3" /> : <ArrowDown className="inline h-3 w-3" />;
  };

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const closing = opening + (debitNature ? totalDebit - totalCredit : totalCredit - totalDebit);

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader
        title={t("accounting.ledger.title")}
        subtitle={account ? t("accounting.ledger.subtitle", { name: account.name, number: account.account_number }) : "—"}
        actions={
          <Link
            to="/accounting/accounts"
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 border rounded"
            style={{ borderColor: "#d1d5db", color: "#374151" }}
          >
            <BackIcon className="h-4 w-4" /> {t("accounting.ledger.back")}
          </Link>
        }
      />

      <DataCard className="border-gray-300">
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <label className="text-xs text-gray-600 flex flex-col gap-1">
            {t("accounting.toolbar.from")}
            <DateInput value={from} onChange={setFrom} style={inputStyle} />
          </label>
          <label className="text-xs text-gray-600 flex flex-col gap-1">
            {t("accounting.toolbar.to")}
            <DateInput value={to} onChange={setTo} style={inputStyle} />
          </label>

          <div className="ms-auto flex gap-2 flex-wrap">
            <Kpi label={t("accounting.ledger.kpi.opening")} value={fmt(opening)} bg="#eef2ff" fg="#3730a3" />
            <Kpi label={t("accounting.ledger.kpi.total_debit")} value={fmt(totalDebit)} bg="#dcfce7" fg="#166534" />
            <Kpi label={t("accounting.ledger.kpi.total_credit")} value={fmt(totalCredit)} bg="#fee2e2" fg="#991b1b" />
            <Kpi label={t("accounting.ledger.kpi.closing")} value={fmt(closing)} bg="#fef3c7" fg="#92400e" />
          </div>
        </div>

        <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #d1d5db" }}>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headStyle}>{t("accounting.ledger.col.date")}</th>
                <th
                  style={{ ...headStyle, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                  onClick={() => toggleSort("time")}
                  title="ترتيب حسب الوقت"
                >
                  الوقت <SortIcon col="time" />
                </th>
                <th
                  style={{ ...headStyle, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                  onClick={() => toggleSort("ref")}
                  title="ترتيب حسب المرجع"
                >
                  {t("accounting.ledger.col.ref")} <SortIcon col="ref" />
                </th>
                <th style={headStyle}>{t("accounting.ledger.col.desc")}</th>
                <th style={headStyle}>{t("accounting.ledger.col.method")}</th>
                <th style={headStyle}>{t("accounting.ledger.col.type")}</th>
                <th style={headStyle}>{t("accounting.ledger.col.debit")}</th>
                <th style={headStyle}>{t("accounting.ledger.col.credit")}</th>
                <th style={headStyle}>{t("accounting.ledger.col.balance")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...cellStyle, background: "#f9fafb", fontWeight: 600 }} colSpan={8}>{t("accounting.ledger.opening_row")}</td>
                <td style={{ ...cellStyle, background: "#f9fafb", fontWeight: 600 }}>{fmt(opening)}</td>
              </tr>
              {isLoading ? (
                <tr><td colSpan={9} style={{ ...cellStyle, textAlign: "center" }}>{t("accounting.loading")}</td></tr>
              ) : enriched.length === 0 ? (
                <tr><td colSpan={9} style={{ ...cellStyle, textAlign: "center", color: "#9ca3af" }}>{t("accounting.no_movements")}</td></tr>
              ) : enriched.map((r) => (
                <tr key={r.line_id}>
                  <td style={cellStyle}>{r.entry_date}</td>
                  <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>{fmtTime(r)}</td>
                  <td style={cellStyle}>{r.ref_no || "—"}</td>
                  <td style={cellStyle}>{r.description || "—"}</td>
                  <td style={cellStyle}>{r.payment_method || "—"}</td>
                  <td style={cellStyle}>{r.source_type}</td>
                  <td style={{ ...cellStyle, color: "#166534" }}>{r.debit ? fmt(r.debit) : "—"}</td>
                  <td style={{ ...cellStyle, color: "#991b1b" }}>{r.credit ? fmt(r.credit) : "—"}</td>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>{fmt(r.balance)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...cellStyle, background: "#f3f4f6", fontWeight: 700 }} colSpan={6}>{t("accounting.ledger.total_row")}</td>
                <td style={{ ...cellStyle, background: "#f3f4f6", fontWeight: 700, color: "#166534" }}>{fmt(totalDebit)}</td>
                <td style={{ ...cellStyle, background: "#f3f4f6", fontWeight: 700, color: "#991b1b" }}>{fmt(totalCredit)}</td>
                <td style={{ ...cellStyle, background: "#f3f4f6", fontWeight: 700 }}>{fmt(closing)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DataCard>
    </div>
  );
}

function Kpi({ label, value, bg, fg }: { label: string; value: string; bg: string; fg: string }) {
  return (
    <div style={{ background: bg, color: fg, border: "1px solid #d1d5db", padding: "6px 12px", borderRadius: 4, minWidth: 140 }}>
      <div style={{ fontSize: 11, opacity: 0.8 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
