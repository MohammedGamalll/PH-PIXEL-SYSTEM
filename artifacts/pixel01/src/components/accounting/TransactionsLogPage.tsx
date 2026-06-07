import { useMemo, useState } from "react";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { TableToolbar, TableFooter } from "@/components/products/TableToolbar";
import { PrintStyles, PrintHeader } from "./PrintStyles";
import { useJournalLines } from "@/hooks/use-reports";
import { useInvoicesByType } from "@/hooks/use-invoices";
import { usePurchases, usePurchaseReturns } from "@/hooks/use-purchases";
import { useI18n } from "@/lib/i18n";
import { SortableHead } from "@/components/shared/SortableHead";
import { useTableSort } from "@/components/shared/useTableSort";
import { exportToCsv, exportToXls } from "@/lib/csv";
import { useRef } from "react";
import { InvoiceDetailsModal } from "@/components/sales/InvoiceDetailsModal";
import { useInvoicePrint } from "@/hooks/use-invoice-print";
import { PurchaseDetailsModal } from "@/components/purchases/PurchaseDetailsModal";

const INVOICE_SOURCES = new Set(["sale", "sale_return", "invoice"]);
const PURCHASE_SOURCES = new Set(["purchase", "purchase_return"]);

export function TransactionsLogPage() {
  const { t, dir } = useI18n();
  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: lines = [], isLoading } = useJournalLines();
  const { data: sales = [] } = useInvoicesByType("sale");
  const { data: salesReturns = [] } = useInvoicesByType("sale_return");
  const { data: purchases = [] } = usePurchases();
  const { data: purchaseReturns = [] } = usePurchaseReturns();

  const invoiceMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of [...(sales as any[]), ...(salesReturns as any[])]) m.set(r.id, r);
    return m;
  }, [sales, salesReturns]);
  const purchaseMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of [...(purchases as any[]), ...(purchaseReturns as any[])]) m.set(r.id, r);
    return m;
  }, [purchases, purchaseReturns]);

  const [invoiceModal, setInvoiceModal] = useState<any | null>(null);
  const { onModalPrint, printNode } = useInvoicePrint({
    customerName: (inv) => inv?.customer_name_snapshot ?? "",
  });
  const [purchaseModal, setPurchaseModal] = useState<any | null>(null);

  const fmt = (n: number) => t("accounting.currency", { n: (Number(n) || 0).toFixed(2) });
  const align = dir === "rtl" ? "right" : "left";
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "8px 10px", fontWeight: 600, textAlign: align as any, fontSize: 12, borderBottom: "1px solid #d1d5db" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #e5e7eb", padding: "6px 10px", color: "#374151", fontSize: 12 };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = lines.map((l) => ({
      ...l,
      amount: l.debit || l.credit,
      method: l.payment_method || t("accounting.payment.cash"),
      ref: l.ref_no || l.source_type,
    }));
    if (!q) return base;
    return base.filter((l) =>
      [l.account_name, l.description, l.ref_no, l.payment_method, l.source_type]
        .some((v) => (v || "").toString().toLowerCase().includes(q))
    );
  }, [lines, search, t]);

  const { sorted, sort, setSort } = useTableSort(filtered);

  const pageSize = perPage === "all" ? sorted.length || 1 : Number(perPage);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const start = (page - 1) * pageSize;
  const pageRows = perPage === "all" ? sorted : sorted.slice(start, start + pageSize);
  const from = sorted.length === 0 ? 0 : start + 1;
  const to = start + pageRows.length;

  const cols = [
    { key: "entry_date", label: t("accounting.tx.col.date"), visible: true },
    { key: "ref", label: t("accounting.tx.col.ref"), visible: true },
    { key: "amount", label: t("accounting.tx.col.amount"), visible: true },
    { key: "method", label: t("accounting.tx.col.method"), visible: true },
    { key: "account_name", label: t("accounting.tx.col.account"), visible: true },
    { key: "description", label: t("accounting.tx.col.desc"), visible: true },
  ];

  const exportRows = () => sorted.map((r) => [r.entry_date, r.ref_no || r.source_type, (r.debit || r.credit).toFixed(2), r.payment_method || "", r.account_name, r.description || ""]);
  const exportHeaders = [t("accounting.tx.col.date"), t("accounting.tx.col.ref"), t("accounting.tx.col.amount"), t("accounting.tx.col.method"), t("accounting.tx.col.account"), t("accounting.tx.col.desc")];

  const openRef = (r: any) => {
    if (!r.source_id) return;
    if (INVOICE_SOURCES.has(r.source_type)) {
      const inv = invoiceMap.get(r.source_id);
      if (inv) setInvoiceModal(inv);
    } else if (PURCHASE_SOURCES.has(r.source_type)) {
      const p = purchaseMap.get(r.source_id);
      if (p) setPurchaseModal(p);
    }
  };

  const isClickableRef = (r: any) =>
    !!r.source_id && (INVOICE_SOURCES.has(r.source_type) || PURCHASE_SOURCES.has(r.source_type));

  return (
    <div className="space-y-3" dir={dir}>
      <PrintStyles />
      <PageHeader title={t("accounting.tx.title")} subtitle={t("accounting.tx.subtitle")} />

      <DataCard className="border-gray-300 print-area">
        <PrintHeader title={t("accounting.tx.title")} />
        <TableToolbar
          search={search}
          onSearchChange={(v) => { setSearch(v); setPage(1); }}
          perPage={perPage}
          onPerPageChange={(v) => { setPerPage(v === "999999" ? "all" : v); setPage(1); }}
          onExportCsv={() => exportToCsv("transactions.csv", exportHeaders, exportRows())}
          onExportExcel={() => exportToXls("transactions.xls", exportHeaders, exportRows())}
          printRef={printRef}
          printTitle={t("accounting.tx.title")}
        />

        <div ref={printRef} className="overflow-x-auto rounded-md" style={{ border: "1px solid #d1d5db" }}>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <SortableHead cols={cols} headStyle={headStyle} sort={sort} onSort={setSort} />
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={cols.length} style={{ ...cellStyle, textAlign: "center" }}>{t("accounting.loading")}</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={cols.length} style={{ ...cellStyle, textAlign: "center", color: "#9ca3af" }}>{t("accounting.no_movements")}</td></tr>
              ) : pageRows.map((r) => {
                const amount = r.debit || r.credit;
                const clickable = isClickableRef(r);
                return (
                  <tr key={r.line_id}>
                    <td style={cellStyle}>{r.entry_date}</td>
                    <td style={cellStyle}>
                      {clickable ? (
                        <button
                          type="button"
                          onClick={() => openRef(r)}
                          style={{ background: "transparent", border: "none", padding: 0, color: "#1d4ed8", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
                        >
                          {r.ref_no || r.source_type}
                        </button>
                      ) : (r.ref_no || r.source_type)}
                    </td>
                    <td style={{ ...cellStyle, fontWeight: 600, color: r.debit ? "#166534" : "#991b1b" }}>{fmt(amount)}</td>
                    <td style={cellStyle}>{r.payment_method || t("accounting.payment.cash")}</td>
                    <td style={cellStyle}>{r.account_name}</td>
                    <td style={cellStyle}>{r.description || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <TableFooter
          from={from} to={to} total={sorted.length} page={page} pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
        />
      </DataCard>

      <InvoiceDetailsModal
        open={!!invoiceModal}
        onOpenChange={(v) => !v && setInvoiceModal(null)}
        invoice={invoiceModal}
        customerName={invoiceModal?.customer_name_snapshot || ""}
        onPrint={invoiceModal ? onModalPrint(invoiceModal, () => setInvoiceModal(null)) : () => {}}
      />
      {printNode}
      <PurchaseDetailsModal
        open={!!purchaseModal}
        onOpenChange={(v) => !v && setPurchaseModal(null)}
        purchase={purchaseModal}
        supplierName={purchaseModal?.supplier_name_snapshot || ""}
      />
    </div>
  );
}
