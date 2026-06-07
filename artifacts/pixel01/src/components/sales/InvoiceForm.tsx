import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { useContacts } from "@/hooks/use-contacts";
import { useRecalcProductStock } from "@/hooks/use-recalc-stock";
import { useCreateInvoice, useUpdateInvoice, type InvoiceType } from "@/hooks/use-invoices";
import { useOwnerId } from "@/lib/owner";
import { useSalesReps } from "@/hooks/use-sales-reps";
import { SalesItemsTable, type SaleRow } from "@/components/sales/SalesItemsTable";
import { PaymentSection, defaultPayment } from "@/components/shared/PaymentSection";
import { PrintableInvoice } from "@/components/sales/PrintableInvoice";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Save, Printer, Tag, Truck } from "lucide-react";
import { DateInput } from "@/components/shared/DateInput";
import { useFormHotkeys } from "@/lib/form-hotkeys";
import { useAutoRef } from "@/hooks/use-auto-ref";
import { useFormDraft } from "@/hooks/use-form-draft";
import { useContactBalances, computeContactDue } from "@/hooks/use-contact-balances";
import { useUnsavedChangesPrompt } from "@/hooks/use-unsaved-prompt";
import { applySalesOverpayment, computeOverpayment } from "@/lib/contact-overpayment";


