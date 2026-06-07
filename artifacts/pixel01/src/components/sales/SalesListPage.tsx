import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, ChevronDown, Eye, Pencil, Trash2, Truck, Printer, Package, FileText, ArrowRightLeft, Copy, Wallet, Share2, RotateCcw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { FilterBar, type FilterField } from "@/components/shared/FilterBar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { exportToCsv, exportToXls } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { useContacts } from "@/hooks/use-contacts";
import { useEmployeesMap } from "@/hooks/use-employees-map";
import {
  useInvoicesByType, useDeleteInvoice, useConvertInvoice, useDuplicateInvoice,
  useInvoiceItems, useConvertSaleToCredit, useCashierSessions, type InvoiceType,
} from "@/hooks/use-invoices";
import { InvoiceDetailsModal } from "./InvoiceDetailsModal";
import { EditShippingModal } from "./EditShippingModal";
import { PrintableInvoice, type PrintMode } from "./PrintableInvoice";
import { InvoicePaymentsModal } from "./InvoicePaymentsModal";
import { InvoiceShareModal } from "./InvoiceShareModal";
import { ReturnFormModal } from "./ReturnFormModal";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";
import { useWarehouseContext } from "@/contexts/WarehouseContext";
import { useCan } from "@/lib/can";
import { printTableFromData } from "@/lib/print-table";

type Confirm = { kind: "delete" | "convert" | "to_credit"; id: string; messageKey: string } | null;

