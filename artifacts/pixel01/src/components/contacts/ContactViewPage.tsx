import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { formatBaseQuantity } from "@/lib/units";
import { useContact } from "@/hooks/use-contacts";
import { useContactBalances, computeContactDue } from "@/hooks/use-contact-balances";
import { DataCard } from "@/components/products/DataCard";
import {
  useContactPurchases,
  useContactPurchaseReturns,
  useContactInvoices,
  useContactPayments,
  useContactPurchaseStock,
  useContactDocuments,
  useUploadContactDocument,
  useDeleteContactDocument,
  useContactActivities,
  useSystemLedger,
  useContactInvoiceItems,
  useContactPurchaseItems,
} from "@/hooks/use-contact-view";
import { exportToCsv, exportToXls } from "@/lib/csv";
import { Download, FileSpreadsheet, Printer, ChevronDown, Wallet } from "lucide-react";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { ReportTable } from "@/components/reports/ReportTable";
import { FilterBar, type FilterField } from "@/components/shared/FilterBar";
import { SortableHead } from "@/components/shared/SortableHead";
import { useTableSort } from "@/components/shared/useTableSort";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useEmployeesMap } from "@/hooks/use-employees-map";
import { ContactPaymentModal } from "@/components/sales/cashier/ContactPaymentModal";
import { AccountSettlementModal } from "@/components/contacts/AccountSettlementModal";

