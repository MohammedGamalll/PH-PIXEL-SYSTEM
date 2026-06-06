import { useState } from "react";
import { toast } from "sonner";
import { Win7Modal } from "./Win7Modal";
import { inputStyle, modalBtn } from "./win7";
import { useExpenseCategories } from "@/hooks/use-expense-categories";
import { useCreateExpense } from "@/hooks/use-expenses-new";
import { useI18n } from "@/lib/i18n";
import { AccountSelect } from "@/components/shared/AccountSelect";
import { DateInput } from "@/components/shared/DateInput";


type Props = {
  sessionId: string;
  onClose: () => void;
};

export function AddExpenseModal({ sessionId, onClose }: Props) {
  const { t } = useI18n();
  const { data: categories = [] } = useExpenseCategories();
  const create = useCreateExpense();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState("");
  const [reason, setReason] = useState("");

  const save = async () => {
    const amt = Number(amount) || 0;
    if (amt <= 0) {
      toast.error(t("sales.expense.invalid_amount"));
      return;
    }
    await create.mutateAsync({
      expense_date: date,
      category_id: categoryId || null,
      amount: amt,
      paid_amount: amt,
      due_amount: 0,
      payment_status: "paid",
      payment_method: "cash",
      payment_account: account,
      reason: reason || t("sales.expense.default_reason"),
      notes: `session:${sessionId}`,
    });
    onClose();
  };

  return (
    <Win7Modal title={t("sales.expense.title")} onClose={onClose} width={420}>
      <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
        <Field label={t("sales.expense.date")}>
          <DateInput value={date} onChange={setDate} style={{ ...inputStyle, width: "100%" }} />
        </Field>
        <Field label={t("sales.expense.category")}>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
            <option value="">{t("sales.expense.none")}</option>
            {categories.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t("sales.expense.amount")}>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus style={{ ...inputStyle, width: "100%" }} />
        </Field>
        <Field label={t("sales.expense.account")}>
          <AccountSelect value={account} onChange={setAccount} style={{ ...inputStyle, width: "100%" }} />
        </Field>

        <Field label={t("sales.expense.note")}>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} style={{ ...inputStyle, width: "100%", resize: "vertical" }} />
        </Field>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={onClose} style={modalBtn} disabled={create.isPending}>{t("sales.cashier.cancel")}</button>
          <button onClick={save} disabled={create.isPending} style={{ ...modalBtn, background: "#16a34a", color: "#fff" }}>
            {create.isPending ? "..." : t("sales.expense.save")}
          </button>
        </div>
      </div>
    </Win7Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 3 }}>
      <span style={{ fontSize: 12, color: "#374151" }}>{label}</span>
      {children}
    </label>
  );
}
