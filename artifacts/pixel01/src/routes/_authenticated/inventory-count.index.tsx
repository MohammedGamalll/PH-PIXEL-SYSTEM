import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { useI18n } from "@/lib/i18n";
import { Plus, Eye, Edit3, Printer, Trash2, ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@/lib/can";


export const Route = createFileRoute("/_authenticated/inventory-count/")({
  component: InventoryCountIndex,
});

const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px" };

function InventoryDetailsRow({ id, isAr, dir }: { id: string; isAr: boolean; dir: "rtl" | "ltr" }) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["stock_adjustment_items", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("stock_adjustment_items")
        .select("*, products(name, name_en, sku, main_unit)")
        .eq("adjustment_id", id)
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  if (isLoading) return <div style={{ padding: 12, color: "#6b7280", fontSize: 12 }}>...</div>;
  if (items.length === 0) return <div style={{ padding: 12, color: "#6b7280", fontSize: 12 }}>{isAr ? "لا توجد أصناف" : "No items"}</div>;

  const subHead: React.CSSProperties = {
    backgroundColor: "#eef2ff", color: "#1e3a8a", padding: "6px 10px",
    fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 12, borderBottom: "1px solid #c7d2fe",
  };
  const subCell: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "6px 10px", fontSize: 12 };

  const fmt = (n: number) => new Intl.NumberFormat(isAr ? "ar-EG" : "en-US", { maximumFractionDigits: 2 }).format(Number(n || 0));

  return (
    <div style={{ background: "#f9fafb", padding: 8, borderTop: "1px dashed #c7d2fe" }}>
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4, color: "#374151" }}>
        {isAr ? `الأصناف (${items.length})` : `Items (${items.length})`}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={subHead}>{isAr ? "الصنف" : "Product"}</th>
            <th style={subHead}>{isAr ? "الكود" : "SKU"}</th>
            <th style={subHead}>{isAr ? "الكمية الدفترية" : "System"}</th>
            <th style={subHead}>{isAr ? "الكمية الفعلية" : "Physical"}</th>
            <th style={subHead}>{isAr ? "الفرق" : "Variance"}</th>
            <th style={subHead}>{isAr ? "التكلفة" : "Cost"}</th>
            <th style={subHead}>{isAr ? "قيمة الفرق" : "Variance value"}</th>
            <th style={subHead}>{isAr ? "تاريخ الصلاحية" : "Expiry"}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it: any) => {
            const v = Number(it.variance_qty || 0);
            const vv = Number(it.variance_value || 0);
            const p = it.products || {};
            return (
              <tr key={it.id}>
                <td style={subCell}>{isAr ? (p.name || "—") : (p.name_en || p.name || "—")}</td>
                <td style={subCell}>{p.sku || "—"}</td>
                <td style={subCell}>{fmt(Number(it.system_qty))}</td>
                <td style={subCell}>{fmt(Number(it.physical_qty))}</td>
                <td style={{ ...subCell, color: v < 0 ? "#dc2626" : v > 0 ? "#16a34a" : "#6b7280", fontWeight: 600 }}>
                  {v > 0 ? "+" : ""}{fmt(v)}
                </td>
                <td style={subCell}>{fmt(Number(it.cost_at_time))}</td>
                <td style={{ ...subCell, color: vv < 0 ? "#dc2626" : vv > 0 ? "#16a34a" : "#6b7280", fontWeight: 600 }}>
                  {vv > 0 ? "+" : ""}{fmt(vv)}
                </td>
                <td style={subCell}>{it.expiry_date || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InventoryCountIndex() {
  const { dir, lang } = useI18n();
  const isAr = lang === "ar";
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "approved">("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const { can } = useCan();


  const headStyle: React.CSSProperties = {
    backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px",
    fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb",
  };

  const { data = [], isLoading } = useQuery({
    queryKey: ["stock_adjustments"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_adjustments" as any)
        .select("*")
        .order("count_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stock_adjustments" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(isAr ? "تم الحذف" : "Deleted"); qc.invalidateQueries({ queryKey: ["stock_adjustments"] }); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3" style={{ marginInlineStart: 4, opacity: 0.4 }} />;
    return sortDir === "asc"
      ? <span style={{ fontSize: 10, marginInlineStart: 4 }}>▲</span>
      : <span style={{ fontSize: 10, marginInlineStart: 4 }}>▼</span>;
  };

  const filtered = useMemo(() => {
    let list = data.filter((r) =>
      (statusFilter === "all" || r.status === statusFilter) &&
      (!search || (r.ref_no || "").toLowerCase().includes(search.toLowerCase()))
    );
    if (sortField) {
      list = [...list].sort((a: any, b: any) => {
        let av = a[sortField];
        let bv = b[sortField];
        if (sortField === "total_variance_value") { av = Number(av || 0); bv = Number(bv || 0); }
        if (sortField === "count_date") { av = a.created_at || a.count_date; bv = b.created_at || b.count_date; av = av ? new Date(av).getTime() : 0; bv = bv ? new Date(bv).getTime() : 0; }
        if (typeof av === "string" && typeof bv === "string") {
          return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        if (av == null) av = "";
        if (bv == null) bv = "";
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [data, search, statusFilter, sortField, sortDir]);

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat(isAr ? "ar-EG" : "en-US", { maximumFractionDigits: 2 }).format(Number(n || 0));

  const fmtDateTime = (d: string | null | undefined) => {
    if (!d) return "—";
    try {
      const date = new Date(d);
      if (isNaN(date.getTime())) return "—";
      return date.toLocaleString(isAr ? "ar-EG" : "en-GB", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader
        title={isAr ? "الجرد المخزوني" : "Inventory count"}
        subtitle={isAr ? "سجل عمليات الجرد المخزونية والمسودات" : "Stock take history and drafts"}
        actions={
          can("inventory_count", "create") ? (
            <button
              type="button"
              onClick={() => navigate({ to: "/inventory-count/create" })}
              style={{ height: 36, padding: "0 16px", borderRadius: 6, display: "inline-flex", alignItems: "center", color: "#fff", backgroundColor: "#2563eb", border: "1px solid #2563eb", fontSize: 13, cursor: "pointer" }}
            >
              <Plus className="h-4 w-4" style={{ marginInlineEnd: 6 }} /> {isAr ? "جرد جديد" : "New count"}
            </button>
          ) : null
        }

      />


      <DataCard>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? "بحث بالرقم المرجعي…" : "Search ref…"}
            className="h-9 px-3 rounded-md border border-gray-200 text-sm flex-1 min-w-0"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="h-9 px-3 rounded-md border border-gray-200 text-sm"
          >
            <option value="all">{isAr ? "الكل" : "All"}</option>
            <option value="draft">{isAr ? "مسودة" : "Draft"}</option>
            <option value="approved">{isAr ? "معتمد" : "Approved"}</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...headStyle, width: 36 }}></th>
                <th style={{ ...headStyle, cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("ref_no")}>
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    {isAr ? "الرقم المرجعي" : "Ref no"} {sortIcon("ref_no")}
                  </span>
                </th>
                <th style={{ ...headStyle, cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("count_date")}>
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    {isAr ? "التاريخ" : "Date"} {sortIcon("count_date")}
                  </span>
                </th>
                <th style={{ ...headStyle, cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("status")}>
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    {isAr ? "الحالة" : "Status"} {sortIcon("status")}
                  </span>
                </th>
                <th style={{ ...headStyle, cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("total_variance_value")}>
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    {isAr ? "قيمة الفرق" : "Variance value"} {sortIcon("total_variance_value")}
                  </span>
                </th>
                <th style={{ ...headStyle, cursor: "pointer", userSelect: "none" }} onClick={() => handleSort("notes")}>
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    {isAr ? "ملاحظات" : "Notes"} {sortIcon("notes")}
                  </span>
                </th>
                <th style={headStyle}>{isAr ? "الإجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} style={{ ...cellStyle, textAlign: "center", color: "#6b7280" }}>...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ ...cellStyle, textAlign: "center", color: "#6b7280" }}>
                  {isAr ? "لا توجد بيانات" : "No data"}
                </td></tr>
              ) : filtered.map((r) => {
                const v = Number(r.total_variance_value || 0);
                const isDraft = r.status === "draft";
                const isOpen = !!expanded[r.id];
                return (
                  <React.Fragment key={r.id}>
                    <tr className="hover:bg-gray-50">
                      <td style={cellStyle}>
                        <button
                          type="button"
                          onClick={() => setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))}
                          title={isOpen ? (isAr ? "إخفاء التفاصيل" : "Hide details") : (isAr ? "عرض التفاصيل" : "Show details")}
                          style={{ background: isOpen ? "#e0e7ff" : "transparent", border: "1px solid #c7d2fe", borderRadius: 4, padding: 4, cursor: "pointer", display: "inline-flex", alignItems: "center", color: "#1e3a8a" }}
                        >
                          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </td>
                      <td style={cellStyle} className="font-medium">{r.ref_no}</td>
                      <td style={cellStyle}>{fmtDateTime(r.created_at || r.count_date)}</td>
                      <td style={cellStyle}>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${isDraft ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}`}>
                          {isDraft ? (isAr ? "مسودة" : "Draft") : (isAr ? "معتمد" : "Approved")}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <span className={v < 0 ? "text-red-600" : v > 0 ? "text-green-600" : "text-gray-500"}>
                          {fmtMoney(v)}
                        </span>
                      </td>
                      <td style={cellStyle} className="text-gray-600">{r.notes || "—"}</td>
                      <td style={cellStyle}>
                        <div style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap" }}>
                          {can("inventory_count", "edit") && (
                            <Link
                              to="/inventory-count/edit/$id"
                              params={{ id: r.id }}
                              search={isDraft ? undefined : { edit: "1" }}
                              style={{ height: 30, padding: "0 10px", borderRadius: 4, display: "inline-flex", alignItems: "center", color: "#fff", fontSize: 12, marginInlineEnd: 6, marginBottom: 4, backgroundColor: "#eab308", border: "1px solid #eab308", textDecoration: "none" }}
                            >
                              <Edit3 className="h-3 w-3" style={{ marginInlineEnd: 4 }} />{isAr ? "تعديل" : "Edit"}
                            </Link>
                          )}
                          {!isDraft && (
                            <Link
                              to="/inventory-count/edit/$id"
                              params={{ id: r.id }}
                              style={{ height: 30, padding: "0 10px", borderRadius: 4, display: "inline-flex", alignItems: "center", color: "#fff", fontSize: 12, marginInlineEnd: 6, marginBottom: 4, backgroundColor: "#4b5563", border: "1px solid #4b5563", textDecoration: "none" }}
                            >
                              <Eye className="h-3 w-3" style={{ marginInlineEnd: 4 }} />{isAr ? "عرض" : "View"}
                            </Link>
                          )}
                          {can("inventory_count", "print") && (
                            <Link
                              to="/inventory-count/edit/$id"
                              params={{ id: r.id }}
                              search={{ print: "1" }}
                              style={{ height: 30, padding: "0 10px", borderRadius: 4, display: "inline-flex", alignItems: "center", color: "#fff", fontSize: 12, marginInlineEnd: 6, marginBottom: 4, backgroundColor: "#2563eb", border: "1px solid #2563eb", textDecoration: "none" }}
                            >
                              <Printer className="h-3 w-3" style={{ marginInlineEnd: 4 }} />{isAr ? "طباعة" : "Print"}
                            </Link>
                          )}
                          {can("inventory_count", "delete") && (
                            <button
                              type="button"
                              onClick={() => {
                                const msg = isDraft
                                  ? (isAr ? "حذف المسودة؟" : "Delete draft?")
                                  : (isAr ? "حذف الجرد المعتمد؟ سيتم عكس التأثير على المخزون." : "Delete approved count? Stock effect will be reversed.");
                                if (confirm(msg)) del.mutate(r.id);
                              }}
                              style={{ height: 30, padding: "0 10px", borderRadius: 4, display: "inline-flex", alignItems: "center", color: "#fff", fontSize: 12, marginBottom: 4, backgroundColor: "#dc2626", border: "1px solid #dc2626", cursor: "pointer" }}
                            >
                              <Trash2 className="h-3 w-3" style={{ marginInlineEnd: 4 }} />{isAr ? "حذف" : "Delete"}
                            </button>
                          )}

                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={r.id + "-details"}>
                        <td colSpan={7} style={{ padding: 0 }}>
                          <InventoryDetailsRow id={r.id} isAr={isAr} dir={dir} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </DataCard>
    </div>
  );
}
