import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { useSoftDeletes, useRestoreSoftDelete, usePurgeSoftDelete } from "@/hooks/use-soft-deletes";
import { useEmployeesMap } from "@/hooks/use-employees-map";
import { RotateCcw, Trash2, Search, ChevronDown, ChevronRight, ChevronUp, Clock, User, Package, FileText, Tag, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/deleted-records")({
  component: DeletedRecordsPage,
});

const ENTITY_LABELS: Record<string, { ar: string; en: string }> = {
  contact: { ar: "جهة اتصال", en: "Contact" },
  product: { ar: "صنف", en: "Product" },
  invoice: { ar: "فاتورة", en: "Invoice" },
  purchase: { ar: "مشتريات", en: "Purchase" },
  expense: { ar: "مصروف", en: "Expense" },
  employee: { ar: "موظف", en: "Employee" },
  category: { ar: "تصنيف", en: "Category" },
  brand: { ar: "ماركة", en: "Brand" },
  cashier_removed_item: { ar: "صنف ملغى من الكاشير", en: "Cashier removed item" },
};

// Type badge colors
const TYPE_BADGE: Record<string, { bg: string; fg: string }> = {
  cashier_removed_item: { bg: "#fef3c7", fg: "#92400e" },
  product: { bg: "#e0e7ff", fg: "#3730a3" },
  invoice: { bg: "#dbeafe", fg: "#1e40af" },
  purchase: { bg: "#ede9fe", fg: "#5b21b6" },
  contact: { bg: "#ccfbf1", fg: "#115e59" },
  expense: { bg: "#ffe4e6", fg: "#9f1239" },
  employee: { bg: "#f3e8ff", fg: "#6b21a8" },
  category: { bg: "#f1f5f9", fg: "#334155" },
  brand: { bg: "#f1f5f9", fg: "#334155" },
};

// Entity types that are activity logs (not restorable records)
const LOG_ONLY = new Set(["cashier_removed_item"]);

const HIDDEN_FIELDS = new Set([
  "id", "owner_id", "warehouse_id", "admin_id", "user_id", "created_by", "updated_by",
  "deleted_by", "restored_by", "category_id", "brand_id", "supplier_id", "customer_id",
  "account_id", "treasury_id", "tax_id", "warranty_id", "unit_id", "parent_id",
  "search_vector", "tsv", "image_path", "metadata",
]);

const FIELD_LABELS: Record<string, string> = {
  name: "الاسم", name_en: "الاسم (إنجليزي)", business_name: "اسم النشاط",
  first_name: "الاسم الأول", last_name: "اسم العائلة", sku: "الكود", barcode: "الباركود",
  cost: "سعر التكلفة", price: "سعر البيع", sell_price: "سعر البيع", stock: "الكمية بالمخزون",
  unit: "الوحدة", main_unit: "الوحدة الرئيسية", sub_unit_1: "وحدة فرعية 1", sub_unit_2: "وحدة فرعية 2",
  has_expiry: "له تاريخ صلاحية", is_active: "نشط", description: "الوصف", notes: "ملاحظات",
  phone: "الهاتف", email: "البريد الإلكتروني", address: "العنوان", opening_balance: "رصيد افتتاحي",
  contact_id: "كود الجهة", invoice_number: "رقم الفاتورة", ref_no: "رقم مرجعي", total: "الإجمالي",
  amount: "المبلغ", status: "الحالة", payment_status: "حالة الدفع", payment_method: "طريقة الدفع",
  quantity: "الكمية", discount: "الخصم", tax: "الضريبة", created_at: "تاريخ الإنشاء", updated_at: "آخر تحديث",
};

const DATE_FIELDS = new Set(["created_at", "updated_at", "issue_date", "purchase_date", "payment_date", "transaction_date", "expiry_date"]);

function fmtDateTime(value: any, lang: string): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(lang === "ar" ? "ar-EG" : "en-GB");
  } catch {
    return String(value);
  }
}