import { useAccess } from "@/lib/access";
import { ArrowRight, Upload, Trash2, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { resettleContactDebt } from "@/lib/debt-allocation.functions";
import { InvoiceDetailsModal } from "@/components/sales/InvoiceDetailsModal";
import { useInvoicePrint } from "@/hooks/use-invoice-print";
import { PurchaseDetailsModal } from "@/components/purchases/PurchaseDetailsModal";
import { PaymentDetailsModal } from "@/components/contacts/PaymentDetailsModal";

type Scope = "customer" | "supplier" | "both";

/** Returns a plain string (for export/CSV). Use NetBalanceBadge for colored UI. */
const formatBalance = (val: number) => {
  const absVal = Math.abs(val).toFixed(2);
  if (val > 0) return `${absVal} (عليه)`;
  if (val < 0) return `${absVal} (له)`;
  return `0.00`;
};

function NetBalanceBadge({ gross }: { gross: number }) {
  if (gross > 0.004)
    return <span className="font-bold text-red-600">{Math.abs(gross).toFixed(2)} <span className="text-xs">(عليه)</span></span>;
  if (gross < -0.004)
    return <span className="font-bold text-green-600">{Math.abs(gross).toFixed(2)} <span className="text-xs">(له)</span></span>;
  return <span className="text-gray-500">0.00</span>;
}

const TABS = (scope: Scope) => [
  { key: "account", label: "حساب" },
  ...(scope === "supplier" || scope === "both" ? [{ key: "purchases", label: "المشتريات", perm: "purchases" as const }] : []),
  ...(scope === "customer" || scope === "both" ? [{ key: "sales", label: "المبيعات", perm: "sales" as const }] : []),
  { key: "stock", label: "تقرير المخزون", perm: "purchases" as const },
  { key: "documents", label: "المستندات" },
  { key: "payments", label: "المدفوعات", perm: "purchases" as const },
  { key: "activity", label: "أنشطة" },
];

const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151" };
const headStyle: React.CSSProperties = { backgroundColor: "#1e3a5f", color: "#fff", padding: "10px 12px", fontWeight: 600, fontSize: 13, cursor: "pointer", userSelect: "none" };

export function ContactViewPage({ contactId }: { contactId: string }) {
  const { dir } = useI18n();
  const { data: contact, isLoading } = useContact(contactId);
  const { data: balances } = useContactBalances();
  const { permissions, isAdmin } = useAccess();
  const scope = contact?.type as Scope || "both";
  const tabs = TABS(scope).filter((t) => !t.perm || isAdmin || (permissions as any)[t.perm]);
  const [tab, setTab] = useState(tabs[0]?.key ?? "account");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentDirection, setPaymentDirection] = useState<"in" | "out">("in");
  const [settleOpen, setSettleOpen] = useState(false);
  const qc = useQueryClient();
  const didResettle = useRef(false);

  // Auto-resettle on mount so available credit applies and dues are fresh
  useEffect(() => {
    if (!contactId || didResettle.current) return;
    didResettle.current = true;

    const run = async () => {
      if (scope === "supplier" || scope === "both") {
        await resettleContactDebt({ data: { contact_id: contactId, direction: "out" } });
      }
      if (scope === "customer" || scope === "both") {
        await resettleContactDebt({ data: { contact_id: contactId, direction: "in" } });
      }
    };

    run()
      .then(() => {
        qc.invalidateQueries({ queryKey: ["contact-balances"] });
        qc.invalidateQueries({ queryKey: ["contact-view"] });
        qc.invalidateQueries({ queryKey: ["contact-payments"] });
        qc.invalidateQueries({ queryKey: ["invoices"] });
        qc.invalidateQueries({ queryKey: ["purchases"] });
      })
      .catch((err) => console.warn("auto resettle failed", err));
  }, [contactId, scope, qc]);

  if (isLoading || !contact) return <div className="p-6 text-center text-gray-500" dir={dir}>جاري التحميل...</div>;

  const bal = balances?.get(contactId) ?? { total_sales: 0, unpaid_sales: 0, sales_returns: 0, total_purchases: 0, unpaid_purchases: 0, purchase_returns: 0, payments_in: 0, payments_out: 0 };
  const { gross, due: totalDue, credit: computedCredit, totalCredit } = computeContactDue(contact, balances?.get(contactId));
  const unpaidShown = scope === "supplier" ? Math.max(0, bal.unpaid_purchases) : Math.max(0, bal.unpaid_sales);
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
  const backTo = scope === "supplier" ? "/users/suppliers" : "/users/customers";



  return (
    <div className="space-y-3" dir={dir}>
      <div className="flex items-center gap-3 flex-wrap">
        <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
          <ArrowRight className="h-4 w-4" /> رجوع
        </Link>
        <h1 className="text-xl font-bold text-gray-800">{contact.business_name || fullName}</h1>
        {contact.is_active === false && (
          <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-700">معطّل</span>
        )}
        <button
          onClick={() => setSettleOpen(true)}
          className="h-9 px-4 inline-flex items-center gap-2 rounded text-sm text-white"
          style={{ backgroundColor: "#2563eb" }}
        >
          <Wallet className="h-4 w-4" />
          تصفية الحساب
        </button>
        {(scope === "customer" || scope === "both") && (
          <button
            onClick={() => { setPaymentDirection("in"); setPaymentOpen(true); }}
            className="h-9 px-4 inline-flex items-center gap-2 rounded text-sm text-white"
            style={{ backgroundColor: "#16a34a" }}
          >
            <Wallet className="h-4 w-4" />
            تحصيل دفعة من العميل
          </button>
        )}
        {(scope === "supplier" || scope === "both") && (
          <button
            onClick={() => { setPaymentDirection("out"); setPaymentOpen(true); }}
            className="h-9 px-4 inline-flex items-center gap-2 rounded text-sm text-white"
            style={{ backgroundColor: "#dc2626" }}
          >
            <Wallet className="h-4 w-4" />
            تسجيل دفعة للمورد
          </button>
        )}
      </div>

      <DataCard>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-gray-50 border-b">
          <Info label="المعرف" value={contact.contact_id} />
          <Info label="الجوال" value={contact.mobile} />
          <Info label="البريد" value={contact.email} />
          <Info label="العنوان" value={contact.address_line_1 ?? contact.address} />
          <Info label="رصيد افتتاحي" value={Number(contact.opening_balance ?? 0).toFixed(2)} />
          {(scope === "customer" || scope === "both") && (
            <>
              <Info label="إجمالي المبيعات" value={Number(bal.total_sales).toFixed(2)} />
            </>
          )}
          {(scope === "supplier" || scope === "both") && (
            <>
              <Info label="إجمالي المشتريات" value={Number(bal.total_purchases).toFixed(2)} />
            </>
          )}
          <div>
            <div className="text-xs text-gray-500">الرصيد المستحق</div>
            <div className="text-sm"><NetBalanceBadge gross={gross} /></div>
          </div>
        </div>

        <div className="flex border-b overflow-x-auto bg-white">
          {tabs.map((tt) => (
            <button
              key={tt.key}
              onClick={() => setTab(tt.key)}
              className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition ${
                tab === tt.key ? "border-blue-600 text-blue-600 font-semibold" : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {tt.label}
            </button>
          ))}
        </div>

        <div className="p-3">
          {tab === "account" && <AccountTab contact={contact} scope={scope} totalDue={totalDue} gross={gross} />}
          {tab === "purchases" && <PurchasesTab contactId={contactId} contactName={contact ? (contact.business_name || [contact.first_name, contact.last_name].filter(Boolean).join(" ")) : ""} />}
          {tab === "sales" && <SalesTab contactId={contactId} contactName={contact ? (contact.business_name || [contact.first_name, contact.last_name].filter(Boolean).join(" ")) : ""} />}
          {tab === "stock" && <StockTab contactId={contactId} />}
          {tab === "documents" && <DocumentsTab contactId={contactId} />}
          {tab === "payments" && <PaymentsTab contactId={contactId} />}
          {tab === "activity" && <ActivityTab contactId={contactId} />}
        </div>
      </DataCard>

      <ContactPaymentModal
        open={paymentOpen}
        direction={paymentDirection}
        initialContactId={contactId}
        lockContact
        onClose={() => setPaymentOpen(false)}
      />

      <AccountSettlementModal
        open={settleOpen}
        onClose={() => setSettleOpen(false)}
        contact={contact}
        scope={scope}
        due={totalDue}
        totalCredit={totalCredit}
      />
    </div>
  );
}

function Info({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-sm ${highlight ? "font-bold text-blue-700" : "text-gray-800"}`}>{value || "—"}</div>
    </div>
  );
}

function Table({ head, rows, empty = "لا توجد بيانات متاحة في الجدول", widths }: { head: string[]; rows: any[][]; empty?: string; widths?: string[] }) {
  const n = head.length;
  const cols = widths && widths.length === n ? widths : Array.from({ length: n }, () => `${100 / n}%`);
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-sm"
        style={{ borderCollapse: "collapse", tableLayout: "fixed", minWidth: 720 }}
      >
        <colgroup>
          {cols.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead>
          <tr>{head.map((h, i) => <th key={i} style={{ ...headStyle, textAlign: "center" }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={n} className="text-center py-6 text-gray-500" style={cellStyle}>{empty}</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => (
              <td
                key={j}
                style={{
                  ...cellStyle,
                  textAlign: "center",
                  verticalAlign: "middle",
                  whiteSpace: "normal",
                  overflowWrap: "anywhere",
                  wordBreak: "normal",
                }}

                title={typeof c === "string" || typeof c === "number" ? String(c) : undefined}
              >
                {c}
              </td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


function ClickableTable({ head, rows, onRowClick, empty = "لا توجد بيانات متاحة في الجدول", widths }: { head: string[]; rows: any[][]; onRowClick: (i: number) => void; empty?: string; widths?: string[] }) {
  const n = head.length;
  const cols = widths && widths.length === n ? widths : Array.from({ length: n }, () => `${100 / n}%`);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ borderCollapse: "collapse", tableLayout: "fixed", minWidth: 720 }}>
        <colgroup>{cols.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <thead><tr>{head.map((h, i) => <th key={i} style={{ ...headStyle, textAlign: "center" }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={n} className="text-center py-6 text-gray-500" style={cellStyle}>{empty}</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} onClick={() => onRowClick(i)} className="cursor-pointer hover:bg-blue-50">
              {r.map((c, j) => (
                <td key={j} style={{ ...cellStyle, textAlign: "center", verticalAlign: "middle", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={typeof c === "string" || typeof c === "number" ? String(c) : undefined}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExportButtons({ filename, headers, rows }: { filename: string; headers: string[]; rows: (string | number)[][] }) {
  const doPrint = () => {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    const thead = `<tr>${headers.map((h) => `<th style="background:#1e3a5f;color:#fff;padding:6px;border:1px solid #ccc">${h}</th>`).join("")}</tr>`;
    const tbody = rows.map((r) => `<tr>${r.map((c) => `<td style="padding:6px;border:1px solid #ccc;text-align:center">${c ?? ""}</td>`).join("")}</tr>`).join("");
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>${filename}</title></head><body><table style="width:100%;border-collapse:collapse;font-family:Arial">${thead}${tbody}</table><script>window.onload=()=>{window.print();}</script></body></html>`);
    w.document.close();
  };
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => exportToCsv(`${filename}.csv`, headers, rows)} className="h-8 px-3 inline-flex items-center gap-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700">
        <Download className="h-3.5 w-3.5" /> CSV
      </button>
      <button onClick={() => exportToXls(`${filename}.xls`, headers, rows)} className="h-8 px-3 inline-flex items-center gap-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700">
        <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
      </button>
      <button onClick={doPrint} className="h-8 px-3 inline-flex items-center gap-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700">
        <Printer className="h-3.5 w-3.5" /> طباعة
      </button>
    </div>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: string | ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid #f3f4f6" }}>
      <span className="text-sm text-gray-700">{label}</span>
      <span className={`text-sm ${highlight ? "font-bold" : "text-gray-800"}`}>{value}</span>
    </div>
  );
}

