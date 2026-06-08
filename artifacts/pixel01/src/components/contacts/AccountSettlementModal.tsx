import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { X, Wallet } from "lucide-react";
import { usePaymentAccounts } from "@/hooks/use-accounts";
import { friendlyDbError, requireOwnerId } from "@/lib/db-errors";
import { requireTreasuryAccountId } from "@/lib/treasury-account";
import { allocateContactPayment, resettleContactDebt } from "@/lib/debt-allocation.functions";

type Scope = "customer" | "supplier" | "both";

type Props = {
  open: boolean;
  onClose: () => void;
  contact: any;
  scope: Scope;
  due: number;
  totalCredit: number;
};

const inputStyle: React.CSSProperties = {
  border: "1px solid #9aa0a6",
  background: "#fff",
  padding: "6px 8px",
  fontSize: 13,
  borderRadius: 2,
  width: "100%",
};

export function AccountSettlementModal({ open, onClose, contact, scope, due, totalCredit }: Props) {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();

  // Determine settlement mode:
  // - due > 0   => contact owes (customer) / pharmacy owes (supplier)
  // - credit> 0 => the opposite
  const hasDue = due > 0.009;
  const settleBase = hasDue ? due : totalCredit;
  // direction of cash movement:
  //   due > 0 (contact owes us) => money IN (collect from contact)
  //   totalCredit > 0 (we owe contact) => money OUT (pay to contact)
  const direction: "in" | "out" = hasDue ? "in" : "out";
  const resolvedContactType = scope === "both"
    ? (direction === "in" ? "customer" : "supplier")
    : scope;
  const [discountVal, setDiscountVal] = useState("0");
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [paidVal, setPaidVal] = useState<string>("");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const { data: paymentAccounts = [] } = usePaymentAccounts();
  const [treasuryId, setTreasuryId] = useState("");
  const [saving, setSaving] = useState(false);

  const discountNum = Math.max(0, Number(discountVal) || 0);
  const calculatedDiscount = discountType === "percent" ? settleBase * (discountNum / 100) : discountNum;
  const autoPaid = Math.max(0, settleBase - calculatedDiscount);
  const finalPaid = paidVal === "" ? autoPaid : Math.max(0, Number(paidVal) || 0);
  
  const contactName = (`${contact?.first_name || ""} ${contact?.last_name || ""}`.trim()) || contact?.business_name || contact?.contact_id || "";

  useEffect(() => {
    if (!open || paymentAccounts.length === 0) return;
    setTreasuryId((cur) => {
      if (cur) return cur;
      const def = paymentAccounts.find((a) => a.is_default_cash) ?? paymentAccounts[0];
      return def?.id ?? "";
    });
  }, [open, paymentAccounts]);

  useEffect(() => {
    if (!open) { setDiscountVal("0"); setDiscountType("amount"); setPaidVal(""); setNotes(""); setMethod("cash"); }
  }, [open]);

  const whoOwes = useMemo(() => {
    const isCustomerLike = scope === "customer" || scope === "both";
    if (due > 0.009) {
      return isCustomerLike
        ? `عليه للصيدلية ${due.toFixed(2)} ج.م`
        : `عليه للصيدلية ${due.toFixed(2)} ج.م`;
    }
    if (totalCredit > 0.009) {
      return isCustomerLike
        ? `له عند الصيدلية (رصيد لصالحه) ${totalCredit.toFixed(2)} ج.م`
        : `له عند الصيدلية ${totalCredit.toFixed(2)} ج.م`;
    }
    return "الحساب متزن، لا يوجد مستحقات";
  }, [due, totalCredit, scope]);

  const confirm = async () => {
    if (finalPaid <= 0 && calculatedDiscount <= 0) { toast.error("لا يوجد مبلغ للتسوية"); return; }
    if (finalPaid > 0 && !treasuryId) { toast.error("اختر الخزينة"); return; }
    setSaving(true);
    try {
      const ownerIdResolved = requireOwnerId(ownerId);
      
      // 1. Insert discount if any
      if (calculatedDiscount > 0) {
        const { error: err1 } = await (supabase.from("contact_payments") as any).insert({
          owner_id: ownerIdResolved,
          contact_id: contact.id,
          contact_type: resolvedContactType,
          contact_name_snapshot: contactName,
          direction,
          amount: calculatedDiscount,
          payment_method: "discount",
          treasury_account_id: null,
          notes: `خصم مسموح به - تسوية حساب`,
          created_by: user!.id,
        });
        if (err1) throw err1;
      }

      // 2. Insert actual payment if any
      if (finalPaid > 0) {
        const note = `تسوية حساب${notes ? ` - ${notes}` : ""}`;
        const treasuryAccountId = await requireTreasuryAccountId(treasuryId);
        const { error: err2 } = await (supabase.from("contact_payments") as any).insert({
          owner_id: ownerIdResolved,
          contact_id: contact.id,
          contact_type: resolvedContactType,
          contact_name_snapshot: contactName,
          direction,
          amount: finalPaid,
          payment_method: method,
          treasury_account_id: treasuryAccountId,
          notes: note,
          created_by: user!.id,
        });
        if (err2) throw err2;
      }

      const totalToAllocate = calculatedDiscount + finalPaid;
      try {
        await allocateContactPayment({ data: { contact_id: contact.id, direction, amount: totalToAllocate, contact_type: resolvedContactType } });
        await resettleContactDebt({ data: { contact_id: contact.id, direction } });
      } catch (allocErr) {
        console.warn("settlement allocation failed", allocErr);
      }
      toast.success("تمت تسوية الحساب وتسجيل الحركة في النقدية والتقارير");
      ["contact-balances", "contacts", "contact-payments", "contact-view", "purchases", "invoices", "dashboard", "account-balances", "accounts"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      );
      onClose();
    } catch (e: any) {
      toast.error(friendlyDbError(e, "فشل تسوية الحساب").message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()} style={{ background: "#f8fafc", border: "1px solid #9aa0a6", width: 480, maxWidth: "95vw", borderRadius: 6, boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
        <div style={{ background: "#2563eb", color: "#fff", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTopLeftRadius: 6, borderTopRightRadius: 6 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 6 }}><Wallet size={16} /> تصفية حساب {contactName}</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer" }}><X size={16} /></button>
        </div>
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: 12, fontSize: 13, color: "#1e3a8a" }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{whoOwes}</div>
            <DetailRow label="رصيد افتتاحي" value={Number(contact?.opening_balance ?? 0).toFixed(2)} />
            <DetailRow label="إجمالي المستحق الحالي" value={due.toFixed(2)} bold />
            <DetailRow label="رصيد لصالحه" value={totalCredit.toFixed(2)} />
            <div style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>
              الحركة هتتسجل في: النقدية (الخزينة المختارة) + كشف حساب {scope === "supplier" ? "المورد" : scope === "customer" ? "العميل" : "العميل/المورد"} + التقارير،
              بصيغة {direction === "in" ? "نقدية داخلة (تحصيل)" : "نقدية خارجة (دفع)"}.
              {hasDue ? " هتتشال من المستحق (عليه)." : " هتتشال من الرصيد لصالحه (له)."}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="الخزينة / الحساب">
              <select value={treasuryId} onChange={(e) => setTreasuryId(e.target.value)} style={inputStyle}>
                <option value="">-- اختر --</option>
                {paymentAccounts.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.is_default_cash ? " ⭐" : ""}</option>
                ))}
              </select>
            </Field>
            <Field label="طريقة الدفع">
              <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
                <option value="cash">نقدي</option>
                <option value="card">بطاقة</option>
                <option value="bank">تحويل بنكي</option>
                <option value="wallet">محفظة إلكترونية</option>
                <option value="cheque">شيك</option>
              </select>
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="الخصم">
              <div style={{ display: "flex", gap: 4 }}>
                <input type="number" min={0} value={discountVal} onChange={(e) => setDiscountVal(e.target.value)} style={{ ...inputStyle, width: "60%" }} />
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value as any)} style={{ ...inputStyle, width: "40%", padding: "6px 2px" }}>
                  <option value="amount">مبلغ</option>
                  <option value="percent">%</option>
                </select>
              </div>
            </Field>
            <Field label={direction === "in" ? "المُحصّل (نقدية)" : "المدفوع (نقدية)"}>
              <input type="number" min={0} value={paidVal} placeholder={autoPaid.toFixed(2)} onChange={(e) => setPaidVal(e.target.value)} style={{ ...inputStyle, background: "#fef3c7", fontWeight: 800 }} />
            </Field>
          </div>

          <Field label="ملاحظات">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          </Field>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ padding: "8px 16px", border: "1px solid #9aa0a6", background: "#e5e7eb", cursor: "pointer", borderRadius: 4 }}>إلغاء</button>
            <button onClick={confirm} disabled={saving || (finalPaid <= 0 && calculatedDiscount <= 0)} style={{ padding: "8px 22px", border: "none", background: "#16a34a", color: "#fff", cursor: saving ? "wait" : "pointer", borderRadius: 4, fontWeight: 700, opacity: (finalPaid <= 0 && calculatedDiscount <= 0) ? 0.6 : 1 }}>
              {saving ? "جاري التسوية..." : "تأكيد التسوية"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
      <span>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600 }}>{value} ج.م</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#374151", marginBottom: 4, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}