export function SalesListPage({ mode }: { mode: InvoiceType }) {
  const { t, dir } = useI18n();
  const { can } = useCan();
  const moduleKey = mode === "sale_return" ? "sales_returns" : "sales_invoices";
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #d1d5db" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #e5e7eb", padding: "10px 12px", color: "#374151" };

  const TITLES: Record<InvoiceType, { page: string; section: string; addTo: string; addLabel: string }> = {
    sale: { page: t("sales.titles.sale_page"), section: t("sales.titles.sale_section"), addTo: "/sales/add", addLabel: t("sales.actions.add") },
    draft: { page: t("sales.titles.draft_page"), section: t("sales.titles.draft_section"), addTo: "/sales/drafts-add", addLabel: t("sales.actions.add_draft") },
    quotation: { page: t("sales.titles.quotation_page"), section: t("sales.titles.quotation_section"), addTo: "/sales/quotations-add", addLabel: t("sales.actions.add_quotation") },
    sale_return: { page: t("sales.titles.return_page"), section: t("sales.titles.return_section"), addTo: "/sales/returns", addLabel: "—" },
  };

  const baseCols: ColumnDef[] = [
    { key: "opt", label: t("sales.cols.option"), visible: true },
    { key: "issue_date", label: t("sales.cols.date"), visible: true },
    { key: "invoice_number", label: t("sales.cols.invoice_no"), visible: true },
    { key: "customer", label: t("sales.cols.customer"), visible: true },
    { key: "phone", label: t("sales.cols.phone"), visible: true },
    { key: "payment_method", label: t("sales.cols.payment_method"), visible: true },
    { key: "payment_status", label: t("sales.cols.payment_status"), visible: true },
    { key: "total", label: t("sales.cols.amount"), visible: true },
    { key: "paid_amount", label: t("sales.cols.paid"), visible: true },
    { key: "due", label: t("sales.cols.due"), visible: true },
    { key: "shipping_status", label: t("sales.cols.shipping_status"), visible: true },
    { key: "qty", label: t("sales.cols.qty"), visible: true },
    { key: "added_by", label: t("sales.cols.added_by"), visible: true },
  ];

  const STATUS_LABEL: Record<string, string> = { paid: t("sales.status.paid"), unpaid: t("sales.status.unpaid"), partial: t("sales.status.partial") };
  const SHIP_LABEL: Record<string, string> = { pending: t("sales.ship.pending"), delivered: t("sales.ship.delivered"), shipped: t("sales.ship.shipped"), returned: t("sales.ship.returned") };

  const titles = TITLES[mode];
  const { data: rows = [] } = useInvoicesByType(mode);
  const { data: customers = [] } = useContacts("customer");
  const { data: empMap = {} } = useEmployeesMap();
  const del = useDeleteInvoice();
  const convert = useConvertInvoice();
  const duplicate = useDuplicateInvoice();
  const toCredit = useConvertSaleToCredit();
  const { data: sessions = [] } = useCashierSessions();
  const activeSession = (sessions as any[]).find((s: any) => s.status === 'open');

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState(baseCols);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const printRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editShipId, setEditShipId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>("invoice");
  const [pendingPrint, setPendingPrint] = useState(false);
  const [confirmAction, setConfirmAction] = useState<Confirm>(null);
  const [paymentsId, setPaymentsId] = useState<string | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);

  const viewingInvoice = useMemo(() => (rows as any[]).find((r) => r.id === viewingId) || null, [rows, viewingId]);
  const paymentsInvoice = useMemo(() => (rows as any[]).find((r) => r.id === paymentsId) || null, [rows, paymentsId]);
  const shareInvoice = useMemo(() => (rows as any[]).find((r) => r.id === shareId) || null, [rows, shareId]);
  const returnInvoice = useMemo(() => (rows as any[]).find((r) => r.id === returnId) || null, [rows, returnId]);
  const editShipInvoice = useMemo(() => (rows as any[]).find((r) => r.id === editShipId) || null, [rows, editShipId]);
  const printingInvoice = useMemo(() => (rows as any[]).find((r) => r.id === printingId) || null, [rows, printingId]);
  const { data: printItems = [] } = useInvoiceItems(printingId || undefined);

  useEffect(() => {
    const handler = () => { setPrintingId(null); setPendingPrint(false); };
    window.addEventListener("afterprint", handler);
    return () => window.removeEventListener("afterprint", handler);
  }, []);



  useEffect(() => setSelectedIdx(-1), [page, search, perPage]);

  useEffect(() => {
    if (!pendingPrint) return;
    if (!printingInvoice) return;
    if (!printingId) return;
    if (!printItems || (printItems as any[]).length === 0) return;
    const tm = setTimeout(() => {
      window.print();
      setPendingPrint(false);
    }, 100);
    return () => clearTimeout(tm);
  }, [pendingPrint, printingInvoice, printingId, printItems]);

  const triggerPrint = (id: string, m: PrintMode) => {
    setPrintMode(m);
    setPrintingId(id);
    setPendingPrint(true);
  };

  const navigate = useNavigate();
  const onEdit = (id: string) => navigate({ to: "/sales/edit/$id", params: { id } });

  const [filters, setFilters] = useState({ from: "", to: "", customer_id: "", payment_status: "", shipping_status: "", payment_method: "", source: "" });

  const custName = (id?: string | null, snapshot?: string | null) => {
    const c = (customers as any[]).find((x) => x.id === id);
    if (c) return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.business_name || c.contact_id;
    if (snapshot) return snapshot;
    return t("sales.filters.cash_customer");
  };
  const custPhone = (id?: string | null) => {
    const c = (customers as any[]).find((x) => x.id === id);
    return c?.mobile || c?.phone || "";
  };

  const { currentWarehouseId } = useWarehouseContext();

  const filtered = useMemo(() => (rows as any[]).filter((r) => {
    const cn = custName(r.customer_id, r.customer_name_snapshot);
    if (search && ![r.invoice_number, cn, r.payment_status].filter(Boolean).join(" ").includes(search)) return false;
    const d = (r.issue_date ?? "").slice(0, 10);
    const ff = (filters.from ?? "").slice(0, 10);
    const tt = (filters.to ?? "").slice(0, 10);
    if (ff && (!d || d < ff)) return false;
    if (tt && (!d || d > tt)) return false;
    if (filters.customer_id && r.customer_id !== filters.customer_id) return false;
    if (filters.payment_status && r.payment_status !== filters.payment_status) return false;
    if (filters.shipping_status && r.shipping_status !== filters.shipping_status) return false;
    if (filters.payment_method && r.payment_method !== filters.payment_method) return false;
    if (currentWarehouseId && r.warehouse_id !== currentWarehouseId) return false;
    return true;
  }), [rows, search, customers, filters, currentWarehouseId]);
  const { sorted, sort, setSort } = useTableSort(filtered as any);
  useEffect(() => setPage(1), [search, perPage, filters]);

  const filterFields: FilterField[] = [
    { type: "date", key: "from", label: t("sales.filters.from"), value: filters.from },
    { type: "date", key: "to", label: t("sales.filters.to"), value: filters.to },
    { type: "select", key: "customer_id", label: t("sales.filters.customer"), value: filters.customer_id, options: (customers as any[]).map((c) => ({ value: c.id, label: custName(c.id) })) },
    { type: "select", key: "payment_status", label: t("sales.cols.payment_status"), value: filters.payment_status, options: [
      { value: "paid", label: t("sales.status.paid") }, { value: "partial", label: t("sales.status.partial") }, { value: "unpaid", label: t("sales.status.unpaid") },
    ] },
    { type: "select", key: "shipping_status", label: t("sales.filters.shipping_status"), value: filters.shipping_status, options: [
      { value: "pending", label: t("sales.ship.pending") }, { value: "delivered", label: t("sales.ship.delivered") }, { value: "shipped", label: t("sales.ship.shipped") }, { value: "returned", label: t("sales.ship.returned") },
    ] },
    { type: "select", key: "payment_method", label: t("sales.cols.payment_method"), value: filters.payment_method, options: [
      { value: "cash", label: t("sales.pay.cash") }, { value: "transfer", label: t("sales.pay.bank") },
    ] },
  ];

  const pageSize = Number(perPage);
  const totalRows = sorted.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const from = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(totalRows, page * pageSize);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const visible = cols.filter((c) => c.visible);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => Math.min(pageRows.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pageRows.length]);

  const totalSum = sorted.reduce((s, r) => s + Number(r.total || 0), 0);
  const paidSum = sorted.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
  const dueSum = sorted.reduce((s, r) => s + Math.max(0, Number(r.total || 0) - Number(r.paid_amount || 0)), 0);

  const cellFor = (r: any, key: string) => {
    if (key === "customer") return custName(r.customer_id, r.customer_name_snapshot);
    if (key === "phone") return custPhone(r.customer_id);
    if (key === "payment_method") return r.payment_method === "cash" ? t("sales.pay.cash") : (r.payment_method || "—");
    if (key === "payment_status") {
      const label = STATUS_LABEL[r.payment_status] || "—";
      const colors: Record<string, [string, string]> = { paid: ["#dcfce7", "#065f46"], partial: ["#fef3c7", "#92400e"], unpaid: ["#fee2e2", "#991b1b"] };
      const [bg, fg] = colors[r.payment_status] || ["#f3f4f6", "#374151"];
      return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, backgroundColor: bg, color: fg, fontSize: 12, fontWeight: 600 }}>{label}</span>;
    }
    if (key === "invoice_number") {
      const rs = r.returned_status || "none";
      const flag = rs === "full"
        ? <span style={{ display: "inline-block", marginInlineStart: 6, padding: "1px 6px", borderRadius: 4, backgroundColor: "#fee2e2", color: "#991b1b", fontSize: 10, fontWeight: 600 }}>{t("sales.flags.full_return")}</span>
        : rs === "partial"
        ? <span style={{ display: "inline-block", marginInlineStart: 6, padding: "1px 6px", borderRadius: 4, backgroundColor: "#fef3c7", color: "#92400e", fontSize: 10, fontWeight: 600 }}>{t("sales.flags.partial_return")}</span>
        : null;
      return <span>{r.invoice_number}{flag}</span>;
    }
    if (key === "shipping_status") {
      const label = SHIP_LABEL[r.shipping_status] || "—";
      const colors: Record<string, [string, string]> = { delivered: ["#dcfce7", "#065f46"], shipped: ["#dbeafe", "#1e40af"], pending: ["#fef3c7", "#92400e"], cancelled: ["#fee2e2", "#991b1b"] };
      const [bg, fg] = colors[r.shipping_status] || ["#f3f4f6", "#374151"];
      return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, backgroundColor: bg, color: fg, fontSize: 12, fontWeight: 600 }}>{label}</span>;
    }
    if (key === "total" || key === "paid_amount") return `${Number(r[key] ?? 0).toFixed(2)} ج.م`;
    if (key === "due") return `${Math.max(0, Number(r.total || 0) - Number(r.paid_amount || 0)).toFixed(2)} ج.م`;
    if (key === "qty") return Number(r._total_qty ?? 0).toFixed(2);
    if (key === "issue_date") {
      const datePart = r.issue_date ? String(r.issue_date).slice(0, 10) : "";
      const timePart = r.created_at ? formatDateTime(r.created_at).slice(11) : "";
      return [datePart, timePart].filter(Boolean).join(" ");
    }
    if (key === "created_at") return formatDateTime(r[key]);
    if (key === "added_by") return r.created_by ? (empMap[r.created_by] ?? r.created_by_name_snapshot ?? "—") : (r.created_by_name_snapshot ?? "—");
    return r[key] ?? "";
  };

  const textCellFor = (r: any, key: string): string => {
    if (key === "customer") return custName(r.customer_id, r.customer_name_snapshot);
    if (key === "phone") return custPhone(r.customer_id);
    if (key === "payment_method") return r.payment_method === "cash" ? t("sales.pay.cash") : (r.payment_method || "—");
    if (key === "payment_status") return STATUS_LABEL[r.payment_status] || "—";
    if (key === "invoice_number") {
      const rs = r.returned_status || "none";
      const flag = rs === "full" ? ` (${t("sales.flags.full_return")})` : rs === "partial" ? ` (${t("sales.flags.partial_return")})` : "";
      return `${r.invoice_number || ""}${flag}`;
    }
    if (key === "shipping_status") return SHIP_LABEL[r.shipping_status] || "—";
    if (key === "total" || key === "paid_amount") return `${Number(r[key] ?? 0).toFixed(2)} ج.م`;
    if (key === "due") return `${Math.max(0, Number(r.total || 0) - Number(r.paid_amount || 0)).toFixed(2)} ج.م`;
    if (key === "qty") return Number(r._total_qty ?? 0).toFixed(2);
    if (key === "issue_date") {
      const datePart = r.issue_date ? String(r.issue_date).slice(0, 10) : "";
      const timePart = r.created_at ? formatDateTime(r.created_at).slice(11) : "";
      return [datePart, timePart].filter(Boolean).join(" ");
    }
    if (key === "added_by") return r.created_by ? (empMap[r.created_by] ?? r.created_by_name_snapshot ?? "—") : (r.created_by_name_snapshot ?? "—");
    return String(r[key] ?? "");
  };

  const printCols = visible.filter((c) => c.key !== "opt");
  const exportHeaders = printCols.map((c) => c.label);
  const exportRows = sorted.map((r) => printCols.map((c) => textCellFor(r, c.key)));

  const printFooter = printCols.map((c, i) => {
    if (c.key === "total") return `${totalSum.toFixed(2)} ج.م`;
    if (c.key === "paid_amount") return `${paidSum.toFixed(2)} ج.م`;
    if (c.key === "due") return `${dueSum.toFixed(2)} ج.م`;
    if (i === 0) return t("sales.report.total_label");
    return "";
  });

  const handlePrintTable = () => {
    printTableFromData({
      title: titles.section,
      subtitle: `${new Date().toLocaleString()} — ${totalRows} صف`,
      headers: exportHeaders,
      rows: exportRows,
      footer: printFooter,
    });
  };

  const renderActions = (r: any) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="h-8 px-3 inline-flex items-center gap-1 text-xs rounded text-white" style={{ backgroundColor: "#3b82f6" }}>
          {t("sales.actions.options")} <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setViewingId(r.id)}><Eye className="h-4 w-4 ms-2" /> {t("sales.actions.view")}</DropdownMenuItem>

        {mode === "draft" && (
          <>
            {can("sales_invoices", "create") && (
              <DropdownMenuItem onClick={() => setConfirmAction({ kind: "convert", id: r.id, messageKey: "sales.confirm.convert" })}>
                <ArrowRightLeft className="h-4 w-4 ms-2" /> {t("sales.actions.convert_to_invoice")}
              </DropdownMenuItem>
            )}
            {can("sales_invoices", "print") && (
              <DropdownMenuItem onClick={() => triggerPrint(r.id, "invoice")}><Printer className="h-4 w-4 ms-2" /> {t("sales.actions.print")}</DropdownMenuItem>
            )}
            {can("sales_invoices", "delete") && (
              <DropdownMenuItem onClick={() => setConfirmAction({ kind: "delete", id: r.id, messageKey: "sales.confirm.delete_draft" })} className="text-red-600">
                <Trash2 className="h-4 w-4 ms-2" /> {t("sales.actions.delete")}
              </DropdownMenuItem>
            )}
          </>
        )}

        {mode === "quotation" && (
          <>
            {can("sales_invoices", "print") && (
              <DropdownMenuItem onClick={() => triggerPrint(r.id, "invoice")}><Printer className="h-4 w-4 ms-2" /> {t("sales.actions.print")}</DropdownMenuItem>
            )}
            {can("sales_invoices", "create") && (
              <DropdownMenuItem onClick={() => setConfirmAction({ kind: "convert", id: r.id, messageKey: "sales.confirm.convert" })}>
                <ArrowRightLeft className="h-4 w-4 ms-2" /> {t("sales.actions.convert_to_invoice")}
              </DropdownMenuItem>
            )}
            {can("sales_invoices", "create") && (
              <DropdownMenuItem onClick={() => duplicate.mutate(r.id)}>
                <Copy className="h-4 w-4 ms-2" /> {t("sales.actions.duplicate_quotation")}
              </DropdownMenuItem>
            )}
            {can("sales_invoices", "delete") && (
              <DropdownMenuItem onClick={() => setConfirmAction({ kind: "delete", id: r.id, messageKey: "sales.confirm.delete_quotation" })} className="text-red-600">
                <Trash2 className="h-4 w-4 ms-2" /> {t("sales.actions.delete")}
              </DropdownMenuItem>
            )}
          </>
        )}

        {mode === "sale" && (
          <>
            {can("sales_invoices", "edit") && (
              <DropdownMenuItem onClick={() => onEdit(r.id)}><Pencil className="h-4 w-4 ms-2" /> {t("sales.actions.edit") || "تعديل"}</DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setPaymentsId(r.id)}><Wallet className="h-4 w-4 ms-2" /> {t("sales.actions.invoice_payments")}</DropdownMenuItem>
            {can("sales_invoices", "print") && (
              <DropdownMenuItem onClick={() => setShareId(r.id)}><Share2 className="h-4 w-4 ms-2" /> {t("sales.actions.share_link")}</DropdownMenuItem>
            )}
            {can("sales_returns", "create") && (
              <DropdownMenuItem onClick={() => setReturnId(r.id)}><RotateCcw className="h-4 w-4 ms-2" /> {t("sales.actions.create_return")}</DropdownMenuItem>
            )}
            {can("sales_invoices", "edit") && (
              <DropdownMenuItem onClick={() => setEditShipId(r.id)}><Truck className="h-4 w-4 ms-2" /> {t("sales.actions.edit_shipping")}</DropdownMenuItem>
            )}
            {can("sales_invoices", "print") && (
              <>
                <DropdownMenuItem onClick={() => triggerPrint(r.id, "invoice")}><Printer className="h-4 w-4 ms-2" /> {t("sales.actions.print_invoice")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => triggerPrint(r.id, "packaging")}><Package className="h-4 w-4 ms-2" /> {t("sales.actions.packaging")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => triggerPrint(r.id, "delivery")}><FileText className="h-4 w-4 ms-2" /> {t("sales.actions.delivery_note")}</DropdownMenuItem>
              </>
            )}
            {can("sales_invoices", "edit") && (r.payment_status === "paid" || r.payment_status === "partial") && (
              <DropdownMenuItem onClick={() => setConfirmAction({ kind: "to_credit", id: r.id, messageKey: "sales.confirm.to_credit" })}>
                <ArrowRightLeft className="h-4 w-4 ms-2" /> تحويل لآجل
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={titles.page} actions={
        can(moduleKey, "create") ? (
          <Link to={titles.addTo} className="h-9 px-4 rounded-md text-sm flex items-center gap-2 text-white" style={{ backgroundColor: "#6366f1" }}>
            <Plus className="h-4 w-4" /> {titles.addLabel}
          </Link>
        ) : null
      } />
      <DataCard className="border-gray-300">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold" style={{ color: "#374151" }}>{titles.section}</h3>
        </div>
        <FilterBar
          fields={filterFields}
          onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
          onReset={() => setFilters({ from: "", to: "", customer_id: "", payment_status: "", shipping_status: "", payment_method: "", source: "" })}
        />
        <TableToolbar
          search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={can(moduleKey, "print") ? () => exportToCsv(`${mode}.csv`, exportHeaders, exportRows) : undefined}
          onExportExcel={can(moduleKey, "print") ? () => exportToXls(`${mode}.xls`, exportHeaders, exportRows) : undefined}
          printRef={can(moduleKey, "print") ? printRef : undefined} printTitle={titles.section}
          onPrint={can(moduleKey, "print") ? handlePrintTable : undefined}
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))}
        />
        <div
          className="overflow-x-auto rounded-md print-table-area"
          ref={(el) => { tableRef.current = el; printRef.current = el; }}
          style={{ border: "1px solid #d1d5db" }}
        >
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
            <tbody>
              {pageRows.length === 0 ? <EmptyRow colSpan={visible.length} /> : pageRows.map((r: any, rowIdx: number) => {
                const rowBg: Record<string, string> = { paid: "#f0fdf4", partial: "#fffbeb", unpaid: "#fef2f2" };
                const isSelected = rowIdx === selectedIdx;
                const trStyle = {
                  backgroundColor: isSelected ? '#bfdbfe' : (rowBg[r.payment_status] || undefined),
                  outline: isSelected ? '2px solid #3b82f6' : undefined,
                  outlineOffset: isSelected ? '-2px' : undefined,
                  cursor: 'pointer',
                } as React.CSSProperties;
                return (
                <tr key={r.id} style={trStyle} onClick={() => setSelectedIdx(rowIdx)}>
                  {visible.map((c) => c.key === "opt" ? (
                    <td key={c.key} style={cellStyle} data-print-hide="1">{renderActions(r)}</td>
                  ) : <td key={c.key} style={cellStyle}>{cellFor(r, c.key)}</td>)}
                </tr>
                );
              })}
            </tbody>
            {pageRows.length > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: "#f3f4f6" }}>
                  <td colSpan={Math.max(1, visible.length - 4)} style={{ ...cellStyle, fontWeight: 700 }}>{t("sales.report.total_label")}</td>
                  <td style={{ ...cellStyle, fontWeight: 700 }}>{totalSum.toFixed(2)} ج.م</td>
                  <td style={{ ...cellStyle, fontWeight: 700 }}>{paidSum.toFixed(2)} ج.م</td>
                  <td style={{ ...cellStyle, fontWeight: 700 }}>{dueSum.toFixed(2)} ج.م</td>
                  <td colSpan={3} style={cellStyle}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <TableFooter from={from} to={to} total={totalRows} page={page} pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
      </DataCard>

      <InvoiceDetailsModal
        open={!!viewingInvoice}
        onOpenChange={(v) => !v && setViewingId(null)}
        invoice={viewingInvoice}
        customerName={viewingInvoice ? custName(viewingInvoice.customer_id, viewingInvoice.customer_name_snapshot) : ""}
        customerPhone={viewingInvoice ? custPhone(viewingInvoice.customer_id) : ""}
        onPrint={(m) => {
          const id = viewingInvoice?.id;
          if (!id) return;
          setViewingId(null);
          triggerPrint(id, m);
        }}
      />

      <EditShippingModal
        open={!!editShipInvoice}
        onOpenChange={(v) => !v && setEditShipId(null)}
        invoice={editShipInvoice}
      />

      <InvoicePaymentsModal
        open={!!paymentsInvoice}
        onOpenChange={(v) => !v && setPaymentsId(null)}
        invoice={paymentsInvoice}
      />

      <InvoiceShareModal
        open={!!shareInvoice}
        onOpenChange={(v) => !v && setShareId(null)}
        invoice={shareInvoice}
      />

      {returnInvoice?.id && (
        <ReturnFormModal
          open={!!returnInvoice}
          onOpenChange={(v) => !v && setReturnId(null)}
          original={returnInvoice}
          sessionId={activeSession?.id}
        />
      )}

      {printingInvoice && (
        <PrintableInvoice
          mode={printMode}
          invoice={printingInvoice}
          items={printItems as any[]}
          customerName={custName(printingInvoice.customer_id, printingInvoice.customer_name_snapshot)}
          customerPhone={custPhone(printingInvoice.customer_id)}
        />
      )}

      <AlertDialog open={!!confirmAction} onOpenChange={(v) => !v && setConfirmAction(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sales.confirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction ? t(confirmAction.messageKey) : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("sales.confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.kind === "delete") del.mutate(confirmAction.id);
                if (confirmAction.kind === "convert") convert.mutate(confirmAction.id);
                if (confirmAction.kind === "to_credit") {
                  const inv = (rows as any[]).find((x) => x.id === confirmAction.id);
                  if (!inv?.customer_id) {
                    toast.error("لا يمكن تحويل فاتورة بدون عميل إلى آجل. عدل الفاتورة وحدد العميل أولاً.");
                  } else {
                    toCredit.mutate({ invoiceId: confirmAction.id, customerId: inv.customer_id });
                  }
                }
                setConfirmAction(null);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {t("sales.confirm.ok")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
