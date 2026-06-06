import { Fragment, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import {
  useCashierSessions,
  useCloseCashierSession,
  useInvoicesBySession,
  useInvoiceItems,
} from "@/hooks/use-invoices";
import { useContacts } from "@/hooks/use-contacts";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { InvoiceDetailsModal } from "@/components/sales/InvoiceDetailsModal";
import { PrintableInvoice, type PrintMode } from "@/components/sales/PrintableInvoice";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/sales/cashier-log")({
  component: CashierLog,
});

const cellBorder = { border: "1px solid #d1d5db" } as const;
const subCellBorder = { border: "1px solid #e5e7eb" } as const;

function SessionInvoices({ sessionId, onView }: { sessionId: string; onView: (inv: any) => void }) {
  const { t, lang, dir } = useI18n();
  const { data: invoices = [], isLoading } = useInvoicesBySession(sessionId);
  if (isLoading) return <div className="p-3 text-xs text-gray-500">{t("sales.session.loading_invoices")}</div>;
  if (invoices.length === 0)
    return <div className="p-3 text-xs text-gray-500">{t("sales.session.no_invoices")}</div>;

  const totalSales = invoices
    .filter((i: any) => i.type === "sale")
    .reduce((s: number, i: any) => s + Number(i.total || 0), 0);
  const totalReturns = invoices
    .filter((i: any) => i.type === "sale_return")
    .reduce((s: number, i: any) => s + Math.abs(Number(i.total || 0)), 0);

  const locale = lang === "ar" ? "ar-EG" : "en-US";
  const headers = ["#", t("sales.cols.invoice_no"), t("sales.session.type"), t("sales.cols.date"), t("sales.cashier.grand"), t("sales.print.paid").replace(":", ""), t("sales.cols.payment_status"), ""];

  return (
    <div className="p-3" style={{ backgroundColor: "#fafafa" }} dir={dir}>
      <div className="flex gap-4 text-xs mb-2" style={{ color: "#374151" }}>
        <span>{t("sales.session.invoices_count")} <b>{invoices.length}</b></span>
        <span>{t("sales.session.total_sales")} <b>{totalSales.toFixed(2)}</b></span>
        <span>{t("sales.session.total_returns")} <b>{totalReturns.toFixed(2)}</b></span>
        <span>{t("sales.session.net")} <b>{(totalSales - totalReturns).toFixed(2)}</b></span>
      </div>
      <table className="w-full text-xs" style={{ borderCollapse: "collapse", backgroundColor: "#fff" }}>
        <thead style={{ backgroundColor: "#f3f4f6" }}>
          <tr>
            {headers.map((h, idx) => (
              <th key={idx} className="text-start p-2" style={subCellBorder}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv: any, i: number) => {
            const isReturn = inv.type === "sale_return";
            return (
              <tr key={inv.id}>
                <td className="p-2" style={subCellBorder}>{i + 1}</td>
                <td className="p-2" style={subCellBorder}>{inv.invoice_number}</td>
                <td className="p-2" style={subCellBorder}>
                  <span
                    className="px-2 py-0.5 rounded text-[10px]"
                    style={{
                      backgroundColor: isReturn ? "#fee2e2" : "#dcfce7",
                      color: isReturn ? "#991b1b" : "#166534",
                    }}
                  >
                    {isReturn ? t("sales.session.return") : t("sales.session.sale")}
                  </span>
                </td>
                <td className="p-2" style={subCellBorder}>{new Date(inv.created_at).toLocaleString(locale)}</td>
                <td className="p-2" style={subCellBorder}>{Number(inv.total || 0).toFixed(2)}</td>
                <td className="p-2" style={subCellBorder}>{Number(inv.paid_amount || 0).toFixed(2)}</td>
                <td className="p-2" style={subCellBorder}>{inv.payment_status}</td>
                <td className="p-2" style={subCellBorder}>
                  <button
                    type="button"
                    onClick={() => onView(inv)}
                    className="text-blue-600 hover:underline"
                  >
                    {t("sales.actions.view")}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CashierLog() {
  const { t, lang, dir } = useI18n();
  const { data: sessions = [], isLoading } = useCashierSessions();
  const { data: customers = [] } = useContacts("customer");
  const close = useCloseCashierSession();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [viewing, setViewing] = useState<any | null>(null);
  const [printing, setPrinting] = useState<any | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>("invoice");
  const [pendingPrint, setPendingPrint] = useState(false);
  const { data: printItems = [] } = useInvoiceItems(printing?.id);

  useEffect(() => {
    const handler = () => { setPrinting(null); setPendingPrint(false); };
    window.addEventListener("afterprint", handler);
    return () => window.removeEventListener("afterprint", handler);
  }, []);

  useEffect(() => {
    if (!pendingPrint) return;
    if (!printing) return;
    if (!printItems || (printItems as any[]).length === 0) return;
    const tmr = setTimeout(() => {
      window.print();
      setPendingPrint(false);
    }, 100);
    return () => clearTimeout(tmr);
  }, [pendingPrint, printing, printItems]);

  const triggerPrint = (inv: any, m: PrintMode) => {
    setPrintMode(m);
    setPrinting(inv);
    setPendingPrint(true);
  };

  const custName = (id?: string | null) => {
    if (!id) return t("sales.cashier.cash_customer");
    const c: any = (customers as any[]).find((x) => x.id === id);
    return c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || c.business_name || "—" : t("sales.cashier.cash_customer");
  };

  const locale = lang === "ar" ? "ar-EG" : "en-US";
  const ChevCollapsed = dir === "rtl" ? ChevronLeft : ChevronRight;
  const headers = ["", "#", t("sales.session.open_at"), t("sales.session.opening_cash"), t("sales.session.close_at"), t("sales.session.closing_cash"), t("sales.session.status"), ""];

  return (
    <div className="space-y-3" dir={dir} style={{ backgroundColor: "#e9e9e9" }}>
      <PageHeader
        title={t("sales.titles.cashier_log")}
        actions={
          <Link
            to="/sales/cashier-session"
            className="h-10 px-4 rounded-md text-white text-sm inline-flex items-center"
            style={{ backgroundColor: "#16a34a" }}
          >
            {t("sales.session.new")}
          </Link>
        }
      />
      <DataCard className="border border-gray-300">
        {isLoading ? (
          <div className="p-4 text-sm text-gray-500">{t("sales.session.loading")}</div>
        ) : sessions.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">{t("sales.session.no_sessions")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead style={{ backgroundColor: "#f3f4f6" }}>
                <tr>
                  {headers.map((h, idx) => (
                    <th key={idx} className="text-start p-2" style={{ ...cellBorder, color: "#374151" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s: any, i: number) => {
                  const isOpen = !!expanded[s.id];
                  return (
                    <Fragment key={s.id}>
                      <tr>
                        <td className="p-2" style={cellBorder}>
                          <button
                            type="button"
                            onClick={() => setExpanded((m) => ({ ...m, [s.id]: !m[s.id] }))}
                            className="p-1 rounded hover:bg-gray-100"
                            aria-label={t("sales.cashier.expand")}
                          >
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevCollapsed className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="p-2" style={cellBorder}>{i + 1}</td>
                        <td className="p-2" style={cellBorder}>{new Date(s.opened_at).toLocaleString(locale)}</td>
                        <td className="p-2" style={cellBorder}>{Number(s.opening_cash).toFixed(2)}</td>
                        <td className="p-2" style={cellBorder}>{s.closed_at ? new Date(s.closed_at).toLocaleString(locale) : "—"}</td>
                        <td className="p-2" style={cellBorder}>{s.closing_cash != null ? Number(s.closing_cash).toFixed(2) : "—"}</td>
                        <td className="p-2" style={cellBorder}>
                          <span
                            className="px-2 py-0.5 rounded text-xs"
                            style={{
                              backgroundColor: s.status === "open" ? "#dcfce7" : "#f3f4f6",
                              color: s.status === "open" ? "#166534" : "#374151",
                            }}
                          >
                            {s.status === "open" ? t("sales.session.status_open") : t("sales.session.status_closed")}
                          </span>
                        </td>
                        <td className="p-2" style={cellBorder}>
                          {s.status === "open" && (
                            <div className="flex gap-2 justify-end">
                              <Link
                                to="/sales/cashier"
                                search={{ session: s.id } as any}
                                className="px-3 py-1 rounded text-white text-xs"
                                style={{ backgroundColor: "#2563eb" }}
                              >
                                {t("sales.session.open_cashier")}
                              </Link>
                            </div>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} style={cellBorder}>
                            <SessionInvoices sessionId={s.id} onView={(inv) => setViewing(inv)} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DataCard>

      <InvoiceDetailsModal
        open={!!viewing}
        onOpenChange={(v) => !v && setViewing(null)}
        invoice={viewing}
        customerName={viewing ? custName(viewing.customer_id) : ""}
        onPrint={(m) => {
          const inv = viewing;
          if (!inv) return;
          setViewing(null);
          triggerPrint(inv, m);
        }}
      />

      {printing && (
        <PrintableInvoice
          mode={printMode}
          invoice={printing}
          items={printItems as any[]}
          customerName={custName(printing.customer_id)}
        />
      )}
    </div>
  );
}
