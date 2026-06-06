import { useMemo, useState, useEffect, useRef } from "react";
import { DataCard } from "@/components/products/DataCard";
import { useExpenseCategories } from "@/hooks/use-expense-categories";
import { useContacts } from "@/hooks/use-contacts";
import { useSalesReps } from "@/hooks/use-sales-reps";
import { PaymentSection, defaultPayment } from "@/components/shared/PaymentSection";
import { Save, ChevronDown, ChevronUp } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/lib/i18n";
import { z } from "zod";
import { toast } from "sonner";
import { DateInput } from "@/components/shared/DateInput";
import type { ExpenseInput } from "@/hooks/use-expenses-new";
import { useAutoRef } from "@/hooks/use-auto-ref";
import { useFormDraft } from "@/hooks/use-form-draft";
import { useOwnerId } from "@/lib/owner";
import { useUnsavedChangesPrompt } from "@/hooks/use-unsaved-prompt";

const expenseSchema = z.object({
  expense_date: z.string().min(1, "التاريخ مطلوب"),
  amount: z.number().gt(0, "المبلغ يجب أن يكون أكبر من صفر"),
  category_id: z.string().uuid("اختر فئة المصروف"),
  paid_amount: z.number().min(0, "المدفوع لا يمكن أن يكون سالباً"),
  payment_method: z.string().optional(),
}).refine((d) => d.paid_amount <= d.amount, {
  message: "المدفوع لا يمكن أن يكون أكبر من إجمالي المصروف",
  path: ["paid_amount"],
}).refine((d) => d.paid_amount === 0 || (d.payment_method && d.payment_method.length > 0), {
  message: "اختر طريقة الدفع",
  path: ["payment_method"],
});