function AccountTab({ contact, scope, totalDue, gross }: { contact: any; scope: Scope; totalDue: number; gross: number }) {
  const { data: purchases = [] } = useContactPurchases((scope === "supplier" || scope === "both") ? contact.id : undefined);
  const { data: purchaseReturns = [] } = useContactPurchaseReturns((scope === "supplier" || scope === "both") ? contact.id : undefined);
  const { data: invoices = [] } = useContactInvoices((scope === "customer" || scope === "both") ? contact.id : undefined);
  const { data: payments = [] } = useContactPayments(contact.id);
  const { data: invItems = [] } = useContactInvoiceItems((scope === "customer" || scope === "both") ? contact.id : undefined);
  const { data: purItems = [] } = useContactPurchaseItems((scope === "supplier" || scope === "both") ? contact.id : undefined);
  const items = [...(invItems as any[]), ...(purItems as any[])];
  const [mode, setMode] = useState<1 | 2>(1);
  const { data: sys } = useSystemLedger(scope);
  const [viewingInvoice, setViewingInvoice] = useState<any | null>(null);
  const [viewingPurchase, setViewingPurchase] = useState<any | null>(null);
  const { onModalPrint: onAccountInvoicePrint, printNode: accountPrintNode } = useInvoicePrint({
    customerName: (inv) => inv?.customer_name_snapshot ?? "",
  });

  const invoiceByRef = useMemo(() => {
    const m: Record<string, any> = {};
    for (const i of invoices as any[]) if (i.invoice_number) m[String(i.invoice_number)] = i;
    return m;
  }, [invoices]);

  const purchaseByRef = useMemo(() => {
    const m: Record<string, any> = {};
    for (const p of purchases as any[]) if (p.purchase_number) m[String(p.purchase_number)] = p;
    return m;
  }, [purchases]);

  const openRef = (ref: string | number) => {
    const refStr = String(ref);
    if (!refStr || refStr === '-') return;
    if (scope === 'customer' || scope === 'both') {
      const inv = invoiceByRef[refStr];
      if (inv) { setViewingInvoice(inv); return; }
    }
    if (scope === 'supplier' || scope === 'both') {
      const pur = purchaseByRef[refStr];
      if (pur) { setViewingPurchase(pur); }
    }
  };

  // Date range filter — defaults to all time (empty) so data is visible by default
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const inRange = (dateStr: string | null | undefined) => {
    if (!dateStr) return true;
    const d = String(dateStr).slice(0, 10);
    const f = (from || "").slice(0, 10);
    const tt = (to || "").slice(0, 10);
    return (!f || d >= f) && (!tt || d <= tt);
  };

  const contactName = (id: string | null | undefined) => {
    if (!id || !sys) return "-";
    const c = sys.contacts.find((x: any) => x.id === id);
    if (!c) return "-";
    return c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "-";
  };

  // Summary card values (filtered by date)
  const summary = useMemo(() => {
    let openingBal = Number(contact.opening_balance ?? 0);
    let totalSales = 0, totalPurchases = 0, totalReturns = 0, totalPaid = 0;
    if (scope === "customer" || scope === "both") {
      for (const i of invoices as any[]) {
        if (i.status === "cancelled") continue;
        if (!inRange(i.created_at ?? i.issue_date)) continue;
        if (i.type === "sale_return") totalReturns += Number(i.total ?? 0);
        else totalSales += Number(i.total ?? 0);
      }
    }
    if (scope === "supplier" || scope === "both") {
      for (const p of purchases as any[]) {
        if (p.status === "cancelled") continue;
        if (!inRange(p.created_at ?? p.issue_date)) continue;
        totalPurchases += Number(p.total ?? 0);
      }
    }
    for (const p of payments as any[]) {
      if (!inRange(p.created_at ?? p.payment_date)) continue;
      const amt = Number(p.amount ?? 0);
      if (p.is_reversal) totalPaid -= amt; else totalPaid += amt;
    }
    return { openingBal, totalSales, totalPurchases, totalReturns, totalPaid };
  }, [contact, invoices, purchases, payments, from, to, scope]);

  // Format 1 ledger rows
  // Standard accounting rules for unified contact:
  // DEBIT (مدين) = increases what contact owes us: Sales, Purchase Returns, Payments Out
  // CREDIT (دائن) = increases what we owe contact: Purchases, Sales Returns, Payments In
  const ledgerRows = useMemo(() => {
    const all: { date: string; sortKey: string; ref: string; type: string; debit: number; credit: number; isOpening?: boolean }[] = [];
    const opening = Number(contact.opening_balance ?? 0);
    if (opening !== 0) {
      // Positive opening = contact owes us (debit), negative = we owe them (credit)
      all.push({ date: formatDateTime(contact.created_at) ?? "", sortKey: contact.created_at ?? "", ref: "-", type: "رصيد افتتاحي", debit: Math.max(0, opening), credit: Math.max(0, -opening), isOpening: true });
    }
    // Purchase invoices → CREDIT (we owe the supplier for goods received)
    if (scope === "supplier" || scope === "both") {
      for (const p of purchases as any[]) {
        if (p.status === "cancelled") continue;
        if (!inRange(p.created_at ?? p.issue_date)) continue;
        const amt = Math.abs(Number(p.total ?? 0));
        all.push({ date: formatDateTime(p.created_at ?? p.issue_date) || "", sortKey: p.created_at ?? p.issue_date, ref: p.purchase_number, type: "فاتورة شراء", debit: 0, credit: amt });
      }
      for (const pr of purchaseReturns as any[]) {
        if (!inRange(pr.return_date ?? pr.created_at)) continue;
        const amt = Math.abs(Number(pr.total_amount ?? 0));
        all.push({ date: formatDateTime(pr.return_date ?? pr.created_at) || "", sortKey: pr.return_date ?? pr.created_at, ref: pr.ref_no ?? "-", type: "مرتجع شراء", debit: amt, credit: 0 });
      }
    }
    if (scope === "customer" || scope === "both") {
      for (const i of invoices as any[]) {
        if (i.status === "cancelled") continue;
        if (!inRange(i.created_at ?? i.issue_date)) continue;
        const isReturn = i.type === "sale_return";
        const amt = Math.abs(Number(i.total ?? 0));
        // Sales invoice → DEBIT (customer owes us)
        // Sales return → CREDIT (we owe customer refund)
        all.push({ date: formatDateTime(i.created_at ?? i.issue_date) || "", sortKey: i.created_at ?? i.issue_date, ref: i.invoice_number, type: isReturn ? "مرتجع بيع" : "فاتورة بيع", debit: isReturn ? 0 : amt, credit: isReturn ? amt : 0 });
      }
    }
    for (const p of payments as any[]) {
      if (!inRange(p.created_at ?? p.payment_date)) continue;
      const amt = Math.abs(Number(p.amount ?? 0));
      const isRev = !!p.is_reversal;
      const origRef = p.original_ref_no || p.ref_no || "";
      let label = "";
      if (p.payment_method === "discount") {
        label = scope === "customer" ? "خصم مسموح به" : "خصم مكتسب";
        if (isRev) label = `عكس ${label}`;
      } else {
        label = isRev ? (origRef ? `عكس دفعة ${origRef}` : "عكس دفعة") : "دفعة";
      }
      // Payment direction: "in" = received from contact → CREDIT (reduces their debt)
      // Payment direction: "out" = paid to contact → DEBIT (reduces our debt)
      // Reversal flips the direction
      let debit = 0, credit = 0;
      if (isRev) {
        // Reversal undoes the original payment
        if (p.direction === "in") debit = amt; else credit = amt;
      } else {
        if (p.direction === "in") credit = amt; else debit = amt;
      }
      all.push({ date: formatDateTime(p.created_at ?? p.payment_date), sortKey: p.created_at ?? p.payment_date, ref: p.ref_no ?? "-", type: label, debit, credit });
    }
    all.sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
    // Running balance: balance += debit - credit
    let bal = 0;
    return all.map((r) => {
      bal += r.debit - r.credit;
      const isInvoiceRef = r.type === 'فاتورة بيع' || r.type === 'مرتجع بيع' || r.type === 'فاتورة شراء';
      return { cells: [r.date, r.ref, r.type, r.debit.toFixed(2), r.credit.toFixed(2), bal.toFixed(2)], isOpening: r.isOpening, isInvoiceRef, ref: r.ref };
    });
  }, [contact, purchases, purchaseReturns, invoices, payments, scope, from, to]);

  // Filtered items
  const filteredItems = useMemo(() =>
    items.filter((it: any) => inRange(it.created_at ?? it.issue_date)),
  [items, from, to]);

  // Format 2: system-wide rows matching the uploaded image
  // Same accounting rules as Format 1
  const sysRows = useMemo(() => {
    if (!sys) return [] as { cells: (string | number)[]; isOpening?: boolean; isInvoiceRef?: boolean; ref?: string }[];
    const all: { date: string; sortKey: string; ref: string; type: string; pay_status: string; pay_method: string; debit: number; credit: number }[] = [];
    const opening = Number(contact.opening_balance ?? 0);
    if (opening !== 0) {
      all.push({ date: formatDateTime(contact.created_at) ?? "", sortKey: "0000", ref: "-", type: "رصيد افتتاحي", pay_status: "-", pay_method: "-", debit: Math.max(0, opening), credit: Math.max(0, -opening) });
    }
    // Purchase invoices → CREDIT
    if (scope === "supplier" || scope === "both") {
      for (const p of sys.purchases) {
        if (p.supplier_id !== contact.id) continue;
        if (p.status === "cancelled") continue;
        if (!inRange(p.created_at ?? p.issue_date)) continue;
        const amt = Math.abs(Number(p.total ?? 0));
        all.push({ date: formatDateTime(p.created_at ?? p.issue_date) || "", sortKey: p.created_at ?? p.issue_date, ref: p.purchase_number ?? "-", type: "شراء", pay_status: p.payment_status === "paid" ? "مدفوع" : p.payment_status === "partial" ? "جزئي" : "غير مدفوع", pay_method: p.payment_method ?? "-", debit: 0, credit: amt });
      }
    }
    if (scope === "customer" || scope === "both") {
      for (const i of sys.invoices) {
        if (i.customer_id !== contact.id) continue;
        if (i.status === "cancelled") continue;
        if (!inRange(i.created_at ?? i.issue_date)) continue;
        const isReturn = i.type === "sale_return";
        const amt = Math.abs(Number(i.total ?? 0));
        // Sales → DEBIT, Sales Return → CREDIT
        all.push({ date: formatDateTime(i.created_at ?? i.issue_date) || "", sortKey: i.created_at ?? i.issue_date, ref: i.invoice_number ?? "-", type: isReturn ? "مرتجع" : "بيع", pay_status: i.payment_status === "paid" ? "مدفوع" : i.payment_status === "partial" ? "جزئي" : "غير مدفوع", pay_method: i.payment_method ?? "-", debit: isReturn ? 0 : amt, credit: isReturn ? amt : 0 });
      }
    }
    for (const p of sys.payments) {
      if (p.contact_id !== contact.id) continue;
      if (!inRange(p.created_at ?? p.payment_date)) continue;
      const amt = Math.abs(Number(p.amount ?? 0));
      const isRev = !!p.is_reversal;
      let typeLabel = isRev ? "عكس دفعة" : "دفعة";
      if (p.payment_method === "discount") {
        typeLabel = scope === "customer" ? "خصم مسموح به" : "خصم مكتسب";
        if (isRev) typeLabel = `عكس ${typeLabel}`;
      }
      // "in" = received from contact → CREDIT; "out" = paid to contact → DEBIT
      let debit = 0, credit = 0;
      if (isRev) {
        if (p.direction === "in") debit = amt; else credit = amt;
      } else {
        if (p.direction === "in") credit = amt; else debit = amt;
      }
      all.push({ date: formatDateTime(p.created_at ?? p.payment_date), sortKey: p.created_at ?? p.payment_date, ref: p.ref_no ?? "-", type: typeLabel, pay_status: "مدفوع", pay_method: p.payment_method ?? "نقدا", debit, credit });
    }

    all.sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
    let bal = 0;
    return all.map((r) => {
      bal += r.debit - r.credit;
      const isInvoiceRef = r.type === 'بيع' || r.type === 'مرتجع' || r.type === 'شراء';
      return { cells: [r.date, r.ref, r.type, r.pay_status, r.debit.toFixed(2), r.credit.toFixed(2), bal.toFixed(2), r.pay_method] as (string | number)[], isOpening: r.type === "رصيد افتتاحي", isInvoiceRef, ref: r.ref };
    });
  }, [sys, scope, from, to, contact]);

  const ledgerHeaders = ["التاريخ", "المرجع", "النوع", "عليه", "له", "الرصيد"];
  const itemsHeaders = ["#", "الصنف", "الكمية", "سعر الوحدة", "نسبة الخصم %", "الضريبة", "السعر شامل الضريبة", "المجموع"];
  const sysHeaders = ["التاريخ", "الرقم المرجعي", "النوع", "حالة الدفع", "عليه", "له", "الرصيد", "طريقة الدفع"];

  const itemsRows = filteredItems.map((it: any, idx: number) => [
    idx + 1,
    it.description ?? "-",
    Number(it.quantity).toFixed(2),
    Number(it.unit_price).toFixed(2),
    `${Number(it.discount_pct).toFixed(2)} %`,
    Number(it.tax).toFixed(2),
    Number(it.inclusive_unit).toFixed(2),
    Number(it.total).toFixed(2),
  ]) as (string | number)[][];

  return (
    <div className="space-y-4">
      {/* Toggle + Date filter */}
      <div className="flex flex-wrap items-end gap-3 bg-gray-50 p-3 rounded border border-gray-200">
        <div>
          <label className="text-xs text-gray-600 block mb-1">صيغة السجل</label>
          <div className="inline-flex rounded overflow-hidden border border-gray-300">
            <button onClick={() => setMode(1)} className={`px-3 py-1.5 text-sm ${mode === 1 ? "bg-blue-600 text-white" : "bg-white text-gray-700"}`}>الصيغة 1</button>
            <button onClick={() => setMode(2)} className={`px-3 py-1.5 text-sm ${mode === 2 ? "bg-blue-600 text-white" : "bg-white text-gray-700"}`}>الصيغة 2</button>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">من تاريخ</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 px-2 border border-gray-300 rounded text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">إلى تاريخ</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 px-2 border border-gray-300 rounded text-sm" />
        </div>
      </div>

      {/* Summary Card */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ background: "#1e3a5f", color: "#fff", padding: "10px 14px", fontWeight: 700, fontSize: 14 }}>ملخص الأرصدة الختامية</div>
        <SummaryRow label="رصيد افتتاحي" value={summary.openingBal.toFixed(2)} />
        {(scope === "customer" || scope === "both") && (
          <>
            <SummaryRow label="إجمالي المبيعات" value={summary.totalSales.toFixed(2)} />
            <SummaryRow label="مرتجعات المبيعات" value={summary.totalReturns.toFixed(2)} />
          </>
        )}
        {(scope === "supplier" || scope === "both") && (
          <>
            <SummaryRow label="إجمالي المشتريات" value={summary.totalPurchases.toFixed(2)} />
          </>
        )}
        <SummaryRow label="إجمالي المدفوعات" value={summary.totalPaid.toFixed(2)} />
        <SummaryRow label="الرصيد المستحق" value={<NetBalanceBadge gross={gross} />} highlight={gross !== 0} />
      </div>

      {mode === 1 ? (
        <>
          {/* Ledger Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-700">كشف الحساب</h3>
              <ExportButtons filename={`account-${contact.contact_id ?? contact.id}`} headers={ledgerHeaders} rows={ledgerRows.map((r) => r.cells)} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 720 }}>
                <thead>
                  <tr>{ledgerHeaders.map((h, i) => <th key={i} style={{ ...headStyle, textAlign: 'center' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {ledgerRows.length === 0 ? (
                    <tr><td colSpan={ledgerHeaders.length} className="text-center py-6 text-gray-500" style={cellStyle}>لا توجد بيانات</td></tr>
                  ) : ledgerRows.map((r, i) => (
                    <tr key={i}>
                      {r.cells.map((c, j) => {
                        const num = parseFloat(String(c));
                        let color: string | undefined;
                        if (j === 3) color = num > 0.004 ? "#dc2626" : undefined; // عليه → red
                        if (j === 4) color = num > 0.004 ? "#16a34a" : undefined; // له → green
                        if (j === 5) color = num > 0.004 ? "#dc2626" : num < -0.004 ? "#16a34a" : undefined; // balance
                        return (
                          <td key={j} style={{ ...cellStyle, textAlign: 'center', verticalAlign: 'middle', color: color || cellStyle.color, fontWeight: color ? 600 : undefined }}>
                            {j === 1 && r.isInvoiceRef && String(c) !== '-' ? (
                              <span onClick={() => openRef(String(c))} style={{ textDecoration: 'underline', cursor: 'pointer', color: '#2563eb', fontWeight: 600 }}>{c}</span>
                            ) : c}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-700">{scope === "customer" ? "أصناف اشتراها العميل" : "أصناف وردها المورد"}</h3>
              <ExportButtons filename={`items-${contact.contact_id ?? contact.id}`} headers={itemsHeaders} rows={itemsRows} />
            </div>
            <Table head={itemsHeaders} rows={itemsRows} />
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-700">عرض جميع الفواتير والمدفوعات بين {from} و {to}</h3>
            <ExportButtons filename={`system-ledger-${from}-${to}`} headers={sysHeaders} rows={sysRows.map((r) => r.cells)} />
          </div>
          <div className="overflow-x-auto" style={{ border: "1px solid #e5e7eb", borderRadius: 6 }}>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>{sysHeaders.map((h, i) => <th key={i} style={{ ...headStyle, textAlign: "center" }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {sysRows.length === 0 ? (
                  <tr><td colSpan={sysHeaders.length} style={{ ...cellStyle, textAlign: "center", color: "#9ca3af" }}>لا توجد بيانات</td></tr>
                ) : sysRows.map((r, i) => (
                  <tr key={i} style={r.isOpening ? { background: "#fef3c7" } : undefined}>
                    {r.cells.map((c, j) => {
                      const num = parseFloat(String(c));
                      let color: string | undefined;
                      if (j === 4) color = num > 0.004 ? "#dc2626" : undefined; // عليه → red
                      if (j === 5) color = num > 0.004 ? "#16a34a" : undefined; // له → green
                      if (j === 6) color = num > 0.004 ? "#dc2626" : num < -0.004 ? "#16a34a" : undefined; // balance
                      return (
                        <td key={j} style={{ ...cellStyle, textAlign: "center", color: color || cellStyle.color, fontWeight: color ? 600 : undefined }}>
                          {j === 1 && r.isInvoiceRef && String(c) !== '-' ? (
                            <span onClick={() => openRef(String(c))} style={{ textDecoration: 'underline', cursor: 'pointer', color: '#2563eb', fontWeight: 600 }}>{c}</span>
                          ) : c}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewingInvoice && (
        <InvoiceDetailsModal
          open={!!viewingInvoice}
          onOpenChange={(v) => !v && setViewingInvoice(null)}
          invoice={viewingInvoice}
          customerName={viewingInvoice?.customer_name_snapshot || ''}
          onPrint={viewingInvoice ? onAccountInvoicePrint(viewingInvoice, () => setViewingInvoice(null)) : () => {}}
        />
      )}
      {accountPrintNode}
      {viewingPurchase && (
        <PurchaseDetailsModal
          open={!!viewingPurchase}
          onOpenChange={(v) => !v && setViewingPurchase(null)}
          purchase={viewingPurchase}
          supplierName={contact.business_name || ''}
        />
      )}
    </div>
  );
}



function ContactDocsTable({
  contactId,
  scope,
  rows: srcRows,
  contactName,
}: { contactId: string; scope: "sale" | "purchase"; rows: any[]; contactName?: string }) {
  const { data: customers = [] } = scope === "sale" ? { data: undefined as any } : { data: undefined as any };
  const { data: empMap = {} } = useEmployeesMap();
  const isSale = scope === "sale";
  const headStyle: React.CSSProperties = { backgroundColor: "#1e3a5f", color: "#ffffff", padding: "10px 12px", fontWeight: 700, textAlign: "center", fontSize: 13, borderBottom: "1px solid #1e3a5f" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #e5e7eb", padding: "10px 12px", color: "#374151", textAlign: "center" };

  const baseCols: ColumnDef[] = isSale
    ? [
        { key: "opt", label: "خيارات", visible: true },
        { key: "issue_date", label: "تاريخ", visible: true },
        { key: "invoice_number", label: "رقم الفاتورة", visible: true },
        { key: "payment_status", label: "حالة الدفع", visible: true },
        { key: "payment_method", label: "طريقة الدفع", visible: true },
        { key: "total", label: "المبلغ", visible: true },
        { key: "paid_amount", label: "مدفوعات المبيعات", visible: true },
        { key: "_due", label: "بيع مستحق", visible: true },
        { key: "shipping_status", label: "حالة الشحن والتوصيل", visible: true },
        { key: "_added_by", label: "أضيفت بواسطة", visible: true },
      ]
    : [
        { key: "opt", label: "خيارات", visible: true },
        { key: "purchase_date", label: "تاريخ", visible: true },
        { key: "purchase_number", label: "رقم فاتورة الشراء", visible: true },
        { key: "ref_no", label: "الرقم المرجعي", visible: true },
        { key: "payment_status", label: "حالة الدفع", visible: true },
        { key: "status", label: "حالة الشراء", visible: true },
        { key: "total", label: "المبلغ", visible: true },
        { key: "paid_amount", label: "المدفوع", visible: true },
        { key: "due_amount", label: "المستحق", visible: true },
        { key: "_added_by", label: "أضيفت بواسطة", visible: true },
      ];

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState(baseCols);
  const [filters, setFilters] = useState({ from: "", to: "", payment_status: "", payment_method: "", shipping_status: "" });
  const [viewing, setViewing] = useState<any | null>(null);
  const { onModalPrint, printNode } = useInvoicePrint({
    customerName: (inv) => inv?.customer_name_snapshot ?? contactName ?? "",
  });
  const printRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => (srcRows as any[]).filter((r) => {
    const num = isSale ? r.invoice_number : r.purchase_number;
    const hay = [num, r.ref_no, r.payment_status, r.status].filter(Boolean).join(" ");
    if (search && !hay.includes(search)) return false;
    const rawD = isSale ? r.issue_date : (r.purchase_date || r.issue_date);
    const d = rawD ? String(rawD).slice(0, 10) : "";
    const ff = (filters.from || "").slice(0, 10);
    const tt = (filters.to || "").slice(0, 10);
    if (ff && (!d || d < ff)) return false;
    if (tt && (!d || d > tt)) return false;
    if (filters.payment_status && r.payment_status !== filters.payment_status) return false;
    if (filters.payment_method && r.payment_method !== filters.payment_method) return false;
    if (filters.shipping_status && r.shipping_status !== filters.shipping_status) return false;
    return true;
  }), [srcRows, search, filters, isSale]);
  // Inject accessors for computed columns so sorting works on them.
  const filteredWithAccessors = useMemo(() => filtered.map((r: any) => ({
    ...r,
    _due: Math.max(0, Number(r.total || 0) - Number(r.paid_amount || 0)),
    _added_by: r.created_by || r.created_by_name_snapshot || "",
  })), [filtered]);
  const { sorted, sort, setSort } = useTableSort(filteredWithAccessors as any);
  useEffect(() => setPage(1), [search, perPage, filters]);

  const STATUS_LABEL: Record<string, string> = { paid: "مدفوع", unpaid: "مستحق الدفع", partial: "جزئي", pending: "قيد الانتظار" };
  const SHIP_LABEL: Record<string, string> = { pending: "قيد الانتظار", delivered: "تم التوصيل", shipped: "تم الشحن", returned: "مرتجع" };

  const filterFields: FilterField[] = [
    { type: "date", key: "from", label: "من", value: filters.from },
    { type: "date", key: "to", label: "إلى", value: filters.to },
    { type: "select", key: "payment_status", label: "حالة الدفع", value: filters.payment_status, options: [
      { value: "paid", label: "مدفوع" }, { value: "partial", label: "جزئي" }, { value: "unpaid", label: "مستحق الدفع" }, { value: "pending", label: "قيد الانتظار" },
    ] },
    ...(isSale ? [
      { type: "select" as const, key: "payment_method", label: "طريقة الدفع", value: filters.payment_method, options: [
        { value: "cash", label: "نقدا" }, { value: "transfer", label: "تحويل" },
      ] },
      { type: "select" as const, key: "shipping_status", label: "حالة الشحن", value: filters.shipping_status, options: [
        { value: "pending", label: "قيد الانتظار" }, { value: "shipped", label: "تم الشحن" }, { value: "delivered", label: "تم التوصيل" }, { value: "returned", label: "مرتجع" },
      ] },
    ] : []),
  ];

  const pageSize = perPage === "all" ? sorted.length || 1 : Number(perPage);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const fromN = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toN = Math.min(total, page * pageSize);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const visible = cols.filter((c) => c.visible);

  const totalSum = sorted.reduce((s, r) => s + Number(r.total || 0), 0);
  const paidSum = sorted.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
  const dueSum = sorted.reduce((s, r) => s + (isSale ? Math.max(0, Number(r.total || 0) - Number(r.paid_amount || 0)) : Number(r.due_amount || 0)), 0);

  const Badge = ({ label, status }: { label: string; status: string }) => {
    const colors: Record<string, [string, string]> = {
      paid: ["#dcfce7", "#065f46"], partial: ["#fef3c7", "#92400e"], unpaid: ["#fee2e2", "#991b1b"], pending: ["#fef3c7", "#92400e"],
      delivered: ["#dcfce7", "#065f46"], shipped: ["#dbeafe", "#1e40af"], returned: ["#fee2e2", "#991b1b"],
    };
    const [bg, fg] = colors[status] || ["#f3f4f6", "#374151"];
    return <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 4, backgroundColor: bg, color: fg, fontSize: 12, fontWeight: 600 }}>{label}</span>;
  };

  const cellFor = (r: any, key: string) => {
    if (key === "issue_date" || key === "purchase_date") return formatDateTime(r.created_at ?? r[key] ?? r.issue_date);
    if (key === "payment_method") return r.payment_method === "cash" ? "نقدا" : (r.payment_method || "—");
    if (key === "payment_status") return <Badge label={STATUS_LABEL[r.payment_status] || "—"} status={r.payment_status} />;
    if (key === "shipping_status") return <Badge label={SHIP_LABEL[r.shipping_status] || "—"} status={r.shipping_status} />;
    if (key === "status") return <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 4, backgroundColor: "#dcfce7", color: "#065f46", fontSize: 12, fontWeight: 600 }}>{r.status || "—"}</span>;
    if (key === "total" || key === "paid_amount" || key === "due_amount") return `${Number(r[key] ?? 0).toFixed(2)} ج.م`;
    if (key === "due" || key === "_due") return `${Math.max(0, Number(r.total || 0) - Number(r.paid_amount || 0)).toFixed(2)} ج.م`;
    if (key === "added_by" || key === "_added_by") return r.created_by ? ((empMap as any)[r.created_by] ?? r.created_by_name_snapshot ?? "—") : (r.created_by_name_snapshot ?? "—");
    return r[key] ?? "—";
  };

  const exportHeaders = visible.filter((c) => c.key !== "opt").map((c) => c.label);
  const exportRows = sorted.map((r) => visible.filter((c) => c.key !== "opt").map((c) => {
    const v = cellFor(r, c.key);
    return typeof v === "string" || typeof v === "number" ? String(v) : (r[c.key] ?? "");
  }));

  return (
    <div className="space-y-3">
      <FilterBar
        fields={filterFields}
        onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        onReset={() => setFilters({ from: "", to: "", payment_status: "", payment_method: "", shipping_status: "" })}
      />
      <TableToolbar
        search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
        onExportCsv={() => exportToCsv(`${isSale ? "sales" : "purchases"}-${contactId}.csv`, exportHeaders, exportRows)}
        onExportExcel={() => exportToXls(`${isSale ? "sales" : "purchases"}-${contactId}.xls`, exportHeaders, exportRows)}
        printRef={printRef} printTitle={isSale ? "المبيعات" : "المشتريات"}
        columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))}
      />
      <div className="overflow-x-auto rounded-md" ref={printRef} style={{ border: "1px solid #d1d5db" }}>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
          <tbody>
            {pageRows.length === 0 ? <EmptyRow colSpan={visible.length} /> : pageRows.map((r: any) => (
              <tr key={r.id} className="cursor-pointer hover:bg-blue-50" onClick={() => isSale ? setViewing(r) : setViewing(r)}>
                {visible.map((c) => c.key === "opt" ? (
                  <td key={c.key} style={cellStyle} data-print-hide="1" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="h-8 px-3 inline-flex items-center gap-1 text-xs rounded text-white" style={{ backgroundColor: "#3b82f6" }}>
                          خيارات <ChevronDown className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setViewing(r)}><Eye className="h-4 w-4 ms-2" /> فحص</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                ) : <td key={c.key} style={cellStyle}>{cellFor(r, c.key)}</td>)}
              </tr>
            ))}
          </tbody>
          {pageRows.length > 0 && (
            <tfoot>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <td colSpan={Math.max(1, visible.length - 4)} style={{ ...cellStyle, fontWeight: 700, textAlign: "center" }}>المجموع:</td>
                <td style={{ ...cellStyle, fontWeight: 700 }}>{totalSum.toFixed(2)} ج.م</td>
                <td style={{ ...cellStyle, fontWeight: 700 }}>{paidSum.toFixed(2)} ج.م</td>
                <td style={{ ...cellStyle, fontWeight: 700 }}>{dueSum.toFixed(2)} ج.م</td>
                <td colSpan={Math.max(0, visible.length - (Math.max(1, visible.length - 4) + 3))} style={cellStyle}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <TableFooter from={fromN} to={toN} total={total} page={page} pageCount={pageCount}
        onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />

      {isSale ? (
        <InvoiceDetailsModal
          open={!!viewing}
          onOpenChange={(v) => !v && setViewing(null)}
          invoice={viewing}
          customerName={viewing?.customer_name_snapshot || ""}
          onPrint={viewing && isSale ? onModalPrint(viewing, () => setViewing(null)) : () => {}}
        />
      ) : (
        <PurchaseDetailsModal open={!!viewing} onOpenChange={(v) => !v && setViewing(null)} purchase={viewing} supplierName={contactName} />
      )}
      {isSale ? printNode : null}

    </div>
  );
}

function PurchasesTab({ contactId, contactName }: { contactId: string; contactName?: string }) {
  const { data = [] } = useContactPurchases(contactId);
  return <ContactDocsTable contactId={contactId} scope="purchase" rows={data as any[]} contactName={contactName} />;
}

function SalesTab({ contactId, contactName }: { contactId: string; contactName?: string }) {
  const { data = [] } = useContactInvoices(contactId);
  return <ContactDocsTable contactId={contactId} scope="sale" rows={data as any[]} contactName={contactName} />;
}

function StockTab({ contactId }: { contactId: string }) {
  const { data = [] } = useContactPurchaseStock(contactId);
  const rows = data as any[];
  const cols: ColumnDef[] = [
    { key: "name", label: "صنف", visible: true },
    { key: "sku", label: "SKU الباركود", visible: true },
    { key: "purchased_qty", label: "كمية المشتريات", visible: true },
    { key: "sold_qty", label: "إجمالي المباع", visible: true },
    { key: "returned_qty", label: "تم إرجاع الإجمالي", visible: true },
    { key: "current_stock", label: "المخزون الحالي", visible: true },
    { key: "stock_value", label: "قيمة المخزون الحالية", visible: true },
  ];
  const fmtQty = (n: number, tree?: any) =>
    tree ? formatBaseQuantity(Number(n ?? 0), tree) : `${Number(n ?? 0).toFixed(2)}`;
  return (
    <ReportTable
      rows={rows}
      initialCols={cols}
      numericKeys={["purchased_qty", "sold_qty", "returned_qty", "current_stock", "stock_value"]}
      searchFields={(r: any) => `${r.name ?? ""} ${r.sku ?? ""}`}
      exportName="supplier-stock-report"
      printTitle="تقرير المخزون"
      rowKey={(r: any, i: number) => r.product_id ?? `row-${i}`}
      cellFor={(r: any, k: string) => {
        const tree = r.unit_tree;
        switch (k) {
          case "name": return r.name ?? "-";
          case "sku": return r.sku || "-";
          case "purchased_qty": return fmtQty(r.purchased_qty, tree);
          case "sold_qty": return fmtQty(r.sold_qty, tree);
          case "returned_qty": return fmtQty(r.returned_qty, tree);
          case "current_stock": return fmtQty(r.current_stock, tree);
          case "stock_value": return `ج.م ${Number(r.stock_value ?? 0).toFixed(2)}`;
          default: return "";
        }
      }}
    />
  );
}


function DocumentsTab({ contactId }: { contactId: string }) {
  const { data = [] } = useContactDocuments(contactId);
  const upload = useUploadContactDocument();
  const del = useDeleteContactDocument();
  const [title, setTitle] = useState("");

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await upload.mutateAsync({ contactId, title, file });
    setTitle("");
    e.target.value = "";
  };

  const view = async (path: string) => {
    const { data, error } = await supabase.storage.from("contact-documents").createSignedUrl(path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-end p-3 bg-gray-50 rounded">
        <div className="flex-1">
          <label className="text-xs text-gray-600 block mb-1">عنوان المستند</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border rounded h-9 px-2 text-sm" placeholder="عنوان (اختياري)" />
        </div>
        <label className="h-9 px-4 inline-flex items-center gap-2 bg-blue-600 text-white rounded text-sm cursor-pointer">
          <Upload className="h-4 w-4" /> رفع
          <input type="file" hidden onChange={onFile} accept=".pdf,.csv,.zip,.doc,.docx,.jpeg,.jpg,.png" />
        </label>
      </div>
      <Table
        head={["العنوان", "تاريخ الرفع", "خيارات"]}
        rows={(data as any[]).map((d) => [
          d.title,
          formatDateTime(d.created_at),
          <div key="a" className="flex gap-1">
            <button onClick={() => view(d.file_path)} className="h-7 w-7 inline-flex items-center justify-center text-blue-600"><Eye className="h-4 w-4" /></button>
            <button onClick={() => del.mutate({ id: d.id, file_path: d.file_path })} className="h-7 w-7 inline-flex items-center justify-center text-red-600"><Trash2 className="h-4 w-4" /></button>
          </div>,
        ])}
      />
    </div>
  );
}

function PaymentsTab({ contactId }: { contactId: string }) {
  const { data = [] } = useContactPayments(contactId);
  const [open, setOpen] = useState<any | null>(null);
  const rows = data as any[];
  const head = ["المدفوعة على", "الرقم المرجعي", "المبلغ", "طريقة الدفع", "الحالة", "ملاحظات"];
  return (
    <>
      <div className="overflow-x-auto rounded-md" style={{ border: "1px solid #e5e7eb" }}>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>{head.map((h) => <th key={h} style={headStyle}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={head.length} style={{ ...cellStyle, textAlign: "center", color: "#9ca3af", padding: 24 }}>لا توجد بيانات متاحة في الجدول</td></tr>
            ) : rows.map((p) => {
              const isRev = !!p.is_reversal;
              const reversedAmt = Number(p.reversed_amount ?? 0);
              const isFullyReversed = !!p.reversed_by_payment_id || reversedAmt >= Number(p.amount ?? 0) - 0.001;
              const isPartiallyReversed = !isFullyReversed && reversedAmt > 0;
              const origRef = p.original_ref_no || (p.original_payment_id ? "—" : "");
              const statusBadge = isFullyReversed
                ? <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, backgroundColor: "#fee2e2", color: "#991b1b", fontSize: 12, fontWeight: 600 }}>معكوسة</span>
                : isPartiallyReversed
                ? <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, backgroundColor: "#fde68a", color: "#92400e", fontSize: 12, fontWeight: 600 }}>معكوسة جزئياً ({reversedAmt.toFixed(2)})</span>
                : isRev
                ? <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, backgroundColor: "#fef3c7", color: "#92400e", fontSize: 12, fontWeight: 600 }}>قيد عكسي {origRef}</span>
                : <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, backgroundColor: "#dcfce7", color: "#065f46", fontSize: 12, fontWeight: 600 }}>مسجلة</span>;
              return (
                <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setOpen(p)}>
                  <td style={cellStyle}>{formatDateTime(p.created_at ?? p.payment_date)}</td>
                  <td style={cellStyle}>{p.ref_no ?? "-"}</td>
                  <td style={cellStyle}>{Number(p.amount ?? 0).toFixed(2)}</td>
                  <td style={cellStyle}>{p.payment_method ?? "نقدا"}</td>
                  <td style={cellStyle}>{statusBadge}</td>
                  <td style={cellStyle}>{p.notes ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PaymentDetailsModal open={!!open} onOpenChange={(v) => !v && setOpen(null)} payment={open} />
    </>
  );
}

// Note: scope is unknown inside PaymentsTab; the modal will skip auto-resettle when scope is null.

function ActivityTab({ contactId }: { contactId: string }) {
  const { data = [] } = useContactActivities(contactId);
  const rows = (data as any[]).map((a) => [
    new Date(a.created_at).toLocaleString(),
    a.action_type === "create" ? "تمت الإضافة" : a.action_type === "update" ? "تم التعديل" : a.action_type === "delete" ? "تم الحذف" : a.action_type,
    a.actor_name ?? "-",
    a.subject_label ?? "",
  ]);
  return <Table head={["التاريخ", "خيار", "بواسطة", "ملاحظة"]} rows={rows} />;
}
