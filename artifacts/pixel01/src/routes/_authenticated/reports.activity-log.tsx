import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/products/PageHeader";
import { ReportTable } from "@/components/reports/ReportTable";
import type { ColumnDef } from "@/components/products/TableToolbar";
import { useI18n } from "@/lib/i18n";
import { InvoiceDetailsModal } from "@/components/sales/InvoiceDetailsModal";
import { useInvoicePrint } from "@/hooks/use-invoice-print";
import { PurchaseDetailsModal } from "@/components/purchases/PurchaseDetailsModal";

export const Route = createFileRoute("/_authenticated/reports/activity-log")({
  validateSearch: (raw: Record<string, unknown>) => ({
    employee: typeof raw.employee === "string" ? raw.employee : "",
  }),
  component: ActivityLogPage,
});

const ACTION_LABELS: Record<string, { ar: string; en: string }> = {
  invoice_created: { ar: "إنشاء فاتورة بيع", en: "Sale invoice created" },
  invoice_updated: { ar: "تعديل فاتورة بيع", en: "Sale invoice updated" },
  invoice_deleted: { ar: "حذف فاتورة بيع", en: "Sale invoice deleted" },
  return_created: { ar: "إنشاء مرتجع", en: "Return created" },
  return_updated: { ar: "تعديل مرتجع", en: "Return updated" },
  return_deleted: { ar: "حذف مرتجع", en: "Return deleted" },
  purchase_created: { ar: "إنشاء فاتورة شراء", en: "Purchase created" },
  purchase_updated: { ar: "تعديل فاتورة شراء", en: "Purchase updated" },
  purchase_deleted: { ar: "حذف فاتورة شراء", en: "Purchase deleted" },
  expense_created: { ar: "إنشاء مصروف", en: "Expense created" },
  expense_updated: { ar: "تعديل مصروف", en: "Expense updated" },
  expense_deleted: { ar: "حذف مصروف", en: "Expense deleted" },
  payment_received: { ar: "تحصيل دفعة", en: "Payment received" },
  payment_paid: { ar: "دفع دفعة", en: "Payment paid" },
  login: { ar: "تسجيل دخول", en: "Login" },
  logout: { ar: "تسجيل خروج", en: "Logout" },
};


function formatDetails(actionType: string, details: any, isAr: boolean): string {
  if (details == null || details === "") return "—";
  if (typeof details === "string") return details;
  if (typeof details !== "object") return String(details);

  const d = details as Record<string, any>;
  const tr = (ar: string, en: string) => (isAr ? ar : en);

  const dirMap: Record<string, string> = {
    in: tr("وارد", "in"),
    out: tr("صادر", "out"),
  };
  const ctMap: Record<string, string> = {
    customer: tr("عميل", "customer"),
    supplier: tr("مورد", "supplier"),
  };
  const keyMap: Record<string, string> = {
    total: tr("الإجمالي", "Total"),
    amount: tr("المبلغ", "Amount"),
    direction: tr("الاتجاه", "Direction"),
    contact_type: tr("نوع الجهة", "Contact"),
    category: tr("التصنيف", "Category"),
    qty: tr("الكمية", "Qty"),
    discount: tr("الخصم", "Discount"),
    note: tr("ملاحظة", "Note"),
    reference: tr("المرجع", "Ref"),
    method: tr("الطريقة", "Method"),
  };

  // Specialized phrasings
  if (actionType === "payment_received" && d.amount != null) {
    const who = ctMap[d.contact_type] || d.contact_type || tr("عميل", "customer");
    return tr(`تحصيل ${d.amount} من ${who}`, `Received ${d.amount} from ${who}`);
  }
  if (actionType === "payment_paid" && d.amount != null) {
    const who = ctMap[d.contact_type] || d.contact_type || tr("مورد", "supplier");
    return tr(`دفع ${d.amount} إلى ${who}`, `Paid ${d.amount} to ${who}`);
  }
  if (actionType.startsWith("return_") && d.total != null) {
    return tr(`بقيمة ${d.total} ج.م`, `Amount: ${d.total} EGP`);
  }


  const parts: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v == null || v === "") continue;
    const label = keyMap[k] || k;
    let val: string;
    if (k === "direction") val = dirMap[v] || String(v);
    else if (k === "contact_type") val = ctMap[v] || String(v);
    else if (typeof v === "object") val = JSON.stringify(v);
    else val = String(v);
    parts.push(`${label}: ${val}`);
  }
  return parts.length ? parts.join(" — ") : "—";
}