const labelStyle: React.CSSProperties = { color: "#374151", fontSize: 13, fontWeight: 600 };
const inputStyle: React.CSSProperties = { border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151" };

export type ExpenseFormInitial = Partial<{
  branch_id: string;
  category_id: string;
  sub_category_id: string;
  sales_rep_id: string;
  ref_no: string;
  expense_date: string;
  spent_by: string;
  spent_to: string;
  amount: number;
  reason: string;
  is_recurring: boolean;
  recur_interval_number: number;
  recur_interval_type: string;
  recur_count: number;
  tax_applied: string;
  payment_method: string;
  payment_account: string;
  payment_note: string;
  paid_amount: number;
  notes: string;
}>;

export function ExpenseForm({
  initial,
  submitLabel,
  isSubmitting,
  onSubmit,
}: {
  initial?: ExpenseFormInitial;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (values: ExpenseInput) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const ownerId = useOwnerId();
  const { data: cats = [] } = useExpenseCategories();
  const { data: contacts = [] } = useContacts("both");
  const { data: salesReps = [] } = useSalesReps();

  const [branch, setBranch] = useState(initial?.branch_id ?? "BL0001");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [subCategoryId, setSubCategoryId] = useState(initial?.sub_category_id ?? "");
  const [refNo, setRefNo] = useState(initial?.ref_no ?? "");
  const [autoRef] = useAutoRef("expenses", "ref_no", "EXP", !initial);
  useEffect(() => { if (!initial && !refNo && autoRef) setRefNo(autoRef); }, [autoRef, initial]);
  const [date, setDate] = useState(initial?.expense_date ?? new Date().toISOString().slice(0, 10));
  const [spentBy, setSpentBy] = useState(initial?.spent_by ?? "other");
  const [spentTo, setSpentTo] = useState(initial?.spent_to ?? "");
  const [salesRepId, setSalesRepId] = useState(initial?.sales_rep_id ?? "");
  const [amount, setAmount] = useState<string>(initial?.amount != null ? String(initial.amount) : "");
  const [reason, setReason] = useState(initial?.reason ?? "");

  const [openExtras, setOpenExtras] = useState(false);
  const [recurring, setRecurring] = useState(!!initial?.is_recurring);
  const [recurNumber, setRecurNumber] = useState(initial?.recur_interval_number != null ? String(initial.recur_interval_number) : "");
  const [recurType, setRecurType] = useState(initial?.recur_interval_type ?? "days");
  const [recurCount, setRecurCount] = useState(initial?.recur_count != null ? String(initial.recur_count) : "");
  const [tax, setTax] = useState(initial?.tax_applied ?? "other");
  const [isRefund, setIsRefund] = useState(false);

  const total = Number(amount) || 0;
  const [payment, setPayment] = useState(() => {
    const p = defaultPayment(initial?.paid_amount ?? 0);
    if (initial?.payment_method) (p as any).method = initial.payment_method;
    if (initial?.payment_account) p.account = initial.payment_account;
    if (initial?.payment_note) p.note = initial.payment_note;
    if (initial?.paid_amount != null) p.amount = initial.paid_amount;
    return p;
  });


  // re-hydrate when initial loads async
  const initKey = JSON.stringify(initial ?? {});
  useEffect(() => {
    if (!initial) return;
    setBranch(initial.branch_id ?? "BL0001");
    setCategoryId(initial.category_id ?? "");
    setSubCategoryId(initial.sub_category_id ?? "");
    setRefNo(initial.ref_no ?? "");
    setDate(initial.expense_date ?? new Date().toISOString().slice(0, 10));
    setSpentBy(initial.spent_by ?? "other");
    setSpentTo(initial.spent_to ?? "");
    setSalesRepId(initial.sales_rep_id ?? "");
    setAmount(initial.amount != null ? String(initial.amount) : "");
    setReason(initial.reason ?? "");
    setRecurring(!!initial.is_recurring);
    setRecurNumber(initial.recur_interval_number != null ? String(initial.recur_interval_number) : "");
    setRecurType(initial.recur_interval_type ?? "days");
    setRecurCount(initial.recur_count != null ? String(initial.recur_count) : "");
    setTax(initial.tax_applied ?? "other");
    setPayment({
      ...defaultPayment(initial.paid_amount ?? 0),
      method: initial.payment_method ?? "",
      account: initial.payment_account ?? "",
      note: initial.payment_note ?? "",
      amount: initial.paid_amount ?? 0,
    } as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initKey]);

  // Auto-save draft (only for new expenses, not when editing)
  const draftState = useMemo(() => ({
    branch, categoryId, subCategoryId, refNo, date, spentBy, spentTo, salesRepId,
    amount, reason, recurring, recurNumber, recurType, recurCount, tax, isRefund, payment,
  }), [branch, categoryId, subCategoryId, refNo, date, spentBy, spentTo, salesRepId,
       amount, reason, recurring, recurNumber, recurType, recurCount, tax, isRefund, payment]);
  const draft = useFormDraft<any>("expenses:add", draftState, (v) => {
    setBranch(v.branch ?? "BL0001");
    setCategoryId(v.categoryId ?? "");
    setSubCategoryId(v.subCategoryId ?? "");
    setRefNo(v.refNo ?? "");
    setDate(v.date ?? new Date().toISOString().slice(0, 10));
    setSpentBy(v.spentBy ?? "other");
    setSpentTo(v.spentTo ?? "");
    setSalesRepId(v.salesRepId ?? "");
    setAmount(v.amount ?? "");
    setReason(v.reason ?? "");
    setRecurring(!!v.recurring);
    setRecurNumber(v.recurNumber ?? "");
    setRecurType(v.recurType ?? "days");
    setRecurCount(v.recurCount ?? "");
    setTax(v.tax ?? "other");
    setIsRefund(!!v.isRefund);
    if (v.payment) setPayment(v.payment);
  }, { enabled: !initial });


  const subCats = useMemo(() => (cats as any[]).filter((c) => c.parent_id === categoryId), [cats, categoryId]);
  const parents = useMemo(() => (cats as any[]).filter((c) => !c.parent_id), [cats]);

  // Track unsaved changes
  const submittedRef = useRef(false);
  const currentSnap = JSON.stringify({ branch, categoryId, subCategoryId, refNo, date, spentBy, spentTo, salesRepId, amount, reason, recurring, recurNumber, recurType, recurCount, tax, payment });
  const baselineRef = useRef(currentSnap);
  useEffect(() => { baselineRef.current = JSON.stringify({ branch: initial?.branch_id ?? "BL0001", categoryId: initial?.category_id ?? "", subCategoryId: initial?.sub_category_id ?? "", refNo: initial?.ref_no ?? "", date: initial?.expense_date ?? new Date().toISOString().slice(0,10), spentBy: initial?.spent_by ?? "other", spentTo: initial?.spent_to ?? "", salesRepId: initial?.sales_rep_id ?? "", amount: initial?.amount != null ? String(initial.amount) : "", reason: initial?.reason ?? "", recurring: !!initial?.is_recurring, recurNumber: initial?.recur_interval_number != null ? String(initial.recur_interval_number) : "", recurType: initial?.recur_interval_type ?? "days", recurCount: initial?.recur_count != null ? String(initial.recur_count) : "", tax: initial?.tax_applied ?? "other", payment: { ...defaultPayment(initial?.paid_amount ?? 0), method: initial?.payment_method ?? "", account: initial?.payment_account ?? "", note: initial?.payment_note ?? "", amount: initial?.paid_amount ?? 0 } }); }, [initKey]);
  useUnsavedChangesPrompt(() => !submittedRef.current && currentSnap !== baselineRef.current);

  const handleSubmit = async () => {
    if (!total) return;
    const check = expenseSchema.safeParse({
      expense_date: date,
      amount: total,
      category_id: categoryId,
      paid_amount: payment.amount,
      payment_method: payment.method,
    });
    if (!check.success) {
      toast.error(check.error.issues[0]?.message || "بيانات غير صالحة");
      return;
    }
    await onSubmit({
      branch_id: branch,
      category_id: categoryId || null,
      sub_category_id: subCategoryId || null,
      sales_rep_id: salesRepId || null,
      ref_no: refNo || null,
      expense_date: date,
      spent_by: spentBy,
      spent_to: spentTo || null,
      amount: total,
      reason: reason || null,
      is_recurring: recurring,
      recur_interval_number: recurNumber ? Number(recurNumber) : null,
      recur_interval_type: recurType,
      recur_count: recurCount ? Number(recurCount) : null,
      tax_applied: tax,
      payment_method: payment.method,
      payment_account: payment.account,
      payment_note: payment.note || null,
      paid_amount: payment.amount,
      due_amount: Math.max(0, total - payment.amount),
      payment_status: payment.amount >= total ? "paid" : payment.amount > 0 ? "partial" : "pending",
      notes: isRefund ? t("expenses.form.refund_note") : (initial?.notes ?? null),
    });
    submittedRef.current = true;
    if (!initial) draft.clear();
  };


  return (
    <div className="form-strong">
      <DataCard>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("expenses.form.category")}</label>
            <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubCategoryId(""); }} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle}>
              <option value="">{t("expenses.form.choose")}</option>
              {parents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("expenses.form.sub_category")}</label>
            <select value={subCategoryId} onChange={(e) => setSubCategoryId(e.target.value)} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle} disabled={!categoryId}>
              <option value="">{t("expenses.form.choose")}</option>
              {subCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("expenses.form.ref_no")}</label>
            <input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder={t("expenses.form.ref_ph")} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("expenses.form.date")}</label>
            <DateInput value={date} onChange={setDate} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("expenses.form.spent_by")}</label>
            <select value={spentBy} onChange={(e) => setSpentBy(e.target.value)} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle}>
              <option value="other">{t("expenses.form.spent_by_other")}</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block mb-1.5" style={labelStyle}>{t("expenses.form.spent_to")}</label>
            <select value={spentTo || (salesRepId ? `rep:${salesRepId}` : "")} onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith("rep:")) { setSalesRepId(v.slice(4)); setSpentTo(""); }
              else { setSpentTo(v); setSalesRepId(""); }
            }} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle}>
              <option value="">زبون نقدي</option>
              {(contacts as any[]).length > 0 && <optgroup label="جهات الاتصال">
                {(contacts as any[]).map((c) => (
                  <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.business_name || c.contact_id}</option>
                ))}
              </optgroup>}
              {(salesReps as any[]).length > 0 && <optgroup label="مندوبو المبيعات">
                {(salesReps as any[]).map((r) => (
                  <option key={r.id} value={`rep:${r.id}`}>{[r.prefix, r.first_name, r.last_name].filter(Boolean).join(" ")}</option>
                ))}
              </optgroup>}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block mb-1.5" style={labelStyle}>{t("expenses.form.reason")}</label>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-3 py-2 rounded-md text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="block mb-1.5" style={labelStyle}>{t("expenses.form.amount")}</label>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("expenses.form.amount_ph")} className="h-10 px-3 rounded-md text-sm w-full outline-none text-end" style={inputStyle} />
          </div>
        </div>

        <button type="button" onClick={() => setOpenExtras((v) => !v)} className="w-full mt-4 h-10 rounded-md text-white text-sm flex items-center justify-center gap-2" style={{ backgroundColor: "#3b82f6" }}>
          {t("expenses.form.extras")} {openExtras ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {openExtras && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-md" style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb" }}>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={recurring} onCheckedChange={(v) => setRecurring(!!v)} />
              <span className="text-sm">{t("expenses.form.recurring")}</span>
            </label>
            <div>
              <label className="block mb-1.5" style={labelStyle}>{t("expenses.form.recur_interval")}</label>
              <div className="flex gap-2">
                <input type="number" disabled={!recurring} value={recurNumber} onChange={(e) => setRecurNumber(e.target.value)} className="h-10 px-3 rounded-md text-sm flex-1 outline-none" style={inputStyle} />
                <select disabled={!recurring} value={recurType} onChange={(e) => setRecurType(e.target.value)} className="h-10 px-3 rounded-md text-sm outline-none" style={inputStyle}>
                  <option value="days">{t("expenses.form.days")}</option>
                  <option value="weeks">{t("expenses.form.weeks")}</option>
                  <option value="months">{t("expenses.form.months")}</option>
                  <option value="years">{t("expenses.form.years")}</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block mb-1.5" style={labelStyle}>{t("expenses.form.recur_count")}</label>
              <input type="number" disabled={!recurring} value={recurCount} onChange={(e) => setRecurCount(e.target.value)} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={isRefund} onCheckedChange={(v) => setIsRefund(!!v)} />
              <span className="text-sm">{t("expenses.form.refund")}</span>
            </label>
            <div>
              <label className="block mb-1.5" style={labelStyle}>{t("expenses.form.attach")}</label>
              <input type="file" disabled className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="block mb-1.5" style={labelStyle}>{t("expenses.form.tax")}</label>
              <select value={tax} onChange={(e) => setTax(e.target.value)} className="h-10 px-3 rounded-md text-sm w-full outline-none" style={inputStyle}>
                <option value="other">{t("expenses.form.tax_other")}</option>
                <option value="0">{t("expenses.form.tax_exempt")}</option>
                <option value="14">{t("expenses.form.tax_vat")}</option>
              </select>
            </div>
          </div>
        )}
      </DataCard>

      <PaymentSection value={payment} onChange={setPayment} total={total} />

      <div className="px-2 mt-3 text-sm" style={{ color: "#374151" }}>
        {t("expenses.form.due_label", { amount: Math.max(0, total - payment.amount).toFixed(2) })}
      </div>

      <div className="flex justify-center mt-4">
        <button type="button" onClick={handleSubmit} disabled={isSubmitting || !total || !ownerId} className="h-11 px-8 rounded-md text-white text-sm flex items-center gap-2 disabled:opacity-60" style={{ backgroundColor: "#7c3aed" }}>
          <Save className="h-4 w-4" /> {!ownerId ? "جاري التحميل..." : submitLabel}
        </button>
      </div>
    </div>
  );
}
