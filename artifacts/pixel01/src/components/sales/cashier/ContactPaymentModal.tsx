import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useContacts } from "@/hooks/use-contacts";
import { useContactBalances, computeContactDue } from "@/hooks/use-contact-balances";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useAutoRef } from "@/hooks/use-auto-ref";
import { useOwnerId } from "@/lib/owner";
import { friendlyDbError, requireOwnerId } from "@/lib/db-errors";
import { allocateContactPayment, resettleContactDebt } from "@/lib/debt-allocation.functions";


type Props = {
  open: boolean;
  direction: "in" | "out"; // in = money in (customer pays / supplier refunds), out = money out
  contactType?: "customer" | "supplier"; // override scope
  titleOverride?: string;
  sessionId?: string;
  initialContactId?: string;
  lockContact?: boolean;
  onClose: () => void;
};

const inputStyle: React.CSSProperties = {
  border: "1px solid #9aa0a6",
  background: "#fff",
  padding: "6px 8px",
  fontSize: 13,
  borderRadius: 2,
  width: "100%",
};

export function ContactPaymentModal({ open, direction, contactType, titleOverride, sessionId, initialContactId, lockContact, onClose }: Props) {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  const scope = contactType ?? (direction === "in" ? "customer" : "supplier");
  const { data: contacts = [] } = useContacts(scope);
  const { data: balances } = useContactBalances();

  const [contactId, setContactId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [refNo, setRefNo] = useState("");
  const prefix = direction === "in" ? "RCV" : "PAY";
  const [autoRef] = useAutoRef("contact_payments", "ref_no", prefix, open);
  useEffect(() => { if (open && autoRef && !refNo) setRefNo(autoRef); }, [open, autoRef]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [treasuries, setTreasuries] = useState<any[]>([]);
  const [treasuryId, setTreasuryId] = useState<string>("");

  const selectedContact = useMemo(
    () => (contacts as any[]).find((c) => c.id === contactId) || null,
    [contacts, contactId],
  );
  const balInfo = useMemo(
    () => selectedContact ? computeContactDue(selectedContact, balances?.get(contactId)) : null,
    [selectedContact, balances, contactId, scope],
  );




  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      const { data } = await (supabase.from("accounts") as any)
        .select("id, name, account_type, is_default_cash")
        .eq("is_cash_equivalent", true)
        .order("is_default_cash", { ascending: false })
        .order("account_number");
      const list = data ?? [];
      setTreasuries(list);
      if (list.length > 0) {
        const def = list.find((t: any) => t.is_default_cash) ?? list[0];
        setTreasuryId(def.id);
      }
    })();
  }, [open, user]);


  useEffect(() => {
    if (open) {
      setContactId(initialContactId || "");
    } else {
      setContactId(""); setAmount(""); setMethod("cash"); setRefNo(""); setNotes("");
    }
  }, [open, initialContactId]);


  const title = titleOverride ?? (direction === "in"
    ? (scope === "supplier" ? "استلام مرتجع شراء من مورد" : "تسجيل دفعة من عميل")
    : "تسجيل دفعة لمورد");
  const headerColor = direction === "in" ? "#16a34a" : "#dc2626";

  const submit = async () => {
    const amt = Number(amount);
    if (!contactId) { toast.error(scope === "customer" ? "اختر العميل" : "اختر المورد"); return; }
    if (!amt || amt <= 0) { toast.error("المبلغ مطلوب"); return; }
    setSaving(true);
    try {
      const ownerIdResolved = requireOwnerId(ownerId);
      const { error } = await (supabase.from("contact_payments") as any).insert({
        owner_id: ownerIdResolved,
        contact_id: contactId,
        contact_type: scope,
        direction,
        amount: amt,
        payment_method: method,
        treasury_account_id: treasuryId || null,
        session_id: sessionId || null,
        ref_no: refNo || null,
        notes: notes || null,
        created_by: user!.id,
      });
      if (error) throw error;
      try {
        await allocateContactPayment({
          data: { contact_id: contactId, direction, amount: amt, contact_type: scope },
        });
        // Also re-walk older payments so any historical mismatch heals itself
        // (e.g. an earlier payment that didn't update its invoice).
        await resettleContactDebt({ data: { contact_id: contactId, direction } });
      } catch (allocErr) {
        console.warn("debt allocation failed", allocErr);
      }
      toast.success("تم تسجيل الدفعة");
      qc.invalidateQueries({ queryKey: ["contact-balances"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["contact-payments"] });
      qc.invalidateQueries({ queryKey: ["contact-view"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["account-balances"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      onClose();

    } catch (e: any) {
      toast.error(friendlyDbError(e, "فشل التسجيل").message);
    } finally {
      setSaving(false);
    }
  };


  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60,
      }}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#e9e9e9", border: "1px solid #9aa0a6",
          padding: 0, width: 440, maxWidth: "95vw", borderRadius: 4,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{
          background: headerColor, color: "#fff",
          padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center",
          borderTopLeftRadius: 4, borderTopRightRadius: 4,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 14, display: "grid", gap: 10 }}>
          <Field label={scope === "customer" ? "العميل *" : "المورد *"}>
            <select value={contactId} onChange={(e) => setContactId(e.target.value)} style={inputStyle} disabled={!!lockContact && !!initialContactId}>
              <option value="">-- اختر --</option>
              {contacts.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {(`${c.first_name || ""} ${c.last_name || ""}`.trim()) || c.business_name || c.contact_id}
                </option>
              ))}
            </select>
          </Field>
          {balInfo && (balInfo.due > 0 || balInfo.totalCredit > 0) && (
            <div style={{
              background: balInfo.due > 0 ? "#fef3c7" : "#dcfce7",
              border: `1px solid ${balInfo.due > 0 ? "#fcd34d" : "#86efac"}`,
              padding: "8px 10px", borderRadius: 3, fontSize: 12,
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap",
            }}>
              <span>
                {balInfo.due > 0 && <span><b>المستحق الحالي:</b> {balInfo.due.toFixed(2)} ج.م</span>}
                {balInfo.due > 0 && balInfo.totalCredit > 0 && <span style={{ margin: "0 8px" }}>•</span>}
                {balInfo.totalCredit > 0 && <span><b>رصيد لصالحه:</b> {balInfo.totalCredit.toFixed(2)} ج.م</span>}
              </span>
              {balInfo.due > 0 && (
                <button type="button"
                  onClick={() => setAmount(String(balInfo.due.toFixed(2)))}
                  style={{ background: "#2563eb", color: "#fff", border: "none", padding: "4px 10px", borderRadius: 2, cursor: "pointer", fontSize: 11 }}>
                  تسديد كامل المستحق
                </button>
              )}
            </div>
          )}
          <Field label="الخزينة / الحساب">
            <select value={treasuryId} onChange={(e) => setTreasuryId(e.target.value)} style={inputStyle}>
              <option value="">-- اختر --</option>
              {treasuries.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}{t.is_default_cash ? " ⭐" : ""}</option>
              ))}

            </select>
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="المبلغ *">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
                style={inputStyle}
              />
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
          <Field label="رقم مرجعي">
            <input value={refNo} onChange={(e) => setRefNo(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="ملاحظات">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>
          <div style={{ display: "flex", gap: 8, marginTop: 4, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ padding: "8px 16px", border: "1px solid #9aa0a6", background: "#e5e7eb", cursor: "pointer", borderRadius: 2 }}>
              إلغاء
            </button>
            <button
              onClick={submit}
              disabled={saving || !ownerId}
              style={{
                padding: "8px 20px", border: "none", background: headerColor, color: "#fff",
                cursor: saving || !ownerId ? "wait" : "pointer", borderRadius: 2, fontWeight: 700,
                opacity: !ownerId ? 0.6 : 1,
              }}
            >
              {saving ? "جاري الحفظ..." : !ownerId ? "جاري التحميل..." : "تسجيل الدفعة"}
            </button>

          </div>
        </div>
      </div>
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