function ActivityLogPage() {
  const search = Route.useSearch();
  const { user } = useAuth();
  const { t, dir, lang } = useI18n();
  const isAr = lang === "ar";
  const locale = isAr ? "ar-EG" : "en-US";
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState(search.employee || "");
  const [excludeAuth, setExcludeAuth] = useState(true);
  useEffect(() => {
    if (search.employee) setEmployeeFilter(search.employee);
  }, [search.employee]);

  const [viewInvoice, setViewInvoice] = useState<any | null>(null);
  const [viewPurchase, setViewPurchase] = useState<any | null>(null);
  const { onModalPrint, printNode } = useInvoicePrint({
    customerName: (inv) => inv?.customer_name_snapshot ?? "",
  });


  const { data: logs = [] } = useQuery({
    queryKey: ["activity_log", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["activity_log_employees", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_admin_employees");
      return data || [];
    },
  });

  const empMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees as any[]) m.set(e.id, e.name || e.email);
    return m;
  }, [employees]);

  const cols: ColumnDef[] = [
    { key: "created_at", label: isAr ? "التاريخ والوقت" : "Date & Time", visible: true },
    { key: "actor", label: isAr ? "الموظف" : "Employee", visible: true },
    { key: "action", label: isAr ? "النشاط" : "Action", visible: true },
    { key: "subject", label: isAr ? "العنصر" : "Subject", visible: true },
    { key: "details", label: isAr ? "التفاصيل" : "Details", visible: true },
    { key: "ip", label: "IP", visible: false },
  ];

  const rows = useMemo(() => {
    return (logs as any[])
      .filter((l) => {
        if (excludeAuth && ["sign_in", "sign_out", "login", "logout"].includes(l.action_type)) return false;
        if (actionFilter && l.action_type !== actionFilter) return false;
        if (employeeFilter && l.employee_id !== employeeFilter) return false;
        if (fromDate && new Date(l.created_at) < new Date(fromDate)) return false;
        if (toDate) {
          const end = new Date(toDate);
          end.setDate(end.getDate() + 1);
          if (new Date(l.created_at) > end) return false;
        }
        return true;
      })

      .map((l) => {
        const lbl = ACTION_LABELS[l.action_type];
        return {
          id: l.id,
          created_at: new Date(l.created_at).toLocaleString(locale),
          actor: l.actor_name || (l.employee_id ? empMap.get(l.employee_id) : null) || (isAr ? "المالك" : "Owner"),
          action: lbl ? (isAr ? lbl.ar : lbl.en) : l.action_type,
          action_type: l.action_type,
          subject: l.subject_label || "—",
          subject_id: l.subject_id,
          subject_type: l.subject_type,
          details: formatDetails(l.action_type, l.details, isAr),
          ip: l.ip_address || "—",
        };
      });
  }, [logs, empMap, locale, isAr, actionFilter, employeeFilter, fromDate, toDate, excludeAuth]);

  const inputStyle: React.CSSProperties = { border: "1px solid #d1d5db", backgroundColor: "#fff", borderRadius: 6, padding: "6px 10px", fontSize: 13, height: 36 };

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={isAr ? "سجل نشاطات الموظفين" : "Employee activity log"} />

      <div className="rounded-md p-3" style={{ border: "1px solid #e5e7eb", backgroundColor: "#fff" }}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label style={{ fontSize: 12, color: "#374151", display: "block", marginBottom: 4 }}>{isAr ? "من تاريخ" : "From"}</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#374151", display: "block", marginBottom: 4 }}>{isAr ? "إلى تاريخ" : "To"}</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#374151", display: "block", marginBottom: 4 }}>{isAr ? "الموظف" : "Employee"}</label>
            <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
              <option value="">{isAr ? "الكل" : "All"}</option>
              {(employees as any[]).map((e) => (
                <option key={e.id} value={e.id}>{e.name || e.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#374151", display: "block", marginBottom: 4 }}>{isAr ? "نوع النشاط" : "Action"}</label>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
              <option value="">{isAr ? "الكل" : "All"}</option>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{isAr ? v.ar : v.en}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm mt-3 cursor-pointer" style={{ color: "#374151" }}>
          <input type="checkbox" checked={excludeAuth} onChange={(e) => setExcludeAuth(e.target.checked)} />
          {isAr ? "إخفاء تسجيل الدخول والخروج" : "Exclude sign in and sign out"}
        </label>
      </div>


      <ReportTable
        rows={rows}
        initialCols={cols}
        rowKey={(r) => r.id}
        searchFields={(r) => `${r.actor} ${r.action} ${r.subject} ${r.details}`}
        cellFor={(r, k) => {
          const row = r as any;
          if (k === "subject" && row.subject_id) {
            const isInvoice =
              row.subject_type === "invoice" || String(row.action_type || "").includes("invoice");
            const isPurchase =
              row.subject_type === "purchase" || String(row.action_type || "").startsWith("purchase_");
            if (isInvoice) {
              return (
                <button
                  type="button"
                  onClick={async () => {
                    const { data } = await supabase.from("invoices").select("*").eq("id", row.subject_id).maybeSingle();
                    if (data) setViewInvoice(data);
                  }}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#2563eb", textDecoration: "underline", font: "inherit" }}
                >
                  {row.subject}
                </button>
              );
            }
            if (isPurchase) {
              return (
                <button
                  type="button"
                  onClick={async () => {
                    const { data } = await supabase.from("purchases").select("*").eq("id", row.subject_id).maybeSingle();
                    if (data) setViewPurchase(data);
                  }}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#2563eb", textDecoration: "underline", font: "inherit" }}
                >
                  {row.subject}
                </button>
              );
            }
          }
          return row[k];
        }}
        numericKeys={[]}
        exportName="activity-log"
        printTitle="activity-log"
      />
      <InvoiceDetailsModal
        open={!!viewInvoice}
        onOpenChange={(v) => !v && setViewInvoice(null)}
        invoice={viewInvoice}
        customerName={viewInvoice?.customer_name_snapshot || ""}
        onPrint={viewInvoice ? onModalPrint(viewInvoice, () => setViewInvoice(null)) : () => {}}
      />
      {printNode}
      <PurchaseDetailsModal
        open={!!viewPurchase}
        onOpenChange={(v) => !v && setViewPurchase(null)}
        purchase={viewPurchase}
        supplierName={viewPurchase?.supplier_name_snapshot || ""}
      />
    </div>
  );
}
