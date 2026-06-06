import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/products/PageHeader";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { DataCard } from "@/components/products/DataCard";
import { Plus } from "lucide-react";
import { exportToCsv } from "@/lib/csv";
import { usePurchases, usePurchaseReturns, usePurchaseItemsOf } from "@/hooks/use-purchases";
import { useContacts } from "@/hooks/use-contacts";
import { useEmployeesMap } from "@/hooks/use-employees-map";
import { FilterBar, type FilterField } from "@/components/shared/FilterBar";
import { useI18n } from "@/lib/i18n";
import { PurchaseOptionsMenu, type PurchaseAction } from "@/components/purchases/PurchaseOptionsMenu";
import { PurchaseDetailsModal } from "@/components/purchases/PurchaseDetailsModal";
import { PurchasePaymentsModal } from "@/components/purchases/PurchasePaymentsModal";
import { AddPurchasePaymentModal } from "@/components/purchases/AddPurchasePaymentModal";
import { UpdateStatusModal } from "@/components/purchases/UpdateStatusModal";
import { PurchaseReturnModal } from "@/components/purchases/PurchaseReturnModal";
import { PrintablePurchase } from "@/components/purchases/PrintablePurchase";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTableSort } from "@/components/shared/useTableSort";
import { SortableHead } from "@/components/shared/SortableHead";
import { useWarehouseContext } from "@/contexts/WarehouseContext";
import { formatDateTime } from "@/lib/format";
import { useCan } from "@/lib/can";

export const Route = createFileRoute("/_authenticated/purchases/all")({
  component: AllPurchasesPage,
});

