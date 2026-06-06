import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Win7Modal } from "./Win7Modal";
import { inputStyle, modalBtn } from "./win7";
import { useI18n } from "@/lib/i18n";
import { AccountSelect } from "@/components/shared/AccountSelect";


export type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  account: string;
};

type Props = {
  grandTotal: number;
  onClose: () => void;
  onConfirm: (rows: { label: string; amount: number }[]) => void;
};

let uid = 0;
const nextId = () => `pr-${++uid}`;

export function MultiPayModal({ grandTotal, onClose, onConfirm }: Props) {
  const { t } = useI18n();

  const METHODS = [
    { value: "cash", label: t("sales.cashier.multipay.method.cash") },
    { value: "card", label: t("sales.cashier.multipay.method.card") },
    { value: "bank", label: t("sales.cashier.multipay.method.bank") },
    { value: "other", label: t("sales.cashier.multipay.method.other") },
  ];

  const [rows, setRows] = useState<PaymentRow[]>([
    { id: nextId(), amount: grandTotal, method: "cash", account: "" },
  ]);

  const totalPaid = useMemo(() => rows.reduce((a, b) => a + (Number(b.amount) || 0), 0), [rows]);
  const due = grandTotal - totalPaid;
  const isOver = due < -0.005;
  const isShort = due > 0.005;

  const updateRow = (id: string, patch: Partial<PaymentRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));
  const addRow = () =>
    setRows((rs) => [...rs, { id: nextId(), amount: Math.max(0, due), method: "cash", account: "" }]);

  const confirm = () => {
    const payments = rows
      .filter((r) => (Number(r.amount) || 0) > 0)
      .map((r) => ({
        label: METHODS.find((m) => m.value === r.method)?.label || r.method,
        amount: Number(r.amount) || 0,
      }));
    onConfirm(payments);
  };

  return (
    <Win7Modal title={t("sales.cashier.multipay.title")} onClose={onClose} width={720}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 10 }}>
        {/* Left: payment rows */}
        <div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ background: "#d4d4d4" }}>
              <tr>
                <th style={hth}>{t("sales.cashier.multipay.col.amount")}</th>
                <th style={hth}>{t("sales.cashier.multipay.col.method")}</th>
                <th style={hth}>{t("sales.cashier.multipay.col.account")}</th>
                <th style={hth}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={ctd}>
                    <input
                      type="number"
                      value={r.amount}
                      onChange={(e) => updateRow(r.id, { amount: Number(e.target.value) || 0 })}
                      style={{ ...inputStyle, width: "100%" }}
                    />
                  </td>
                  <td style={ctd}>
                    <select
                      value={r.method}
                      onChange={(e) => updateRow(r.id, { method: e.target.value })}
                      style={{ ...inputStyle, width: "100%" }}
                    >
                      {METHODS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={ctd}>
                    <AccountSelect
                      value={r.account}
                      onChange={(v) => updateRow(r.id, { account: v })}
                      style={{ ...inputStyle, width: "100%" }}
                    />

                  </td>
                  <td style={ctd}>
                    <button
                      onClick={() => removeRow(r.id)}
                      disabled={rows.length === 1}
                      style={{ ...modalBtn, padding: "4px 6px", background: "#fee2e2", color: "#b91c1c" }}
                      aria-label={t("sales.cashier.delete")}
                    >
                      <X size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addRow} style={{ ...modalBtn, marginTop: 8, background: "#2563eb", color: "#fff" }}>
            {t("sales.cashier.multipay.add_row")}
          </button>
        </div>

        {/* Right: totals (orange panel) */}
        <div style={{ background: "#fb923c", color: "#fff", padding: 12, borderRadius: 2, display: "grid", gap: 8 }}>
          <SumRow label={t("sales.cashier.multipay.grand_total")} value={grandTotal.toFixed(2)} />
          <SumRow label={t("sales.cashier.multipay.total_paid")} value={totalPaid.toFixed(2)} />
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.5)", paddingTop: 8 }}>
            {isShort && <SumRow label={t("sales.cashier.multipay.remaining")} value={due.toFixed(2)} highlight="#b91c1c" />}
            {isOver && <SumRow label={t("sales.cashier.multipay.change")} value={Math.abs(due).toFixed(2)} highlight="#15803d" />}
            {!isShort && !isOver && <SumRow label={t("sales.cashier.multipay.match")} value="0.00" highlight="#15803d" />}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 12 }}>
        <button onClick={onClose} style={modalBtn}>{t("sales.cashier.cancel")}</button>
        <button
          onClick={confirm}
          disabled={totalPaid <= 0}
          style={{ ...modalBtn, background: "#16a34a", color: "#fff" }}
        >
          {t("sales.cashier.multipay.confirm")}
        </button>
      </div>
    </Win7Modal>
  );
}

const hth: React.CSSProperties = {
  padding: "6px 4px", textAlign: "center", fontWeight: 700, fontSize: 12, borderBottom: "1px solid #9aa0a6",
};
const ctd: React.CSSProperties = { padding: 4 };

function SumRow({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700 }}>
      <span>{label}</span>
      <span style={{ background: highlight, padding: highlight ? "2px 6px" : 0, borderRadius: 2 }}>{value}</span>
    </div>
  );
}
