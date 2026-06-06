import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { DataCard } from "@/components/products/DataCard";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { exportToCsv } from "@/lib/csv";
import { ClipboardList, Truck } from "lucide-react";

type Inv = {
  id: string;
  invoice_number: string;
  issue_date: string;
  status: string;
  shipping_status: string;
  payment_status: string;
  total: number;
  paid_amount: number;
  customer_id: string | null;
  created_by: string | null;
};

const STATUS_AR: Record<string, string> = {
  draft: "مسودة",
  pending: "معلقة",
  completed: "مكتملة",
  final: "نهائية",
};
const SHIP_AR: Record<string, string> = {
  pending: "معلق",
  shipped: "تم الشحن",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
};
const PAY_AR: Record<string, string> = {
  paid: "مدفوعة",
  partial: "جزئية",
  unpaid: "غير مدفوعة",
};

function useDashboardData() {
  const { user } = useAuth();
  const ownerId = useOwnerId();

  const invoices = useQuery({
    queryKey: ["dashboard-pending-invoices", ownerId],
    enabled: !!user && !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, issue_date, status, shipping_status, payment_status, total, paid_amount, customer_id, created_by, created_by_name_snapshot, type")
        .eq("owner_id", ownerId!)
        .eq("type", "sale")
        .order("issue_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const contacts = useQuery({
    queryKey: ["dashboard-contacts-min", ownerId],
    enabled: !!user && !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, business_name, mobile")
        .eq("owner_id", ownerId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const employees = useQuery({
    queryKey: ["dashboard-employees-min", ownerId],
    enabled: !!user && !!ownerId,
    queryFn: async () => {
      const { data } = await (supabase.from("employees") as any)
        .select("id, name, email")
        .eq("admin_id", ownerId!);
      return (data ?? []) as any[];
    },
  });

  return { invoices, contacts, employees };
}

function buildMaps(contacts: any[] | undefined, employees: any[] | undefined) {
  const cMap = new Map<string, { name: string; mobile: string }>();
  for (const c of contacts ?? []) {
    const name = (`${c.first_name || ""} ${c.last_name || ""}`.trim()) || c.business_name || "—";
    cMap.set(c.id, { name, mobile: c.mobile || "" });
  }
  const eMap = new Map<string, string>();
  for (const e of employees ?? []) eMap.set(e.id, e.name || e.email || "—");
  return { cMap, eMap };
}

export function PendingOrdersTable() {
  const { invoices, contacts, employees } = useDashboardData();
  const { cMap, eMap } = useMemo(() => buildMaps(contacts.data, employees.data), [contacts.data, employees.data]);

  const initialCols: ColumnDef[] = [
    { key: "invoice_number", label: "رقم الطلب", visible: true },
    { key: "customer", label: "اسم العميل", visible: true },
    { key: "mobile", label: "رقم الاتصال", visible: true },
    { key: "shipping_status", label: "حالة الشحن والتوصيل", visible: true },
    { key: "status", label: "الحالة", visible: true },
    { key: "remaining", label: "المبلغ المتبقي", visible: true },
    { key: "added_by", label: "أضيفت بواسطة", visible: true },
    { key: "issue_date", label: "تاريخ", visible: true },
  ];

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState(initialCols);
  const printRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    return (invoices.data ?? [])
      .filter((i: Inv) => i.shipping_status !== "delivered" || i.payment_status !== "paid")
      .map((i: Inv) => {
        const c = i.customer_id ? cMap.get(i.customer_id) : undefined;
        return {
          id: i.id,
          invoice_number: i.invoice_number,
          customer: c?.name || "—",
          mobile: c?.mobile || "—",
          shipping_status: SHIP_AR[i.shipping_status] || i.shipping_status,
          status: STATUS_AR[i.status] || i.status,
          remaining: (Number(i.total || 0) - Number(i.paid_amount || 0)).toFixed(2),
          added_by: i.created_by ? (eMap.get(i.created_by) || (i as any).created_by_name_snapshot || "المالك") : ((i as any).created_by_name_snapshot || "المالك"),
          issue_date: i.issue_date,
        };
      });
  }, [invoices.data, cMap, eMap]);

  const filtered = useMemo(
    () => rows.filter((r) => !search || `${r.invoice_number} ${r.customer} ${r.mobile}`.includes(search)),
    [rows, search]
  );

  const pageSize = Number(perPage);
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const visible = cols.filter((c) => c.visible);

  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, fontSize: 13, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap", textAlign: "right" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151", whiteSpace: "nowrap", textAlign: "right" };

  const exportCsv = (n: string) =>
    exportToCsv(n, visible.map((c) => c.label), filtered.map((r: any) => visible.map((c) => r[c.key])));

  return (
    <DataCard>
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <ClipboardList className="h-5 w-5" style={{ color: "#f59e0b" }} />
        <h3 className="text-base font-bold" style={{ color: "#111827" }}>الطلبيات</h3>
      </div>
      <TableToolbar
        search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
        onExportCsv={() => exportCsv("orders.csv")} onExportExcel={() => exportCsv("orders.xls")}
        printRef={printRef} printTitle="orders"
        columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))}
      />
      <div className="overflow-x-auto" ref={printRef}>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>{visible.map((c) => <th key={c.key} style={headStyle}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? <EmptyRow colSpan={visible.length} /> : pageRows.map((r: any) => (
              <tr key={r.id}>
                {visible.map((c) => <td key={c.key} style={cellStyle}>{r[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TableFooter from={from} to={to} total={total} page={page} pageCount={pageCount}
        onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
    </DataCard>
  );
}

export function PendingShipmentsTable() {
  const { invoices, contacts, employees } = useDashboardData();
  const { cMap } = useMemo(() => buildMaps(contacts.data, employees.data), [contacts.data, employees.data]);

  const initialCols: ColumnDef[] = [
    { key: "invoice_number", label: "الفاتورة رقم.", visible: true },
    { key: "customer", label: "اسم العميل", visible: true },
    { key: "mobile", label: "رقم الاتصال", visible: true },
    { key: "shipping_status", label: "حالة الشحن والتوصيل", visible: true },
    { key: "payment_status", label: "حالة الدفع", visible: true },
    { key: "issue_date", label: "تاريخ", visible: true },
  ];

  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState(initialCols);
  const printRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    return (invoices.data ?? [])
      .filter((i: Inv) => i.shipping_status === "pending" || i.shipping_status === "shipped")
      .map((i: Inv) => {
        const c = i.customer_id ? cMap.get(i.customer_id) : undefined;
        return {
          id: i.id,
          invoice_number: i.invoice_number,
          customer: c?.name || "—",
          mobile: c?.mobile || "—",
          shipping_status: SHIP_AR[i.shipping_status] || i.shipping_status,
          payment_status: PAY_AR[i.payment_status] || i.payment_status,
          issue_date: i.issue_date,
        };
      });
  }, [invoices.data, cMap]);

  const filtered = useMemo(
    () => rows.filter((r) => !search || `${r.invoice_number} ${r.customer} ${r.mobile}`.includes(search)),
    [rows, search]
  );

  const pageSize = Number(perPage);
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const visible = cols.filter((c) => c.visible);

  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, fontSize: 13, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap", textAlign: "right" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151", whiteSpace: "nowrap", textAlign: "right" };

  const exportCsv = (n: string) =>
    exportToCsv(n, visible.map((c) => c.label), filtered.map((r: any) => visible.map((c) => r[c.key])));

  return (
    <DataCard>
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <Truck className="h-5 w-5" style={{ color: "#f59e0b" }} />
        <h3 className="text-base font-bold" style={{ color: "#111827" }}>الشحنات المعلقة</h3>
      </div>
      <TableToolbar
        search={search} onSearchChange={setSearch} perPage={perPage} onPerPageChange={setPerPage}
        onExportCsv={() => exportCsv("pending-shipments.csv")} onExportExcel={() => exportCsv("pending-shipments.xls")}
        printRef={printRef} printTitle="pending-shipments"
        columns={cols} onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))}
      />
      <div className="overflow-x-auto" ref={printRef}>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>{visible.map((c) => <th key={c.key} style={headStyle}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? <EmptyRow colSpan={visible.length} /> : pageRows.map((r: any) => (
              <tr key={r.id}>
                {visible.map((c) => <td key={c.key} style={cellStyle}>{r[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TableFooter from={from} to={to} total={total} page={page} pageCount={pageCount}
        onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
    </DataCard>
  );
}