function AllPurchasesPage() {
  const { t, dir } = useI18n();
  const { can } = useCan();
  const navigate = useNavigate();
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151" };

  const cols0: ColumnDef[] = useMemo(() => ([
    { key: "opt", label: "خيارات", visible: true },
    { key: "purchase_date", label: t("purchases.table.date"), visible: true },
    { key: "ref_no", label: t("purchases.table.ref"), visible: true },
    { key: "return_flag", label: "حالة المرتجع", visible: true },
    { key: "supplier", label: t("purchases.table.supplier"), visible: true },
    { key: "status", label: t("purchases.table.status"), visible: true },
    { key: "payment_status", label: t("purchases.table.payment_status"), visible: true },
    { key: "total", label: t("purchases.table.total"), visible: true },
    { key: "due_amount", label: t("purchases.table.due"), visible: true },
    { key: "added_by", label: t("purchases.table.added_by"), visible: true },
  ]), [t]);

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState<ColumnDef[]>(cols0);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  useEffect(() => { setCols((prev) => prev.map((c, i) => ({ ...c, label: cols0[i]?.label ?? c.label }))); }, [cols0]);
  const printRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const { data: rows = [] } = usePurchases();
  const { data: empMap = {} } = useEmployeesMap();
  const { data: returns = [] } = usePurchaseReturns();
  const { data: suppliers = [] } = useContacts("supplier");
  

  const [filters, setFilters] = useState({ from: "", to: "", branch_id: "", payment_status: "", supplier_id: "" });

  // Modal state
  const [active, setActive] = useState<any | null>(null);
  const [openDetails, setOpenDetails] = useState(false);
  const [openPayments, setOpenPayments] = useState(false);
  const [openAddPayment, setOpenAddPayment] = useState(false);
  const [openStatus, setOpenStatus] = useState(false);
  const [openReturn, setOpenReturn] = useState(false);
  
  const [printingId, setPrintingId] = useState<string | null>(null);
  const printingRef = useRef<HTMLDivElement>(null);
  const { data: printItems = [] } = usePurchaseItemsOf(printingId || undefined);

  const supName = (id?: string | null, snapshot?: string | null) => {
    const s = (suppliers as any[]).find((x) => x.id === id);
    if (s) return [s.first_name, s.last_name].filter(Boolean).join(" ") || s.business_name || s.contact_id || "";
    return snapshot || "";
  };

  // Trigger actual print once items are loaded
  useEffect(() => {
    if (!printingId || !active || (printItems as any[]).length === 0) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w || !printingRef.current) { setPrintingId(null); return; }
    w.document.write(`<html><head><title>طباعة</title><meta charset="utf-8"/></head><body>${printingRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); setPrintingId(null); }, 250);
  }, [printingId, printItems, active]);

  const handleAction = async (r: any, a: PurchaseAction) => {
    setActive(r);
    switch (a) {
      case "inspect": setOpenDetails(true); break;
      case "edit": navigate({ to: "/purchases/edit/$id", params: { id: r.id } }); break;
      case "print": setPrintingId(r.id); break;
      case "labels": navigate({ to: "/products/print-labels", search: { purchase: r.id } as any }); break;
      case "payments": setOpenPayments(true); break;
      case "add_payment": setOpenAddPayment(true); break;
      case "return": setOpenReturn(true); break;
      case "status": setOpenStatus(true); break;
    }
  };

  const { currentWarehouseId } = useWarehouseContext();
  const filtered = useMemo(() => (rows as any[]).filter((r) => {
    if (search && ![r.ref_no, supName(r.supplier_id, r.supplier_name_snapshot), r.status].filter(Boolean).join(" ").includes(search)) return false;
    const d = ((r.purchase_date || r.issue_date) ?? "").slice(0, 10);
    const ff = (filters.from ?? "").slice(0, 10);
    const tt = (filters.to ?? "").slice(0, 10);
    if (ff && (!d || d < ff)) return false;
    if (tt && (!d || d > tt)) return false;
    if (filters.branch_id && r.branch_id !== filters.branch_id) return false;
    if (filters.payment_status && r.payment_status !== filters.payment_status) return false;
    if (filters.supplier_id && r.supplier_id !== filters.supplier_id) return false;
    if (currentWarehouseId && r.warehouse_id !== currentWarehouseId) return false;
    return true;
  }), [rows, search, suppliers, filters, currentWarehouseId]);
  const { sorted, sort, setSort } = useTableSort(filtered as any);
  useEffect(() => setPage(1), [search, perPage, filters]);



  useEffect(() => setSelectedIdx(-1), [page, search, perPage]);

  const filterFields: FilterField[] = [
    { type: "date", key: "from", label: t("purchases.filters.from"), value: filters.from },
    { type: "date", key: "to", label: t("purchases.filters.to"), value: filters.to },
    { type: "select", key: "payment_status", label: t("purchases.table.payment_status"), value: filters.payment_status, options: [
      { value: "paid", label: t("purchases.pay_status.paid") },
      { value: "partial", label: t("purchases.pay_status.partial") },
      { value: "pending", label: t("purchases.pay_status.pending") },
    ] },
    { type: "select", key: "supplier_id", label: t("purchases.table.supplier"), value: filters.supplier_id, options: (suppliers as any[]).map((s) => ({ value: s.id, label: supName(s.id) || s.contact_id || "—" })) },
  ];
  const pageSize = Number(perPage);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const fromN = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toN = Math.min(total, page * pageSize);
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
  const dueSum = sorted.reduce((s, r) => s + Number(r.due_amount || 0), 0);
  const returnsSum = (returns as any[]).reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const returnedPurchaseIds = useMemo(() => new Set((returns as any[]).map((r) => r.purchase_id).filter(Boolean)), [returns]);

  const cur = t("purchases.currency");
  const fmtMoney = (n: number) => `${n.toFixed(2)} ${cur}`;
  const statusLabel = (s?: string) => {
    const map: Record<string, string> = {
      "استلم": t("purchases.status.received"), "قيد الانتظار": t("purchases.status.pending"), "تم الطلب": t("purchases.status.ordered"),
      received: t("purchases.status.received"), pending: t("purchases.status.pending"), ordered: t("purchases.status.ordered"),
    };
    return s ? (map[s] ?? s) : "";
  };
  const payStatusLabel = (s?: string) => {
    const map: Record<string, string> = { paid: t("purchases.pay_status.paid"), partial: t("purchases.pay_status.partial"), pending: t("purchases.pay_status.pending") };
    return s ? (map[s] ?? s) : "";
  };

  const Badge = ({ value, tone }: { value: string; tone: "green" | "amber" | "red" | "blue" }) => {
    const tones: Record<string, string> = { green: "#10b981", amber: "#f59e0b", red: "#ef4444", blue: "#3b82f6" };
    return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, color: "#fff", fontSize: 12, backgroundColor: tones[tone] }}>{value}</span>;
  };

  const cellFor = (r: any, key: string) => {
    if (key === "supplier") return supName(r.supplier_id, r.supplier_name_snapshot);
    if (key === "return_flag") return returnedPurchaseIds.has(r.id) ? <Badge value="تم عمل مرتجع" tone="amber" /> : "—";
    if (key === "status") return <Badge value={statusLabel(r.status)} tone="green" />;
    if (key === "payment_status") {
      const tone = r.payment_status === "paid" ? "green" : r.payment_status === "partial" ? "amber" : "red";
      return <Badge value={payStatusLabel(r.payment_status)} tone={tone as any} />;
    }
    if (key === "total" || key === "due_amount") return fmtMoney(Number(r[key] ?? 0));
    if (key === "purchase_date" || key === "issue_date") return formatDateTime(r.created_at || r[key]);
    if (key === "created_at") return formatDateTime(r[key]);
    if (key === "added_by") return r.created_by ? (empMap[r.created_by] ?? r.created_by_name_snapshot ?? "—") : (r.created_by_name_snapshot ?? "—");
    return r[key] ?? "";
  };

  const exportCsv = (n: string) =>
    exportToCsv(n, visible.filter((c) => c.key !== "opt").map((c) => c.label),
      sorted.map((r) => visible.filter((c) => c.key !== "opt").map((c) => {
        const v = cellFor(r, c.key);
        if (c.key === "return_flag") return returnedPurchaseIds.has(r.id) ? "تم عمل مرتجع" : "";
        return typeof v === "string" ? v : (r[c.key] ?? "");
      })));

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("purchases.page.all_title")} actions={
        can("purchase_invoices", "create") ? (
          <Link to="/purchases/add" className="h-9 px-4 rounded-md text-sm flex items-center gap-2 text-white" style={{ backgroundColor: "#6366f1" }}>
            <Plus className="h-4 w-4" /> {t("purchases.actions.add")}
          </Link>
        ) : null
      } />
      <DataCard>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold" style={{ color: "#374151" }}>{t("purchases.page.all_section")}</h3>
        </div>
        <FilterBar
          fields={filterFields}
          onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
          onReset={() => setFilters({ from: "", to: "", branch_id: "", payment_status: "", supplier_id: "" })}
        />
        <TableToolbar search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
          onExportCsv={can("purchase_invoices", "print") ? () => exportCsv("purchases.csv") : undefined}
          onExportExcel={can("purchase_invoices", "print") ? () => exportCsv("purchases.xls") : undefined}
          printRef={can("purchase_invoices", "print") ? printRef : undefined} printTitle="purchases"
          columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))} />
        <div className="overflow-x-auto" ref={tableRef}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} /></thead>
            <tbody>
              {pageRows.length === 0 ? <EmptyRow colSpan={visible.length} /> : pageRows.map((r: any, rowIdx: number) => {
                const rowBg: Record<string, string> = { paid: "#f0fdf4", partial: "#fffbeb", pending: "#fef2f2", unpaid: "#fef2f2" };
                const bg = rowBg[r.payment_status as string] || undefined;
                const isSelected = rowIdx === selectedIdx;
                return (
                  <tr
                    key={r.id}
                    style={{
                      backgroundColor: isSelected ? '#bfdbfe' : bg,
                      outline: isSelected ? '2px solid #3b82f6' : undefined,
                      outlineOffset: isSelected ? '-2px' : undefined,
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedIdx(rowIdx)}
                  >
                    {visible.map((c) => c.key === "opt" ? (
                      <td key={c.key} style={cellStyle}>
                        <PurchaseOptionsMenu onAction={(a) => handleAction(r, a)} />
                      </td>
                    ) : <td key={c.key} style={cellStyle}>{cellFor(r, c.key)}</td>)}
                  </tr>
                );
              })}

            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <td colSpan={Math.max(1, visible.length - 2)} style={{ ...cellStyle, fontWeight: 700 }}>{t("purchases.totals.label")}</td>
                <td style={{ ...cellStyle, fontWeight: 700 }}>{fmtMoney(totalSum)}</td>
                <td style={{ ...cellStyle, fontWeight: 700 }}>
                  <div>{t("purchases.totals.supplier_debts", { amount: fmtMoney(dueSum) })}</div>
                  <div>{t("purchases.totals.returns", { amount: fmtMoney(returnsSum) })}</div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <TableFooter from={fromN} to={toN} total={total} page={page} pageCount={pageCount}
          onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
      </DataCard>

      <PurchaseDetailsModal open={openDetails} onOpenChange={setOpenDetails} purchase={active} supplierName={supName(active?.supplier_id, active?.supplier_name_snapshot)} />
      <PurchasePaymentsModal open={openPayments} onOpenChange={setOpenPayments} purchase={active} supplierName={supName(active?.supplier_id, active?.supplier_name_snapshot)} />
      <AddPurchasePaymentModal open={openAddPayment} onOpenChange={setOpenAddPayment} purchase={active} supplierName={supName(active?.supplier_id, active?.supplier_name_snapshot)} />
      <UpdateStatusModal open={openStatus} onOpenChange={setOpenStatus} purchase={active} />
      <PurchaseReturnModal open={openReturn} onOpenChange={setOpenReturn} purchase={active} supplierName={supName(active?.supplier_id, active?.supplier_name_snapshot)} />

      {typeof document !== "undefined" && active && printingId && createPortal(
        <div style={{ position: "fixed", left: -10000, top: 0 }}>
          <div ref={printingRef}>
            <PrintablePurchase purchase={active} items={printItems as any[]} supplierName={supName(active.supplier_id, active.supplier_name_snapshot)} />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
