import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { useContacts } from "@/hooks/use-contacts";
import { useRecalcProductStock } from "@/hooks/use-recalc-stock";
import { useCreatePurchase, useUpdatePurchase } from "@/hooks/use-purchases";
import { PurchaseItemsTable, type Row } from "@/components/purchases/PurchaseItemsTable";
import { PaymentSection, defaultPayment } from "@/components/shared/PaymentSection";
import { Save } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { DateInput } from "@/components/shared/DateInput";
import { useFormHotkeys } from "@/lib/form-hotkeys";
import { useAutoRef } from "@/hooks/use-auto-ref";
import { useContactBalances, computeContactDue } from "@/hooks/use-contact-balances";
import { useFormDraft } from "@/hooks/use-form-draft";
import { useOwnerId } from "@/lib/owner";
import { useUnsavedChangesPrompt } from "@/hooks/use-unsaved-prompt";
import { applyPurchaseOverpayment, computeOverpayment } from "@/lib/contact-overpayment";

const labelStyle: React.CSSProperties = { color: "#374151", fontSize: 13, fontWeight: 600 };
const inputStyle: React.CSSProperties = { border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151" };

const formatBalance = (val: number) => {
  const absVal = Math.abs(val).toFixed(2);
  if (val > 0) return `${absVal} (عليه)`;
  if (val < 0) return `${absVal} (له)`;
  return `0.00`;
};

const purchaseHeaderSchema = z.object({
  purchase_date: z.string().min(1, "التاريخ مطلوب"),
  supplier_id: z.string().uuid().optional().or(z.literal("")),
  total: z.number().gt(0, "إجمالي الفاتورة يجب أن يكون أكبر من صفر"),
  paid_amount: z.number().min(0, "المبلغ المدفوع لا يمكن أن يكون سالباً"),
});

const purchaseRowSchema = z.object({
  description: z.string().min(1, "الوصف مطلوب"),
  quantity: z.number().gt(0, "الكمية يجب أن تكون أكبر من صفر"),
  unit_price: z.number().min(0, "سعر الشراء لا يمكن أن يكون سالباً"),
});

export type PurchaseFormInitial = {
  supplier_id?: string | null;
  ref_no?: string | null;
  purchase_date?: string | null;
  status?: string | null;
  pay_term_number?: number | null;
  pay_term_type?: string | null;
  warehouse_id?: string | null;
  paid_amount?: number | null;
  payment_method?: string | null;
  rows?: Row[];
};

export function PurchaseForm({ editingId, initial }: { editingId?: string; initial?: PurchaseFormInitial }) {
  useRecalcProductStock();
  const { t, dir } = useI18n();
  const navigate = useNavigate();
  const { data: suppliers = [] } = useContacts("supplier");
  const create = useCreatePurchase();
  const update = useUpdatePurchase();
  const isEdit = !!editingId;
  const ownerId = useOwnerId();

  const [supplierId, setSupplierId] = useState(initial?.supplier_id ?? "");
  const [refNo, setRefNo] = useState(initial?.ref_no ?? "");
  const [autoRef] = useAutoRef("purchases", "ref_no", "PUR", !isEdit);
  useEffect(() => { if (!isEdit && autoRef && !refNo) setRefNo(autoRef); }, [autoRef, isEdit]);
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchase_date ?? new Date().toISOString().slice(0, 10));
  const [branch] = useState("BL0001");
  const [status, setStatus] = useState(initial?.status ?? "استلم");
  const [payTermNumber, setPayTermNumber] = useState<string>(initial?.pay_term_number != null ? String(initial.pay_term_number) : "");
  const [payTermType, setPayTermType] = useState(initial?.pay_term_type ?? "days");
  const [rows, setRows] = useState<Row[]>(initial?.rows ?? []);
  const [submitted, setSubmitted] = useState(false);
  const submittedRef = useRef(false);
  useUnsavedChangesPrompt(() => !submittedRef.current && !submitted && rows.length > 0);

  const total = useMemo(() => rows.reduce((s, r) => s + (r.total || 0), 0), [rows]);
  const totalQty = useMemo(() => rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0), [rows]);
  const [payment, setPayment] = useState(() => {
    const base = defaultPayment(initial?.paid_amount ?? 0);
    if (initial?.payment_method) base.method = initial.payment_method as any;
    return base;
  });
  const { overPaid: overPaidAmount } = computeOverpayment(payment.amount, total);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const { data: supplierBalances } = useContactBalances();
  const supplierInfo = useMemo(() => {
    if (!supplierId || !supplierBalances) return null;
    const sup = (suppliers as any[]).find((s) => s.id === supplierId);
    return computeContactDue(sup, supplierBalances.get(supplierId));
  }, [supplierId, supplierBalances, suppliers]);

  const draftState = useMemo(() => ({
    supplierId, refNo, purchaseDate, status, payTermNumber, payTermType, rows, payment,
  }), [supplierId, refNo, purchaseDate, status, payTermNumber, payTermType, rows, payment]);
  const draft = useFormDraft<any>(isEdit ? `purchases:edit:${editingId}` : "purchases:add", draftState, (v) => {
    if (isEdit) return;
    setSupplierId(v.supplierId ?? "");
    setRefNo(v.refNo ?? "");
    setPurchaseDate(v.purchaseDate ?? new Date().toISOString().slice(0, 10));
    setStatus(v.status ?? "استلم");
    setPayTermNumber(v.payTermNumber ?? "");
    setPayTermType(v.payTermType ?? "days");
    setRows(v.rows ?? []);
    if (v.payment) setPayment(v.payment);
  });

  const onSubmit = async () => {
    if (rows.length === 0) return;

    const hc = purchaseHeaderSchema.safeParse({
      purchase_date: purchaseDate, supplier_id: supplierId, total, paid_amount: payment.amount,
    });
    if (!hc.success) { toast.error(hc.error.issues[0]?.message || "بيانات غير صالحة"); return; }
    for (const r of rows) {
      const rc = purchaseRowSchema.safeParse({
        description: r.description ?? "", quantity: Number(r.quantity) || 0, unit_price: Number(r.unit_price) || 0,
      });
      if (!rc.success) { toast.error(`${r.description || "صنف"}: ${rc.error.issues[0]?.message}`); return; }
      if (r.has_expiry && !r.expiry_date) {
        toast.error(`${r.description || "صنف"}: تاريخ الصلاحية مطلوب`);
        return;
      }
      if (r.expiry_date) {
        const today = new Date().toISOString().slice(0, 10);
        if (r.expiry_date < today) { toast.error("تاريخ الصلاحية لا يمكن أن يكون قديمًا"); return; }
      }
    }

    const itemsPayload = rows.map((r) => {
      const p: any = {
        product_id: r.product_id,
        description: r.description,
        quantity: r.quantity,
        unit_price: r.unit_price,
        discount_percent: r.discount_percent,
        total: r.total,
        sell_price: r.sell_price,
        unit_name: r.unit_name || null,
        base_quantity: r.base_quantity ?? r.quantity,
        expiry_date: r.expiry_date || null,
      };
      if (r.id) p.id = r.id;
      return p;
    });

    const { appliedPaid, overPaid } = computeOverpayment(payment.amount, total);
    const header = {
      supplier_id: supplierId || null,
      ref_no: refNo || null,
      purchase_date: purchaseDate,
      branch_id: branch,
      status,
      pay_term_number: payTermNumber ? Number(payTermNumber) : null,
      pay_term_type: payTermType,
      subtotal: total,
      tax: 0,
      total,
      paid_amount: appliedPaid,
      due_amount: Math.max(0, total - appliedPaid),
      payment_status: appliedPaid >= total ? "paid" : appliedPaid > 0 ? "partial" : "pending",
      payment_method: payment.method,
      payment_account: payment.account,
      payment_note: payment.note || null,
      warehouse_id: null,
    };

    const applySupplierOverpay = async () => {
      if (overPaid <= 0.0001) return;
      if (!supplierId) {
        toast.warning(`تم حفظ الفاتورة لكن زيادة الدفع (${overPaid.toFixed(2)}) لم تُخصم — اختر مورداً`);
        return;
      }
      await applyPurchaseOverpayment({
        contactId: supplierId,
        overPaid,
        ownerId,
        refNo: refNo || undefined,
        paymentMethod: payment.method,
        treasuryAccountId: payment.account || null,
        paymentDate: payment.date?.slice(0, 10) ?? null,
        note: `زيادة دفع على فاتورة شراء ${refNo || ""}`.trim(),
        contactType: "supplier",
      });
    };

    if (isEdit) {
      await update.mutateAsync({
        id: editingId!,
        values: {
          ...header,
          items: itemsPayload,
          payment: payment.amount > 0
            ? { amount: payment.amount, payment_method: payment.method, treasury_id: null }
            : undefined,
        } as any,
      });
      await applySupplierOverpay();
    } else {
      await create.mutateAsync({ ...header, items: itemsPayload });
      await applySupplierOverpay();
    }
    submittedRef.current = true;
    setSubmitted(true);
    draft.clear();
    navigate({ to: "/purchases/all" });
  };

  useFormHotkeys({
    onFocusSearch: () => searchRef.current?.focus(),
    onSave: () => onSubmit(),
    onClear: () => searchRef.current?.focus(),
  });

  return (
    <div className="space-y-3 form-strong" dir={dir}>
      <PageHeader title={isEdit ? "تعديل فاتورة الشراء" : t("purchases.page.add_title")} showBack />
      <DataCard>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("purchases.form.supplier")}</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle}>
              <option value="">{t("purchases.form.select_please")}</option>
              {(suppliers as any[]).map((s) => (
                <option key={s.id} value={s.id}>{[s.first_name, s.last_name].filter(Boolean).join(" ") || s.business_name || s.contact_id}</option>
              ))}
            </select>
            {supplierId && supplierInfo != null && (
              <div className="mt-1 text-xs font-bold" style={{ color: supplierInfo.gross > 0 ? "#b91c1c" : supplierInfo.gross < 0 ? "#059669" : "#6b7280" }}>
                الرصيد المستحق: {formatBalance(supplierInfo.gross)}
              </div>
            )}
          </div>
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("purchases.form.ref")}</label>
            <input value={refNo} onChange={(e) => setRefNo(e.target.value)} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("purchases.form.date")}</label>
            <DateInput value={purchaseDate} onChange={setPurchaseDate} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("purchases.form.status")}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle}>
              <option value="استلم">{t("purchases.status.received")}</option>
              <option value="قيد الانتظار">{t("purchases.status.pending")}</option>
              <option value="تم الطلب">{t("purchases.status.ordered")}</option>
            </select>
          </div>
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("purchases.form.pay_term")}</label>
            <div className="flex gap-2">
              <input type="number" value={payTermNumber} onChange={(e) => setPayTermNumber(e.target.value)} placeholder={t("purchases.form.pay_term_ph")} className="h-10 px-3 rounded-md text-sm flex-1 outline-none" style={inputStyle} />
              <select value={payTermType} onChange={(e) => setPayTermType(e.target.value)} className="h-10 px-3 rounded-md text-sm outline-none" style={inputStyle}>
                <option value="days">{t("purchases.form.days")}</option>
                <option value="months">{t("purchases.form.months")}</option>
              </select>
            </div>
          </div>
        </div>
      </DataCard>

      <DataCard>
        <div className="mb-2 text-xs rounded-md px-3 py-2" style={{ backgroundColor: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb" }}>
          F4 بحث · Ctrl+S حفظ · Esc تركيز على البحث
        </div>
        <PurchaseItemsTable rows={rows} onChange={setRows} searchRef={searchRef} autoFocus warehouseId={null} />
        <div className="flex flex-col items-end gap-1 mt-3 text-sm" style={{ color: "#374151" }}>
          <div className="flex gap-3"><span>{t("purchases.form.qty_label")}</span><span className="font-semibold">{totalQty.toFixed(2)}</span></div>
          <div className="flex gap-3"><span>{t("purchases.form.total_label")}</span><span className="font-semibold">{total.toFixed(2)}</span></div>
        </div>
      </DataCard>

      <PaymentSection value={payment} onChange={setPayment} total={total} />

      <div className="rounded-md px-4 py-2.5 mt-3 inline-block" style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}>
        <span className="text-sm font-bold" style={{ color: "#b91c1c" }}>{t("purchases.form.due_amount", { amount: Math.max(0, total - payment.amount).toFixed(2) })}</span>
      </div>
      {overPaidAmount > 0.0001 && (
        <div className="rounded-md px-4 py-2.5 mt-2 inline-block" style={{ backgroundColor: "#ecfeff", border: "1px solid #a5f3fc" }}>
          <span className="text-sm font-bold" style={{ color: "#0e7490" }}>
            {"زيادة الدفع: "}{overPaidAmount.toFixed(2)}{" (سيُخصم من رصيد المورد)"}
          </span>
        </div>
      )}

      <div className="flex justify-center mt-4">
        <button type="button" onClick={onSubmit} disabled={create.isPending || update.isPending || rows.length === 0 || !ownerId} className="h-11 px-8 rounded-md text-white text-sm flex items-center gap-2 disabled:opacity-60" style={{ backgroundColor: "#7c3aed" }}>
          <Save className="h-4 w-4" /> {!ownerId ? "جاري التحميل..." : isEdit ? "حفظ التعديلات" : t("purchases.actions.save")}
        </button>
      </div>
    </div>
  );
}