function relativeTime(value: any, lang: string): string {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (isNaN(then)) return String(value);
  const diff = Math.floor((Date.now() - then) / 1000); // seconds
  const ar = lang === "ar";
  if (diff < 45) return ar ? "الآن" : "just now";
  const mins = Math.floor(diff / 60);
  if (mins < 60) return ar ? `منذ ${mins} دقيقة` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return ar ? `منذ ${hrs} ساعة` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return ar ? "أمس" : "yesterday";
  if (days < 7) return ar ? `منذ ${days} يوم` : `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return ar ? `منذ ${weeks} أسبوع` : `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return ar ? `منذ ${months} شهر` : `${months}mo ago`;
  const years = Math.floor(days / 365);
  return ar ? `منذ ${years} سنة` : `${years}y ago`;
}

function prettyValue(key: string, v: any, lang: string): string {
  if (v === true) return lang === "ar" ? "نعم" : "Yes";
  if (v === false) return lang === "ar" ? "لا" : "No";
  if (DATE_FIELDS.has(key)) return fmtDateTime(v, lang);
  return String(v);
}

function shiftRef(sessionId: string | null | undefined): string {
  if (!sessionId) return "—";
  return `#${String(sessionId).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function DetailItem({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-dashed border-gray-200 py-1.5">
      <span className="flex items-center gap-1.5" style={{ color: "#6b7280", fontSize: 12 }}>
        {icon}{label}
      </span>
      <span style={{ fontWeight: 700, color: "#111827", fontSize: 12 }}>{value}</span>
    </div>
  );
}

function CashierItemDetails({ snap, deletedByName, lang }: { snap: any; deletedByName: string; lang: string }) {
  const item = snap?.item ?? {};
  const sessionId: string | null = snap?.session_id ?? null;

  const { data: session } = useQuery({
    queryKey: ["cashier-session-info", sessionId],
    enabled: !!sessionId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase.from("cashier_sessions") as any)
        .select("opened_at, closed_at, status, user_name_snapshot")
        .eq("id", sessionId)
        .maybeSingle();
      return data as any;
    },
  });

  const performerName = session?.user_name_snapshot || snap?.performed_by_name || deletedByName || "—";
  const performerAccount = snap?.performed_by_account || deletedByName || "—";

  const itemRows: Array<[string, any]> = [
    [lang === "ar" ? "الصنف" : "Item", item.description ?? "—"],
    [lang === "ar" ? "الكود" : "SKU", item.sku ?? "—"],
    [lang === "ar" ? "الكمية" : "Qty", item.quantity ?? "—"],
    [lang === "ar" ? "الوحدة" : "Unit", item.unit_name ?? item.unit_level ?? "—"],
    [lang === "ar" ? "سعر الوحدة" : "Unit price", item.final_unit_price != null ? Number(item.final_unit_price).toFixed(2) : "—"],
    [lang === "ar" ? "الخصم" : "Discount", item.discount_amount != null ? Number(item.discount_amount).toFixed(2) : "—"],
    [lang === "ar" ? "الإجمالي" : "Total", item.total != null ? Number(item.total).toFixed(2) : "—"],
    [lang === "ar" ? "تاريخ الصلاحية" : "Expiry", item.expiry_date ?? "—"],
    [lang === "ar" ? "العميل" : "Customer", snap?.customer_name ?? "—"],
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
      <div>
        <div className="text-xs font-bold mb-1.5 flex items-center gap-1.5" style={{ color: "#1e3a8a" }}>
          <Package size={13} /> {lang === "ar" ? "بيانات الصنف" : "Item details"}
        </div>
        {itemRows.map(([k, v]) => <DetailItem key={k} label={k} value={String(v)} />)}
      </div>
      <div>
        <div className="text-xs font-bold mb-1.5 flex items-center gap-1.5" style={{ color: "#1e3a8a" }}>
          <Clock size={13} /> {lang === "ar" ? "بيانات الوردية والمستخدم" : "Shift & user"}
        </div>
        <DetailItem icon={<Tag size={12} />} label={lang === "ar" ? "رقم الوردية" : "Shift"} value={shiftRef(sessionId)} />
        <DetailItem icon={<Clock size={12} />} label={lang === "ar" ? "بداية الوردية" : "Shift start"} value={fmtDateTime(session?.opened_at, lang)} />
        <DetailItem icon={<Clock size={12} />} label={lang === "ar" ? "نهاية الوردية" : "Shift end"} value={session?.closed_at ? fmtDateTime(session.closed_at, lang) : (lang === "ar" ? "مازالت مفتوحة" : "Still open")} />
        <DetailItem icon={<Clock size={12} />} label={lang === "ar" ? "وقت الحذف" : "Removed at"} value={fmtDateTime(snap?.removed_at, lang)} />
        <DetailItem icon={<User size={12} />} label={lang === "ar" ? "تمت العملية بواسطة" : "Performed by"} value={performerName} />
        <DetailItem icon={<User size={12} />} label={lang === "ar" ? "الحساب" : "Account"} value={performerAccount} />
      </div>
    </div>
  );
}

function GenericDetails({ snap, deletedByName, deletedAt, lang }: { snap: any; deletedByName: string; deletedAt: any; lang: string }) {
  const entries = (snap && typeof snap === "object")
    ? Object.entries(snap)
        .filter(([k, v]) => v != null && v !== "" && typeof v !== "object" && !HIDDEN_FIELDS.has(k) && !/_id$/.test(k))
        .map(([k, v]) => [FIELD_LABELS[k] ?? k, prettyValue(k, v, lang)] as [string, string])
    : [];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
      <div>
        <div className="text-xs font-bold mb-1.5 flex items-center gap-1.5" style={{ color: "#1e3a8a" }}>
          <FileText size={13} /> {lang === "ar" ? "تفاصيل السجل" : "Record details"}
        </div>
        {entries.length === 0
          ? <span className="text-xs text-gray-400">{lang === "ar" ? "لا تفاصيل" : "No details"}</span>
          : entries.map(([k, v]) => <DetailItem key={k} label={k} value={v} />)}
      </div>
      <div>
        <div className="text-xs font-bold mb-1.5 flex items-center gap-1.5" style={{ color: "#1e3a8a" }}>
          <User size={13} /> {lang === "ar" ? "بيانات الحذف" : "Deletion info"}
        </div>
        <DetailItem icon={<Clock size={12} />} label={lang === "ar" ? "وقت الحذف" : "Deleted at"} value={fmtDateTime(deletedAt, lang)} />
        <DetailItem icon={<User size={12} />} label={lang === "ar" ? "تمت العملية بواسطة" : "Performed by"} value={deletedByName || "—"} />
      </div>
    </div>
  );
}

type SortKey = "type" | "name" | "date";
type SortDir = "asc" | "desc";

const PAGE_SIZES = [10, 25, 50, 100, 500, 1000, -1]; // -1 = All

function DeletedRecordsPage() {
  const { t, dir, lang } = useI18n();
  const { data: rows = [], isLoading } = useSoftDeletes();
  const { data: empMap = {} } = useEmployeesMap();
  const restore = useRestoreSoftDelete();
  const purge = usePurgeSoftDelete();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState<null | "restore" | "purge">(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const resolveActor = (r: any): string =>
    empMap[r.deleted_by] || r?.snapshot?.performed_by_account || r?.snapshot?.performed_by_name || "—";

  const typeLabel = (type: string) => ENTITY_LABELS[type]?.[lang === "ar" ? "ar" : "en"] || type;

  // Distinct values for dropdowns
  const typeOptions = useMemo(() => {
    const s = new Set<string>();
    (rows as any[]).forEach((r) => s.add(r.entity_type));
    return Array.from(s);
  }, [rows]);

  const userOptions = useMemo(() => {
    const m = new Map<string, string>();
    (rows as any[]).forEach((r) => {
      const id = r.deleted_by || "__none__";
      if (!m.has(id)) m.set(id, resolveActor(r));
    });
    return Array.from(m.entries()); // [id, name]
  }, [rows, empMap]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
    const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
    return (rows as any[]).filter((r) => {
      if (typeFilter !== "all" && r.entity_type !== typeFilter) return false;
      if (userFilter !== "all" && (r.deleted_by || "__none__") !== userFilter) return false;
      if (fromTs || toTs) {
        const ts = new Date(r.deleted_at).getTime();
        if (fromTs && ts < fromTs) return false;
        if (toTs && ts > toTs) return false;
      }
      if (s) {
        const hay = [r.entity_label, typeLabel(r.entity_type), resolveActor(r)].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, search, typeFilter, userFilter, dateFrom, dateTo, empMap, lang]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "type") cmp = typeLabel(a.entity_type).localeCompare(typeLabel(b.entity_type), "ar");
      else if (sortKey === "name") cmp = String(a.entity_label || "").localeCompare(String(b.entity_label || ""), "ar");
      else cmp = new Date(a.deleted_at).getTime() - new Date(b.deleted_at).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir, lang]);

  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = pageSize === -1 ? sorted : sorted.slice(page * pageSize, page * pageSize + pageSize);

  // Reset page when filters change result count
  useEffect(() => { setPage(0); }, [search, typeFilter, userFilter, dateFrom, dateTo, pageSize]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "date" ? "desc" : "asc"); }
  };

  const toggleExpand = (id: string) => setExpanded((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const toggleSelect = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const pageIds = pageRows.map((r) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleSelectAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allPageSelected) pageIds.forEach((id) => n.delete(id));
    else pageIds.forEach((id) => n.add(id));
    return n;
  });

  const selectedRows = (rows as any[]).filter((r) => selected.has(r.id));
  const selectedRestorable = selectedRows.filter((r) => !LOG_ONLY.has(r.entity_type));

  const runBulk = async (action: "restore" | "purge") => {
    const ids = action === "restore" ? selectedRestorable.map((r) => r.id) : selectedRows.map((r) => r.id);
    for (const id of ids) {
      try {
        if (action === "restore") await restore.mutateAsync(id);
        else await purge.mutateAsync(id);
      } catch { /* toast shown by hook */ }
    }
    setSelected(new Set());
    setConfirmBulk(null);
  };

  const headStyle: React.CSSProperties = {
    backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px",
    fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left",
    fontSize: 13, borderBottom: "1px solid #d1d5db", whiteSpace: "nowrap",
  };
  const cellStyle: React.CSSProperties = {
    borderBottom: "1px solid #e5e7eb", padding: "8px 12px", color: "#374151", verticalAlign: "middle",
  };

  const SortHead = ({ label, k }: { label: string; k: SortKey }) => (
    <th style={{ ...headStyle, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k
          ? (sortDir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />)
          : <ChevronDown size={13} style={{ opacity: 0.25 }} />}
      </span>
    </th>
  );

  const selectStyle: React.CSSProperties = {
    height: 38, border: "1px solid #d1d5db", borderRadius: 6, padding: "0 8px",
    background: "#fff", color: "#374151", fontSize: 13, minWidth: 140,
  };

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={lang === "ar" ? "السجلات الممسوحة" : "Deleted records"} />
      <DataCard className="border-gray-300">
        {/* Filter bar */}
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="h-4 w-4 absolute top-1/2 -translate-y-1/2 text-gray-400" style={{ [dir === "rtl" ? "right" : "left"]: 10 } as any} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === "ar" ? "ابحث بالاسم أو النوع أو المستخدم..." : "Search by name, type, user..."}
              style={{ [dir === "rtl" ? "paddingRight" : "paddingLeft"]: 32, height: 38 } as any}
            />
          </div>
          <label className="flex flex-col gap-1" style={{ fontSize: 11, color: "#6b7280" }}>
            {lang === "ar" ? "نوع السجل" : "Record type"}
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
              <option value="all">{lang === "ar" ? "الكل" : "All"}</option>
              {typeOptions.map((tp) => <option key={tp} value={tp}>{typeLabel(tp)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1" style={{ fontSize: 11, color: "#6b7280" }}>
            {lang === "ar" ? "المستخدم" : "Deleted by"}
            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} style={selectStyle}>
              <option value="all">{lang === "ar" ? "الكل" : "All"}</option>
              {userOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1" style={{ fontSize: 11, color: "#6b7280" }}>
            {lang === "ar" ? "من تاريخ" : "From"}
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={selectStyle} />
          </label>
          <label className="flex flex-col gap-1" style={{ fontSize: 11, color: "#6b7280" }}>
            {lang === "ar" ? "إلى تاريخ" : "To"}
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={selectStyle} />
          </label>
          {(typeFilter !== "all" || userFilter !== "all" || dateFrom || dateTo || search) && (
            <button
              onClick={() => { setSearch(""); setTypeFilter("all"); setUserFilter("all"); setDateFrom(""); setDateTo(""); }}
              className="inline-flex items-center gap-1 text-xs rounded border px-3"
              style={{ height: 38, color: "#6b7280", background: "#fff" }}
            >
              <X size={13} /> {lang === "ar" ? "مسح" : "Clear"}
            </button>
          )}
        </div>

        {/* Bulk action bar + count + rows-per-page */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">{sorted.length} {lang === "ar" ? "سجل" : "records"}</span>
            {selected.size > 0 && (
              <div className="flex items-center gap-2 rounded px-2 py-1" style={{ background: "#eef2ff", border: "1px solid #c7d2fe" }}>
                <span className="text-xs font-semibold" style={{ color: "#3730a3" }}>
                  {selected.size} {lang === "ar" ? "محدد" : "selected"}
                </span>
                {selectedRestorable.length > 0 && (
                  <button onClick={() => setConfirmBulk("restore")} className="inline-flex items-center gap-1 text-xs rounded text-white px-2 py-1" style={{ background: "#10b981" }}>
                    <RotateCcw size={12} /> {lang === "ar" ? "استرجاع المحدد" : "Restore"}
                  </button>
                )}
                <button onClick={() => setConfirmBulk("purge")} className="inline-flex items-center gap-1 text-xs rounded text-white px-2 py-1" style={{ background: "#ef4444" }}>
                  <Trash2 size={12} /> {lang === "ar" ? "حذف نهائي" : "Purge"}
                </button>
                <button onClick={() => setSelected(new Set())} className="text-xs" style={{ color: "#6b7280" }}>
                  <X size={13} />
                </button>
              </div>
            )}
          </div>
          <label className="flex items-center gap-2" style={{ fontSize: 12, color: "#6b7280" }}>
            {lang === "ar" ? "عدد الصفوف" : "Rows per page"}
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ ...selectStyle, minWidth: 90, height: 34 }}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n === -1 ? (lang === "ar" ? "الكل" : "All") : n}</option>)}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-md print-table-area" style={{ border: "1px solid #d1d5db" }}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...headStyle, width: 40, textAlign: "center" }}>
                  <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} style={{ width: 15, height: 15, cursor: "pointer" }} />
                </th>
                <th style={{ ...headStyle, width: 34 }}></th>
                <SortHead label={lang === "ar" ? "النوع" : "Type"} k="type" />
                <SortHead label={lang === "ar" ? "الاسم/المرجع" : "Name / Ref"} k="name" />
                <SortHead label={lang === "ar" ? "تاريخ الحذف" : "Deleted at"} k="date" />
                <th style={headStyle}>{lang === "ar" ? "بواسطة" : "By"}</th>
                <th style={{ ...headStyle, textAlign: dir === "rtl" ? "left" : "right" }}>{lang === "ar" ? "إجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} style={{ ...cellStyle, textAlign: "center" }}>...</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={7} style={{ ...cellStyle, textAlign: "center", color: "#9ca3af" }}>
                  {lang === "ar" ? "لا توجد سجلات ممسوحة" : "No deleted records"}
                </td></tr>
              ) : pageRows.map((r: any) => {
                const isLog = LOG_ONLY.has(r.entity_type);
                const isOpen = expanded.has(r.id);
                const badge = TYPE_BADGE[r.entity_type] || { bg: "#f1f5f9", fg: "#334155" };
                const actor = resolveActor(r);
                return (
                <Fragment key={r.id}>
                <tr style={{ background: isOpen ? "#f8fafc" : undefined }}>
                  <td style={{ ...cellStyle, textAlign: "center" }}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} style={{ width: 15, height: 15, cursor: "pointer" }} />
                  </td>
                  <td style={{ ...cellStyle, textAlign: "center", cursor: "pointer" }} onClick={() => toggleExpand(r.id)}>
                    {isOpen ? <ChevronDown size={16} style={{ color: "#6b7280" }} /> : (dir === "rtl" ? <ChevronRight size={16} style={{ color: "#6b7280", transform: "scaleX(-1)" }} /> : <ChevronRight size={16} style={{ color: "#6b7280" }} />)}
                  </td>
                  <td style={cellStyle}>
                    <span style={{ background: badge.bg, color: badge.fg, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", display: "inline-block" }}>
                      {typeLabel(r.entity_type)}
                    </span>
                  </td>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>{r.entity_label || "—"}</td>
                  <td style={cellStyle} title={fmtDateTime(r.deleted_at, lang)}>
                    <span>{relativeTime(r.deleted_at, lang)}</span>
                  </td>
                  <td style={{ ...cellStyle, color: "#6b7280" }}>{actor}</td>
                  <td style={{ ...cellStyle, textAlign: dir === "rtl" ? "left" : "right" }}>
                    <div className="inline-flex gap-2 items-center">
                      {!isLog && (
                        <button
                          onClick={() => setConfirmRestoreId(r.id)}
                          className="h-8 px-3 inline-flex items-center gap-1 text-xs rounded text-white"
                          style={{ backgroundColor: "#10b981" }}
                        >
                          <RotateCcw className="h-3 w-3" /> {lang === "ar" ? "استرجاع" : "Restore"}
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmPurgeId(r.id)}
                        title={lang === "ar" ? "حذف نهائي" : "Delete permanently"}
                        className="h-8 w-8 inline-flex items-center justify-center rounded"
                        style={{ color: "#ef4444", border: "1px solid #fecaca", background: "#fff" }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={7} style={{ borderBottom: "1px solid #e5e7eb", padding: "14px 18px", background: "#f8fafc" }}>
                      {r.entity_type === "cashier_removed_item"
                        ? <CashierItemDetails snap={r.snapshot} deletedByName={actor} lang={lang} />
                        : <GenericDetails snap={r.snapshot} deletedByName={actor} deletedAt={r.deleted_at} lang={lang} />}
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {pageSize !== -1 && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-3">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="h-8 px-3 rounded border text-sm disabled:opacity-40" style={{ background: "#fff" }}>
              {lang === "ar" ? "السابق" : "Prev"}
            </button>
            <span className="text-sm text-gray-600">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="h-8 px-3 rounded border text-sm disabled:opacity-40" style={{ background: "#fff" }}>
              {lang === "ar" ? "التالي" : "Next"}
            </button>
          </div>
        )}
      </DataCard>

      {/* Single restore confirm */}
      <AlertDialog open={!!confirmRestoreId} onOpenChange={(v) => !v && setConfirmRestoreId(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "ar" ? "تأكيد الاسترجاع" : "Confirm restore"}</AlertDialogTitle>
            <AlertDialogDescription>{lang === "ar" ? "سيتم إعادة هذا السجل للنظام." : "This record will be restored."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("sales.confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmRestoreId) restore.mutate(confirmRestoreId); setConfirmRestoreId(null); }} style={{ backgroundColor: "#10b981" }}>
              {lang === "ar" ? "استرجاع" : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single purge confirm */}
      <AlertDialog open={!!confirmPurgeId} onOpenChange={(v) => !v && setConfirmPurgeId(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "ar" ? "حذف نهائي" : "Purge permanently"}</AlertDialogTitle>
            <AlertDialogDescription>{lang === "ar" ? "لن يمكن استرجاع هذا السجل بعد ذلك." : "This action cannot be undone."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("sales.confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmPurgeId) purge.mutate(confirmPurgeId); setConfirmPurgeId(null); }} className="bg-red-600 hover:bg-red-700">
              {lang === "ar" ? "حذف نهائي" : "Purge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk confirm */}
      <AlertDialog open={!!confirmBulk} onOpenChange={(v) => !v && setConfirmBulk(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmBulk === "restore"
                ? (lang === "ar" ? "استرجاع السجلات المحددة" : "Restore selected")
                : (lang === "ar" ? "حذف نهائي للسجلات المحددة" : "Purge selected")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBulk === "restore"
                ? (lang === "ar" ? `سيتم استرجاع ${selectedRestorable.length} سجل.` : `${selectedRestorable.length} records will be restored.`)
                : (lang === "ar" ? `سيتم حذف ${selectedRows.length} سجل نهائياً.` : `${selectedRows.length} records will be permanently deleted.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("sales.confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmBulk && runBulk(confirmBulk)}
              className={confirmBulk === "purge" ? "bg-red-600 hover:bg-red-700" : ""}
              style={confirmBulk === "restore" ? { backgroundColor: "#10b981" } : undefined}
            >
              {lang === "ar" ? "تأكيد" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