const labelStyle: React.CSSProperties = { color: "#374151", fontSize: 13, fontWeight: 600 };
const inputStyle: React.CSSProperties = { border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151" };

const formatBalance = (val: number) => {
  const absVal = Math.abs(val).toFixed(2);
  if (val > 0) return `${absVal} (عليه)`;
  if (val < 0) return `${absVal} (له)`;
  return `0.00`;
};

const invoiceHeaderSchema = z.object({
  issue_date: z.string().min(1, "تاريخ غير صالح"),
  customer_id: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().max(500, "الملاحظات أطول من 500 حرف").optional().or(z.literal("")),
  discount: z.number().min(0, "الخصم لا يمكن أن يكون سالباً"),
  shipping_cost: z.number().min(0, "تكلفة الشحن لا يمكن أن تكون سالبة"),
  total: z.number().gt(0, "الإجمالي يجب أن يكون أكبر من صفر"),
});

const invoiceRowSchema = z.object({
  product_id: z.string().min(1, "اختر المنتج"),
  quantity: z.number().gt(0, "الكمية يجب أن تكون أكبر من صفر"),
  unit_price: z.number().min(0, "السعر لا يمكن أن يكون سالباً"),
  total: z.number().min(0),
});

const TITLE_KEYS: Record<InvoiceType, string> = {
  sale: "sales.titles.add_sale",
  draft: "sales.titles.add_draft",
  quotation: "sales.titles.add_quotation",
  sale_return: "sales.titles.add_return",
};

const REDIRECT: Record<InvoiceType, string> = {
  sale: "/sales/all",
  draft: "/sales/drafts",
  quotation: "/sales/quotations",
  sale_return: "/sales/returns",
};

type ExtraExpense = { name: string; amount: number };

export type InvoiceFormInitial = {
  customer_id?: string | null;
  sales_rep_id?: string | null;
  issue_date?: string | null;
  notes?: string | null;
  warehouse_id?: string | null;
  discount?: number | null;
  shipping_cost?: number | null;
  shipping_status?: string | null;
  payment_method?: string | null;
  paid_amount?: number | null;
  rows?: SaleRow[];
};

export function InvoiceForm({
  mode,
  sessionId,
  editingId,
  initial,
}: {
  mode: InvoiceType;
  sessionId?: string | null;
  editingId?: string;
  initial?: InvoiceFormInitial;
}) {
  const navigate = useNavigate();
  useRecalcProductStock();
  const { t, dir } = useI18n();
  const { data: customers = [] } = useContacts("customer");
  const { data: salesReps = [] } = useSalesReps();
  const create = useCreateInvoice();
  const update = useUpdateInvoice();
  const isEdit = !!editingId;
  const ownerId = useOwnerId();
  const { data: customerBalances } = useContactBalances();
  // Locked to the single main pharmacy stock (products.stock). No secondary warehouse binding.
  const [warehouseId] = useState<string>(initial?.warehouse_id ?? "");

  const [customerId, setCustomerId] = useState(initial?.customer_id ?? "");
  const [salesRepId, setSalesRepId] = useState(initial?.sales_rep_id ?? "");
  const [issueDate, setIssueDate] = useState(() => initial?.issue_date ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [rows, setRows] = useState<SaleRow[]>(initial?.rows ?? []);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [shippingOpen, setShippingOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const submittedRef = useRef(false);
  useUnsavedChangesPrompt(() => !submittedRef.current && !submitted && rows.length > 0);

  // Discount fields
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("fixed");
  const [discountInput, setDiscountInput] = useState(initial?.discount ?? 0);
  const [taxMode, setTaxMode] = useState<"none" | "inclusive" | "exclusive">("none");

  // Shipping fields
  const [shippingDetails, setShippingDetails] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingCost, setShippingCost] = useState(initial?.shipping_cost ?? 0);
  const [deliveredTo, setDeliveredTo] = useState("");
  const [deliveryPerson, setDeliveryPerson] = useState("");
  const [shippingStatus, setShippingStatus] = useState(initial?.shipping_status ?? "pending");
  const [extraExpenses, setExtraExpenses] = useState<ExtraExpense[]>([
    { name: "", amount: 0 }, { name: "", amount: 0 }, { name: "", amount: 0 }, { name: "", amount: 0 },
  ]);

  const subtotal = useMemo(() => rows.reduce((s, r) => s + (r.total || 0), 0), [rows]);
  const discount = useMemo(() => {
    const v = Number(discountInput) || 0;
    return discountType === "percentage" ? (subtotal * v) / 100 : v;
  }, [discountInput, discountType, subtotal]);
  const extraSum = useMemo(() => extraExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0), [extraExpenses]);
  const total = Math.max(0, subtotal - discount + shippingCost + extraSum);
  const totalQty = useMemo(() => rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0), [rows]);
  const [payment, setPayment] = useState(() => {
    const base = defaultPayment(initial?.paid_amount ?? 0);
    if (initial?.payment_method) base.method = initial.payment_method as any;
    return base;
  });
  const saleOverpay = useMemo(
    () => (mode === "sale" ? computeOverpayment(payment.amount, total) : { appliedPaid: 0, overPaid: 0 }),
    [mode, payment.amount, total],
  );
  const overPaidAmount = saleOverpay.overPaid;
  const invPrefix = mode === "draft" ? "DRF" : mode === "quotation" ? "QTE" : mode === "sale_return" ? "RET" : "INV";
  const [autoInvNo] = useAutoRef("invoices", "invoice_number", invPrefix, true);
  const [printingInvoice, setPrintingInvoice] = useState<any>(null);
  const [printingItems, setPrintingItems] = useState<any[]>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Auto-save draft so power/network outage doesn't lose work
  const draftState = useMemo(() => ({
    customerId, salesRepId, issueDate, notes, rows,
    discountType, discountInput, taxMode,
    shippingDetails, shippingAddress, shippingCost, deliveredTo, deliveryPerson, shippingStatus,
    extraExpenses, payment,
  }), [customerId, salesRepId, issueDate, notes, rows, discountType, discountInput, taxMode,
       shippingDetails, shippingAddress, shippingCost, deliveredTo, deliveryPerson, shippingStatus,
       extraExpenses, payment]);
  const draft = useFormDraft<any>(`sales:${mode}${sessionId ? `:${sessionId}` : ""}`, draftState, (v) => {
    if (isEdit) return; // never restore draft when editing an existing invoice
    setCustomerId(v.customerId ?? "");
    setSalesRepId(v.salesRepId ?? "");
    setIssueDate(v.issueDate ?? new Date().toISOString().slice(0, 10));
    setNotes(v.notes ?? "");
    setRows(v.rows ?? []);
    setDiscountType(v.discountType ?? "percentage");
    setDiscountInput(Number(v.discountInput) || 0);
    setTaxMode(v.taxMode ?? "none");
    setShippingDetails(v.shippingDetails ?? "");
    setShippingAddress(v.shippingAddress ?? "");
    setShippingCost(Number(v.shippingCost) || 0);
    setDeliveredTo(v.deliveredTo ?? "");
    setDeliveryPerson(v.deliveryPerson ?? "");
    setShippingStatus(v.shippingStatus ?? "pending");
    if (Array.isArray(v.extraExpenses)) setExtraExpenses(v.extraExpenses);
    if (v.payment) setPayment(v.payment);
  });




  useEffect(() => {
    if (!printingInvoice) return;
    const finish = () => {
      setPrintingInvoice(null);
      setPrintingItems([]);
      window.onafterprint = null;
      navigate({ to: REDIRECT[mode] });
    };
    window.onafterprint = finish;
    const t = setTimeout(() => {
      requestAnimationFrame(() => setTimeout(() => {
        try { window.print(); } catch { finish(); }
      }, 150));
    }, 50);
    return () => clearTimeout(t);
  }, [printingInvoice, mode, navigate]);

  const onSubmit = async (andPrint = false) => {
    if (rows.length === 0) return;

    // Header validation
    const headerCheck = invoiceHeaderSchema.safeParse({
      issue_date: issueDate,
      customer_id: customerId,
      notes,
      discount,
      shipping_cost: shippingCost,
      total,
    });
    if (!headerCheck.success) {
      toast.error(headerCheck.error.issues[0]?.message || "بيانات غير صالحة");
      return;
    }

    // Row validation
    for (const r of rows) {
      const rc = invoiceRowSchema.safeParse({
        product_id: r.product_id ?? "",
        quantity: Number(r.quantity) || 0,
        unit_price: Number(r.unit_price) || 0,
        total: Number(r.total) || 0,
      });
      if (!rc.success) {
        toast.error(`${r.description || "صنف"}: ${rc.error.issues[0]?.message}`);
        return;
      }
    }

    // Stock guard + warranty lookup (sale only). Expiry is now resolved per-row in SalesItemsTable.
    const warrantyEndByProduct = new Map<string, string | null>();
    if (mode === "sale") {
      const ids = Array.from(new Set(rows.map((r) => r.product_id).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: prodRows } = await supabase
          .from("products")
          .select("id,name,stock,has_expiry,warranty_id")
          .in("id", ids);
        const prodMap = new Map((prodRows ?? []).map((p: any) => [p.id, p]));

        // Stock guard against the main pharmacy stock (products.stock)
        const requested = new Map<string, number>();
        for (const r of rows) {
          if (!r.product_id) continue;
          const q = Number(r.base_quantity ?? r.quantity) || 0;
          requested.set(r.product_id, (requested.get(r.product_id) || 0) + q);
        }
        for (const [pid, qty] of requested) {
          const p: any = prodMap.get(pid);
          const available = Number(p?.stock ?? 0);
          if (qty > available) {
            toast.error(`الكمية المطلوبة من "${p?.name ?? "الصنف"}" (${qty}) أكبر من المتاح بالمخزون (${available})`);
            return;
          }
        }


        // Visual warning for any selected expiry within 30 days
        const soonMs = 30 * 24 * 60 * 60 * 1000;
        for (const r of rows) {
          if (!r.expiry_date) continue;
          const diff = new Date(r.expiry_date).getTime() - Date.now();
          if (diff <= soonMs) {
            toast.warning(t("sales.items.expiry_soon", { date: r.expiry_date }) + ` — ${r.description}`);
          }
        }

        // Warranty end-date per product
        const warrantyIds = Array.from(new Set(
          (prodRows ?? []).map((p: any) => p.warranty_id).filter(Boolean)
        )) as string[];
        if (warrantyIds.length) {
          const { data: ws } = await supabase
            .from("warranties")
            .select("id,duration,duration_unit")
            .in("id", warrantyIds);
          const wMap = new Map((ws ?? []).map((w: any) => [w.id, w]));
          for (const p of prodRows ?? []) {
            const w: any = wMap.get((p as any).warranty_id);
            if (!w) continue;
            const d = new Date(issueDate);
            const n = Number(w.duration) || 0;
            if (w.duration_unit === "day") d.setDate(d.getDate() + n);
            else if (w.duration_unit === "month") d.setMonth(d.getMonth() + n);
            else if (w.duration_unit === "year") d.setFullYear(d.getFullYear() + n);
            warrantyEndByProduct.set((p as any).id, d.toISOString().slice(0, 10));
          }
        }
      }
    }

    const paidRaw = mode === "sale" ? payment.amount : 0;
    const { appliedPaid: paid, overPaid } = mode === "sale"
      ? computeOverpayment(paidRaw, total)
      : { appliedPaid: 0, overPaid: 0 };

    const applyCustomerOverpay = async (invoiceRef?: string | null) => {
      if (mode !== "sale" || overPaid <= 0.0001) return;
      if (!customerId) {
        toast.warning(`تم حفظ الفاتورة لكن زيادة الدفع (${overPaid.toFixed(2)}) لم تُضاف — اختر عميلاً`);
        return;
      }
      await applySalesOverpayment({
        contactId: customerId,
        overPaid,
        ownerId,
        refNo: invoiceRef ?? autoInvNo ?? undefined,
        paymentMethod: payment.method,
        note: `زيادة دفع على فاتورة بيع ${invoiceRef || autoInvNo || ""}`.trim(),
        contactType: "customer",
      });
    };

    const itemsPayload = rows.map((r) => ({
      product_id: r.product_id,
      description: r.description,
      quantity: r.quantity,
      unit_price: r.unit_price,
      discount_amount: r.discount_amount,
      total: r.total,
      unit_name: r.unit_name || null,
      base_quantity: r.base_quantity ?? r.quantity,
      expiry_date: r.expiry_date ?? null,
      warranty_end_date: r.product_id ? warrantyEndByProduct.get(r.product_id) ?? null : null,
    }));
    if (isEdit) {
      await update.mutateAsync({
        id: editingId!,
        header: {
          customer_id: customerId || null,
          sales_rep_id: salesRepId || null,
          issue_date: issueDate,
          notes: notes || null,
          subtotal,
          tax: 0,
          discount,
          shipping_cost: shippingCost + extraSum,
          total,
          paid_amount: paid,
          payment_status: paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid",
          shipping_status: shippingStatus,
          payment_method: payment.method,
          warehouse_id: warehouseId || null,
        },
        items: itemsPayload,
        payment: mode === "sale" && paidRaw > 0
          ? { amount: paidRaw, payment_method: payment.method, treasury_id: null }
          : null,
      });
      await applyCustomerOverpay();
      submittedRef.current = true;
      setSubmitted(true);
      navigate({ to: REDIRECT[mode] });
      return;
    }
    const id = await create.mutateAsync({
      type: mode,
      customer_id: customerId || null,
      sales_rep_id: salesRepId || null,
      issue_date: issueDate,
      notes: notes || null,
      status: mode === "sale" ? "final" : "draft",
      subtotal,
      tax: 0,
      discount,
      shipping_cost: shippingCost + extraSum,
      total,
      paid_amount: paid,
      payment_status: paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid",
      shipping_status: shippingStatus,
      payment_method: payment.method,
      session_id: sessionId || null,
      warehouse_id: warehouseId || null,
      items: itemsPayload,
    });
    const { data: createdInv } = await supabase
      .from("invoices")
      .select("invoice_number")
      .eq("id", id)
      .maybeSingle();
    await applyCustomerOverpay((createdInv as any)?.invoice_number ?? autoInvNo);
    submittedRef.current = true;
    setSubmitted(true);
    if (andPrint) {
      const { data: inv } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      draft.clear();
      setPrintingItems(rows.map((r) => ({
        id: r.product_id || Math.random().toString(),
        description: r.description,
        quantity: r.quantity,
        unit_price: r.unit_price,
        total: r.total,
        unit_name: r.unit_name,
      })));
      setPrintingInvoice(inv);
      return;
    }
    draft.clear();
    navigate({ to: REDIRECT[mode] });
  };


  const updateExtra = (i: number, patch: Partial<ExtraExpense>) =>
    setExtraExpenses((es) => es.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const addExtra = () => setExtraExpenses((es) => [...es, { name: "", amount: 0 }]);

  useFormHotkeys({
    onFocusSearch: () => searchRef.current?.focus(),
    onSave: () => onSubmit(false),
    onClear: () => searchRef.current?.focus(),
  });


  return (
    <div className="space-y-3 form-strong" dir={dir}>

      <PageHeader title={isEdit ? "تعديل الفاتورة" : t(TITLE_KEYS[mode])} showBack={isEdit} />

      <DataCard className="border-gray-300">
        <div className="flex justify-end mb-3">
          <div className="flex items-center gap-2 h-9 px-3 rounded-md text-sm" style={{ backgroundColor: "#f3f4f6", border: "1px solid #d1d5db", color: "#374151" }}>
            <span>📍</span> {t("sales.form.branch_main")}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("sales.form.customer")}</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle}>
              <option value="">{t("sales.filters.cash_customer")}</option>
              {(customers as any[]).map((c) => (
                <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.business_name || c.contact_id}</option>
              ))}
            </select>
            {customerId && customerBalances && (() => {
              const cust = (customers as any[]).find((c) => c.id === customerId);
              const info = computeContactDue(cust, customerBalances.get(customerId));
              return (
                <div className="mt-1 text-xs font-bold" style={{ color: info.gross > 0 ? "#b91c1c" : info.gross < 0 ? "#059669" : "#6b7280" }}>
                  الرصيد المستحق: {formatBalance(info.gross)}
                </div>
              );
            })()}
          </div>
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("sales.form.default_price")}</label>
            <input value={t("sales.form.default_price_value")} readOnly className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("sales.form.payment_method")}</label>
            <input value={t("sales.pay.cash")} readOnly className="h-10 px-3 rounded-md text-sm w-full outline-none" style={{ ...inputStyle, backgroundColor: "#f9fafb" }} />
          </div>
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("sales.form.sale_date")}</label>
            <DateInput value={issueDate} onChange={setIssueDate} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("sales.form.invoice_design")}</label>
            <select className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle}>
              <option>{t("sales.form.invoice_design_default")}</option>
            </select>
          </div>
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("sales.form.invoice_no")}</label>
            <input value={autoInvNo} placeholder={t("sales.form.invoice_auto")} readOnly className="h-10 px-3 rounded-md text-sm w-full outline-none" style={{ ...inputStyle, backgroundColor: "#f9fafb" }} />
          </div>
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("users.page.sales_reps_title")}</label>
            <select value={salesRepId} onChange={(e) => setSalesRepId(e.target.value)} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle}>
              <option value="">—</option>
              {(salesReps as any[]).map((r) => (
                <option key={r.id} value={r.id}>{[r.prefix, r.first_name, r.last_name].filter(Boolean).join(" ")}</option>
              ))}
            </select>
          </div>
        </div>
      </DataCard>

      <DataCard className="border-gray-300">
        <div className="mb-2 text-xs rounded-md px-3 py-2" style={{ backgroundColor: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb" }}>
          F4 بحث · Ctrl+S حفظ · Esc تركيز على البحث
        </div>
        <SalesItemsTable rows={rows} onChange={setRows} searchRef={searchRef} autoFocus warehouseId={warehouseId || null} />

        <div className="flex justify-between items-center mt-3 text-sm" style={{ color: "#374151" }}>
          <div className="flex gap-4">
            <span>{t("sales.form.qty")} <b>{totalQty.toFixed(2)}</b></span>
            <span>{t("sales.form.total")} <b>{subtotal.toFixed(2)}</b></span>
          </div>
        </div>
      </DataCard>

      <button type="button" onClick={() => setDiscountOpen((v) => !v)} className="w-full h-10 rounded-md text-white text-sm flex items-center justify-center gap-2" style={{ backgroundColor: "#16a34a" }}>
        <Tag className="h-4 w-4" /> {t("sales.form.add_discount")}
      </button>
      {discountOpen && (
        <DataCard className="border-gray-300">
          <div className="px-3 py-2 -mx-4 -mt-4 mb-3 text-white text-sm font-bold text-center" style={{ backgroundColor: "#16a34a" }}>{t("sales.form.add_discount")}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1.5" style={labelStyle}>{t("sales.form.discount_type")}</label>
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value as any)} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle}>
                <option value="percentage">{t("sales.form.discount_percent")}</option>
                <option value="fixed">{t("sales.form.discount_fixed")}</option>
              </select>
            </div>
            <div>
              <label className="block mb-1.5" style={labelStyle}>{t("sales.form.discount_amount")}</label>
              <input type="number" min={0} step="0.01" value={discountInput} onChange={(e) => setDiscountInput(Number(e.target.value))} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle} />
              <div className="text-xs mt-1" style={{ color: "#6b7280" }}>{t("sales.form.discount_minus")} {discount.toFixed(2)}</div>
            </div>
            <div>
              <label className="block mb-1.5" style={labelStyle}>{t("sales.form.tax")}</label>
              <select value={taxMode} onChange={(e) => setTaxMode(e.target.value as any)} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle}>
                <option value="none">{t("sales.form.tax_none")}</option>
                <option value="inclusive">{t("sales.form.tax_inclusive")}</option>
                <option value="exclusive">{t("sales.form.tax_exclusive")}</option>
              </select>
              <div className="text-xs mt-1" style={{ color: "#6b7280" }}>{t("sales.form.tax_plus")} 0.00</div>
            </div>
            <div>
              <label className="block mb-1.5" style={labelStyle}>{t("sales.form.note")}</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="px-3 py-2 rounded-md text-sm w-full outline-none" style={inputStyle} />
            </div>
          </div>
        </DataCard>
      )}

      <button type="button" onClick={() => setShippingOpen((v) => !v)} className="w-full h-10 rounded-md text-white text-sm flex items-center justify-center gap-2" style={{ backgroundColor: "#3b82f6" }}>
        <Truck className="h-4 w-4" /> {t("sales.form.add_shipping")}
      </button>
      {shippingOpen && (
        <DataCard className="border-gray-300">
          <div className="px-3 py-2 -mx-4 -mt-4 mb-3 text-white text-sm font-bold text-center" style={{ backgroundColor: "#3b82f6" }}>{t("sales.form.add_shipping")}</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block mb-1.5" style={labelStyle}>{t("sales.form.shipping_details")}</label>
              <textarea value={shippingDetails} onChange={(e) => setShippingDetails(e.target.value)} rows={2} className="px-3 py-2 rounded-md text-sm w-full outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block mb-1.5" style={labelStyle}>{t("sales.form.shipping_address")}</label>
              <textarea value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} rows={2} className="px-3 py-2 rounded-md text-sm w-full outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block mb-1.5" style={labelStyle}>{t("sales.form.shipping_cost")}</label>
              <input type="number" min={0} step="0.01" value={shippingCost} onChange={(e) => setShippingCost(Number(e.target.value))} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block mb-1.5" style={labelStyle}>{t("sales.form.shipping_status")}</label>
              <select value={shippingStatus} onChange={(e) => setShippingStatus(e.target.value)} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle}>
                <option value="pending">{t("sales.ship.pending")}</option>
                <option value="shipped">{t("sales.ship.shipped")}</option>
                <option value="delivered">{t("sales.ship.delivered")}</option>
                <option value="returned">{t("sales.ship.returned")}</option>
              </select>
            </div>
            <div>
              <label className="block mb-1.5" style={labelStyle}>{t("sales.form.delivered_to")}</label>
              <input value={deliveredTo} onChange={(e) => setDeliveredTo(e.target.value)} placeholder={t("sales.form.delivered_to")} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block mb-1.5" style={labelStyle}>{t("sales.form.delivery_person")}</label>
              <select value={deliveryPerson} onChange={(e) => setDeliveryPerson(e.target.value)} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle}>
                <option value="">{t("sales.form.please_select")}</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block mb-1.5" style={labelStyle}>{t("sales.form.shipping_docs")}</label>
              <button type="button" className="h-10 px-4 rounded-md text-white text-sm" style={{ backgroundColor: "#3b82f6" }}>📁 {t("sales.form.browse")}</button>
            </div>
          </div>
          <div className="mt-4 flex justify-center">
            <button type="button" onClick={addExtra} className="h-9 px-4 rounded-md text-white text-sm" style={{ backgroundColor: "#a78bfa" }}>{t("sales.form.add_extra_expense")}</button>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="text-xs font-semibold" style={{ color: "#374151" }}>{t("sales.form.extra_name")}</div>
            <div className="text-xs font-semibold" style={{ color: "#374151" }}>{t("sales.form.extra_amount")}</div>
            {extraExpenses.map((e, i) => (
              <div key={i} className="contents">
                <input value={e.name} onChange={(ev) => updateExtra(i, { name: ev.target.value })} className="h-9 px-3 rounded-md text-sm outline-none" style={inputStyle} />
                <input type="number" min={0} step="0.01" value={e.amount} onChange={(ev) => updateExtra(i, { amount: Number(ev.target.value) })} className="h-9 px-3 rounded-md text-sm outline-none" style={inputStyle} />
              </div>
            ))}
          </div>
          <div className="text-center text-sm mt-3" style={{ color: "#374151" }}>{t("sales.form.balance")} {(shippingCost + extraSum).toFixed(2)}</div>
        </DataCard>
      )}

      {mode === "sale" && (
        <>
          <PaymentSection value={payment} onChange={setPayment} total={total} />
          <div className="rounded-md px-4 py-2.5 mt-3 inline-block" style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}>
            <span className="text-sm font-bold" style={{ color: "#b91c1c" }}>{t("sales.form.due_amount").replace("{amount}", Math.max(0, total - payment.amount).toFixed(2))}</span>
          </div>
          {overPaidAmount > 0.0001 && (
            <div className="rounded-md px-4 py-2.5 mt-2 inline-block" style={{ backgroundColor: "#ecfeff", border: "1px solid #a5f3fc" }}>
              <span className="text-sm font-bold" style={{ color: "#0e7490" }}>
                {"زيادة الدفع: "}{overPaidAmount.toFixed(2)}{" (سيُضاف رصيد للعميل)"}
              </span>
            </div>
          )}
        </>
      )}

      <div className="sticky bottom-0 z-10 rounded-md border border-gray-300 bg-white shadow-lg p-3 mt-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-sm items-center" style={{ color: "#374151" }}>
          <div className="space-y-1">
            <div>{t("sales.form.discount_label")} <b>-{discount.toFixed(2)}</b></div>
            <div>{t("sales.form.shipping_label")} <b>+{shippingCost.toFixed(2)}</b></div>
          </div>
          <div className="space-y-1">
            <div>{t("sales.form.extra_label")} <b>+{extraSum.toFixed(2)}</b></div>
          </div>
          <div className="text-lg font-bold text-end" style={{ color: "#16a34a" }}>{t("sales.form.grand_total")} {total.toFixed(2)} ج.م</div>
        </div>
      </div>

      <div className="flex justify-center gap-3 mt-4">
        {!isEdit && (
          <button type="button" onClick={() => onSubmit(true)} disabled={create.isPending || rows.length === 0 || !ownerId} className="h-11 px-6 rounded-md text-white text-sm flex items-center gap-2 disabled:opacity-60" style={{ backgroundColor: "#16a34a" }}>
            <Printer className="h-4 w-4" /> {!ownerId ? "جاري التحميل..." : t("sales.actions.save_print")}
          </button>
        )}
        <button type="button" onClick={() => onSubmit(false)} disabled={create.isPending || update.isPending || rows.length === 0 || !ownerId} className="h-11 px-8 rounded-md text-white text-sm flex items-center gap-2 disabled:opacity-60" style={{ backgroundColor: "#7c3aed" }}>
          <Save className="h-4 w-4" /> {!ownerId ? "جاري التحميل..." : isEdit ? "حفظ التعديلات" : t("sales.actions.save")}
        </button>
      </div>

      {printingInvoice && (
        <PrintableInvoice
          mode="invoice"
          invoice={printingInvoice}
          items={printingItems}
          customerName={(customers as any[]).find((c) => c.id === customerId)?.name}
        />
      )}
    </div>
  );
}
