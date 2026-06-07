import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/products/PageHeader";
import { ReportTable } from "@/components/reports/ReportTable";
import type { ColumnDef } from "@/components/products/TableToolbar";
import { useI18n } from "@/lib/i18n";
import { useContacts } from "@/hooks/use-contacts";
import { InvoiceDetailsModal } from "@/components/sales/InvoiceDetailsModal";
import { useInvoicePrint } from "@/hooks/use-invoice-print";
import { PurchaseDetailsModal } from "@/components/purchases/PurchaseDetailsModal";

export const Route = createFileRoute("/_authenticated/reports/item-movement")({
  component: ItemMovementPage,
});

type MovementRow = {
  id: string;
  item: string;
  sku: string;
  description: string;
  purchase_date: string;
  purchase_date_raw: string;
  purchase_price: number;
  purchase: string;
  warehouse: string;
  supplier: string;
  supplier_id: string;
  sale_date: string;
  sale_date_raw: string;
  sale: string;
  sale_id: string;
  customer: string;
  customer_id: string;
  purchase_id: string;
  branch: string;
  qty: number;
  qty_label: string;
  base_qty: number;
  sale_price: number;
  total: number;
  _sortDate: string;
};

function ItemMovementPage() {
  const { t, dir, lang } = useI18n();
  const { user } = useAuth();
  const locale = lang === "ar" ? "ar-EG" : "en-US";
  // Renders the date part from a DATE column (no timezone shift) + time from a timestamptz.
  const fmtDate = (dateStr?: string | null, createdAt?: string | null) => {
    if (!dateStr) return "";
    // Use only YYYY-MM-DD portion to avoid UTC->local shift on DATE columns.
    const ymd = String(dateStr).slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    const datePart = m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
    if (!createdAt) return datePart;
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return datePart;
    let h = d.getHours();
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    return `${datePart} ${String(h).padStart(2, "0")}:${mm} ${ampm}`;
  };

  const unitWord = t("reports.unit_suffix");
  const returnWord = t("reports.return_suffix");

  const { data: suppliers = [] } = useContacts("supplier");
  const { data: customers = [] } = useContacts("customer");

  const [supplierId, setSupplierId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [pFrom, setPFrom] = useState("");
  const [pTo, setPTo] = useState("");
  const [sFrom, setSFrom] = useState("");
  const [sTo, setSTo] = useState("");
  const [activeIdx, setActiveIdx] = useState(-1);
  const [viewInvoice, setViewInvoice] = useState<any | null>(null);
  const { onModalPrint, printNode } = useInvoicePrint({
    customerName: (inv) => inv?.customer_name_snapshot ?? "",
  });
  const [viewPurchase, setViewPurchase] = useState<any | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["item-movement"],
    enabled: !!user,
    queryFn: async (): Promise<MovementRow[]> => {
      const [pItemsRes, iItemsRes, purchasesRes, invoicesRes, productsRes, contactsRes, suppliersRes] = await Promise.all([
        (supabase.from("purchase_items") as any).select("id,purchase_id,product_id,quantity,base_quantity,unit_price,total,unit_name,description"),
        (supabase.from("invoice_items") as any).select("id,invoice_id,product_id,quantity,base_quantity,unit_price,total,unit_name,description"),
        (supabase.from("purchases") as any).select("id,ref_no,purchase_number,purchase_date,created_at,branch_id,supplier_id"),
        (supabase.from("invoices") as any).select("id,invoice_number,issue_date,created_at,type,is_returned_from_id,customer_id"),
        (supabase.from("products") as any).select("id,name,sku"),
        (supabase.from("contacts") as any).select("id,first_name,last_name,business_name,type"),
        (supabase.from("suppliers") as any).select("id,name"),
      ]);
      for (const r of [pItemsRes, iItemsRes, purchasesRes, invoicesRes, productsRes]) {
        if (r.error) throw r.error;
      }

      const purchMap = new Map<string, any>();
      for (const p of (purchasesRes.data ?? []) as any[]) purchMap.set(p.id, p);
      const invMap = new Map<string, any>();
      for (const i of (invoicesRes.data ?? []) as any[]) invMap.set(i.id, i);
      const prodMap = new Map<string, any>();
      for (const p of (productsRes.data ?? []) as any[]) prodMap.set(p.id, p);
      const custMap = new Map<string, string>();
      for (const c of (contactsRes.data ?? []) as any[]) {
        custMap.set(c.id, c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" "));
      }
      const supMap = new Map<string, string>();
      for (const s of (suppliersRes.data ?? []) as any[]) supMap.set(s.id, s.name);
      for (const c of (contactsRes.data ?? []) as any[]) {
        if (c.type === "supplier" || c.type === "both") {
          supMap.set(c.id, c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" "));
        }
      }

      const out: MovementRow[] = [];

      for (const it of (pItemsRes.data ?? []) as any[]) {
        const p = purchMap.get(it.purchase_id);
        if (!p) continue;
        const prod = it.product_id ? prodMap.get(it.product_id) : null;
        const qty = Number(it.quantity) || 0;
        out.push({
          id: `p-${it.id}`,
          item: prod?.name || it.description || "",
          sku: prod?.sku || "",
          description: it.description || "",
          purchase_date: fmtDate(p.purchase_date, p.created_at),
          purchase_date_raw: p.purchase_date || "",
          purchase_price: Number(it.unit_price) || 0,
          purchase: p.ref_no || p.purchase_number || "",
          purchase_id: p.id,
          warehouse: p.branch_id || "",
          supplier: p.supplier_id ? supMap.get(p.supplier_id) || "" : "",
          supplier_id: p.supplier_id || "",
          sale_date: "",
          sale_date_raw: "",
          sale: "",
          sale_id: "",
          customer: "",
          customer_id: "",
          branch: p.branch_id || "",
          qty: 0,
          qty_label: "",
          base_qty: Number(it.base_quantity ?? it.quantity ?? 0),
          sale_price: 0,
          total: Number(it.total) || qty * (Number(it.unit_price) || 0),
          _sortDate: p.purchase_date || "",
        });
      }

      for (const it of (iItemsRes.data ?? []) as any[]) {
        const inv = invMap.get(it.invoice_id);
        if (!inv) continue;
        const prod = it.product_id ? prodMap.get(it.product_id) : null;
        const isReturn = inv.type === "sale_return" || !!inv.is_returned_from_id;
        const rawQty = Number(it.quantity) || 0;
        const signedQty = isReturn ? -Math.abs(rawQty) : rawQty;
        const unit = it.unit_name || unitWord;
        const label = isReturn
          ? `${signedQty.toFixed(2)} ${unit} (${returnWord})`
          : `${signedQty.toFixed(2)} ${unit}`;
        const total = (Number(it.total) || rawQty * (Number(it.unit_price) || 0)) * (isReturn ? -1 : 1);
        out.push({
          id: `s-${it.id}`,
          item: prod?.name || it.description || "",
          sku: prod?.sku || "",
          description: it.description || "",
          purchase_date: "",
          purchase_date_raw: "",
          purchase_price: 0,
          purchase: "",
          warehouse: "",
          supplier: "",
          supplier_id: "",
          sale_date: fmtDate(inv.issue_date, inv.created_at),
          sale_date_raw: inv.issue_date || "",
          sale: inv.invoice_number || "",
          sale_id: inv.id,
          customer: inv.customer_id ? custMap.get(inv.customer_id) || "" : "",
          customer_id: inv.customer_id || "",
          purchase_id: "",
          branch: "",
          qty: signedQty,
          qty_label: label,
          base_qty: (isReturn ? -1 : 1) * Math.abs(Number(it.base_quantity ?? it.quantity ?? 0)),
          sale_price: Number(it.unit_price) || 0,
          total,
          _sortDate: inv.issue_date || "",
        });
      }

      out.sort((a, b) => b._sortDate.localeCompare(a._sortDate));
      return out;
    },

  });

  const filteredRows = useMemo(() => {
    return (rows as MovementRow[]).filter((r) => {
      if (supplierId && r.supplier_id !== supplierId) return false;
      if (customerId && r.customer_id !== customerId) return false;
      if (pFrom && (!r.purchase_date_raw || r.purchase_date_raw < pFrom)) return false;
      if (pTo && (!r.purchase_date_raw || r.purchase_date_raw > pTo)) return false;
      if (sFrom && (!r.sale_date_raw || r.sale_date_raw < sFrom)) return false;
      if (sTo && (!r.sale_date_raw || r.sale_date_raw > sTo)) return false;
      return true;
    });
  }, [rows, supplierId, customerId, pFrom, pTo, sFrom, sTo]);

  useEffect(() => { setActiveIdx(-1); }, [filteredRows]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filteredRows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    }
  }, [filteredRows.length]);

  const openSale = async (row: MovementRow) => {
    if (!row.sale_id) return;
    const { data } = await supabase.from("invoices").select("*").eq("id", row.sale_id).maybeSingle();
    if (data) setViewInvoice(data);
  };

  const openPurchase = async (row: MovementRow) => {
    if (!row.purchase_id) return;
    const { data } = await supabase.from("purchases").select("*").eq("id", row.purchase_id).maybeSingle();
    if (data) setViewPurchase(data);
  };

  const cols: ColumnDef[] = [
    { key: "item", label: t("reports.col.item"), visible: true },
    { key: "sku", label: t("reports.col.sku_bar"), visible: true },
    { key: "description", label: t("reports.col.description"), visible: true },
    { key: "purchase_date", label: t("reports.col.purchase_date"), visible: true },
    { key: "purchase_price", label: t("reports.col.purchase_price"), visible: true },
    { key: "purchase", label: t("reports.col.purchase"), visible: true },
    { key: "warehouse", label: t("reports.col.warehouse"), visible: true },
    { key: "supplier", label: t("reports.col.supplier"), visible: true },
    { key: "sale_date", label: t("reports.col.sale_date"), visible: true },
    { key: "sale", label: t("reports.col.sale"), visible: true },
    { key: "customer", label: t("reports.col.customer"), visible: true },
    { key: "branch", label: t("reports.col.branch"), visible: true },
    { key: "qty", label: t("reports.col.qty_sold"), visible: true },
    { key: "base_qty", label: t("reports.col.base_qty"), visible: true },
    { key: "sale_price", label: t("reports.col.sale_price"), visible: true },
    { key: "total", label: t("reports.col.sum"), visible: true },
  ];

  const inp: React.CSSProperties = { border: "1px solid #d1d5db", backgroundColor: "#ffffff", borderRadius: 6, height: 36, padding: "0 8px", width: "100%", fontSize: 13, outline: "none", color: "#374151" };
  const lbl: React.CSSProperties = { fontSize: 12, color: "#374151", marginBottom: 4, display: "block" };
  const supName = (s: any) => s.business_name || [s.first_name, s.last_name].filter(Boolean).join(" ") || "—";

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("reports.item_movement.title")} />
      <div className="rounded-md p-3 grid grid-cols-2 md:grid-cols-4 gap-3" style={{ border: "1px solid #e5e7eb", backgroundColor: "#ffffff" }}>
        <div>
          <label style={lbl}>{t("reports.col.supplier")}</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={inp}>
            <option value="">{t("users.filters.all")}</option>
            {(suppliers as any[]).map((s) => <option key={s.id} value={s.id}>{supName(s)}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>{t("reports.col.purchase_date")}</label>
          <div className="flex gap-1">
            <input type="date" value={pFrom} onChange={(e) => setPFrom(e.target.value)} style={inp} />
            <input type="date" value={pTo} onChange={(e) => setPTo(e.target.value)} style={inp} />
          </div>
        </div>
        <div>
          <label style={lbl}>{t("reports.col.customer")}</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inp}>
            <option value="">{t("users.filters.all")}</option>
            {(customers as any[]).map((c) => <option key={c.id} value={c.id}>{supName(c)}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>{t("reports.col.sale_date")}</label>
          <div className="flex gap-1">
            <input type="date" value={sFrom} onChange={(e) => setSFrom(e.target.value)} style={inp} />
            <input type="date" value={sTo} onChange={(e) => setSTo(e.target.value)} style={inp} />
          </div>
        </div>
      </div>
      <div ref={tableRef} onKeyDown={handleKeyDown} tabIndex={0} style={{ outline: "none" }}>
        <ReportTable
          rows={filteredRows}
          initialCols={cols}
          rowKey={(r) => r.id}
          searchFields={(r) => `${r.item} ${r.sku} ${r.purchase} ${r.sale} ${r.supplier} ${r.customer}`}
          cellFor={(r, k) => {
            const row = r as MovementRow;
            if (k === "purchase" && row.purchase) {
              return (
                <button type="button" onClick={() => openPurchase(row)}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#2563eb", textDecoration: "underline", font: "inherit" }}>
                  {row.purchase}
                </button>
              );
            }
            if (k === "sale" && row.sale) {
              return (
                <button type="button" onClick={() => openSale(row)}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#2563eb", textDecoration: "underline", font: "inherit" }}>
                  {row.sale}
                </button>
              );
            }
            if (k === "qty") return row.qty_label || (row.qty ? `${row.qty.toFixed(2)} ${unitWord}` : "");
            if (k === "base_qty") {
              if (!row.base_qty) return "";
              return <span style={{ fontSize: 11, color: "#9ca3af" }}>{row.base_qty.toFixed(2)}</span>;
            }
            if (k === "purchase_price" || k === "sale_price" || k === "total") {
              const v = (row as any)[k] as number;
              if (!v) return "";
              return t("reports.currency", { n: v.toFixed(2) });
            }
            return (row as any)[k] ?? "";
          }}
          numericKeys={["purchase_price", "sale_price", "qty", "base_qty", "total"]}
          exportName="item-movement-report"
          printTitle="item-movement-report"
          activeIdx={activeIdx}
          onRowClick={(_r, i) => setActiveIdx(i)}
        />
      </div>
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
      />
    </div>
  );
}
