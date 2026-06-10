import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Pencil, BookOpen, Banknote, ArrowLeftRight, Power } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { TableToolbar, EmptyRow, TableFooter, type ColumnDef } from "@/components/products/TableToolbar";
import { Win7Modal } from "@/components/sales/cashier/Win7Modal";
import { inputStyle, modalBtn } from "@/components/sales/cashier/win7";
import {
  useAccounts, useCreateAccount, useUpdateAccount, useCloseAccount,
  isDebitNature, type AccountWithBalance, type AccountType, type AccountDetailKV,
} from "@/hooks/use-accounts";
import { useOpeningDeposit, useFinancialTransfer } from "@/hooks/use-journal";
import { useI18n } from "@/lib/i18n";
import { DateInput } from "@/components/shared/DateInput";
import { useEmployeesMap } from "@/hooks/use-employees-map";
import { SortableHead } from "@/components/shared/SortableHead";
import { useTableSort } from "@/components/shared/useTableSort";

const SUB_TYPE_KEYS: Record<AccountType, string[]> = {
  Asset: ["accounting.sub.asset_current", "accounting.sub.asset_fixed"],
  Liability: ["accounting.sub.liab_current", "accounting.sub.liab_non_current"],
  Equity: ["accounting.sub.equity"],
  Revenue: ["accounting.sub.rev_operating", "accounting.sub.rev_other"],
  Expense: ["accounting.sub.exp_operating", "accounting.sub.exp_other"],
};

const TYPE_TREE: { type: AccountType; childKeys: string[] }[] = [
  { type: "Asset", childKeys: ["accounting.sub.asset_current", "accounting.sub.asset_fixed"] },
  { type: "Liability", childKeys: ["accounting.sub.liab_current", "accounting.sub.liab_non_current"] },
  { type: "Equity", childKeys: [] },
];

function TypeBadge({ type, t }: { type: AccountType; t: (k: string) => string }) {
  const debit = isDebitNature(type);
  return (
    <span
      style={{
        display: "inline-block", padding: "2px 10px", fontSize: 11, fontWeight: 600,
        borderRadius: 4, color: "#fff",
        backgroundColor: debit ? "#16a34a" : "#dc2626",
      }}
    >
      {debit ? t("accounting.types.debit") : t("accounting.types.credit")}
    </span>
  );
}

function actionBtn(color: { bg: string; fg: string; border: string }): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "3px 8px", fontSize: 11, borderRadius: 3,
    border: `1px solid ${color.border}`,
    background: color.bg, color: color.fg, cursor: "pointer", whiteSpace: "nowrap",
  };
}

export function AccountsListPage() {
  const { t, dir } = useI18n();
  const { data: accounts = [], isLoading } = useAccounts();
  const { data: empMap = {} } = useEmployeesMap();
  const createMut = useCreateAccount();
  const updateMut = useUpdateAccount();
  const closeMut = useCloseAccount();
  const depositMut = useOpeningDeposit();
  const transferMut = useFinancialTransfer();

  const [tab, setTab] = useState<"list" | "types">("list");
  const [statusFilter, setStatusFilter] = useState<"active" | "closed">("active");
  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);

  const baseCols: ColumnDef[] = useMemo(() => ([
    { key: "name", label: t("accounting.accounts.col_name"), visible: true },
    { key: "account_type", label: t("accounting.accounts.col_type"), visible: true },
    { key: "sub_account_type", label: t("accounting.accounts.col_sub_type"), visible: true },
    { key: "account_number", label: t("accounting.accounts.col_number"), visible: true },
    { key: "note", label: t("accounting.accounts.col_note"), visible: true },
    { key: "balance", label: t("accounting.accounts.col_balance"), visible: true },
    { key: "details", label: t("accounting.accounts.col_details"), visible: true },
    { key: "created_by", label: t("accounting.accounts.col_created_by"), visible: true },
    { key: "opt", label: t("accounting.accounts.col_options"), visible: true },
  ]), [t]);

  const [cols, setCols] = useState(baseCols);
  useEffect(() => {
    setCols((cur) => baseCols.map((b) => ({ ...b, visible: cur.find((c) => c.key === b.key)?.visible ?? b.visible })));
  }, [baseCols]);

  const printRef = useRef<HTMLDivElement>(null);

  const align = dir === "rtl" ? "right" : "left";
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "8px 10px", fontWeight: 600, textAlign: align as any, fontSize: 12, borderBottom: "1px solid #d1d5db" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #e5e7eb", padding: "6px 10px", color: "#374151", fontSize: 12, whiteSpace: "nowrap" };

  // modals
  const [editing, setEditing] = useState<AccountWithBalance | null>(null);
  const [adding, setAdding] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [depositFor, setDepositFor] = useState<AccountWithBalance | null>(null);
  const [transferFor, setTransferFor] = useState<AccountWithBalance | null>(null);

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      if (statusFilter === "active" && a.is_closed) return false;
      if (statusFilter === "closed" && !a.is_closed) return false;
      if (search && ![a.name, a.account_number, a.note].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [accounts, statusFilter, search]);

  const enriched = useMemo(
    () => filtered.map((a) => ({ ...a, created_by_name: (a.created_by && empMap[a.created_by]) || "—" })),
    [filtered, empMap],
  );
  const { sorted, sort, setSort } = useTableSort(enriched);

  const pageSize = Number(perPage);
  const totalRows = sorted.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const from = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(totalRows, page * pageSize);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const visible = cols.filter((c) => c.visible);
  

  const fmt = (n: number) => t("accounting.currency", { n: (Number(n) || 0).toFixed(2) });
  const detailsStr = (d: AccountDetailKV[]) =>
    (d ?? []).filter((x) => x.label || x.value).map((x) => `${x.label}: ${x.value}`).join(" | ");

  const subLabel = (a: AccountWithBalance) => {
    if (!a.sub_account_type) return "—";
    const keys = SUB_TYPE_KEYS[a.account_type] || [];
    // match ar/en defaults stored in DB; show t() if key exists by label match, else raw
    for (const k of keys) {
      if (t(k) === a.sub_account_type) return t(k);
    }
    return a.sub_account_type;
  };

  const cellFor = (r: AccountWithBalance & { created_by_name?: string }, key: string) => {
    if (key === "name") return r.name;
    if (key === "account_type")
      return (
        <div className="flex items-center gap-2">
          <TypeBadge type={r.account_type} t={t} />
          <span>{t(`accounting.types.${r.account_type}`)}</span>
        </div>
      );
    if (key === "sub_account_type") return subLabel(r);
    if (key === "account_number") return r.account_number;
    if (key === "note") return r.note || "";
    if (key === "balance") return fmt(r.balance);
    if (key === "details") return detailsStr(r.details);
    if (key === "created_by") return r.created_by_name || "—";
    return "";
  };

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("accounting.accounts.title")} subtitle={t("accounting.accounts.subtitle")} />

      <DataCard className="border-gray-300">
        {/* Tabs */}
        <div className="flex items-center justify-end border-b" style={{ borderColor: "#e5e7eb", gap: 4 }}>
          <button
            onClick={() => setTab("types")}
            style={{
              padding: "8px 14px", fontSize: 13, fontWeight: 600,
              color: tab === "types" ? "#1d4ed8" : "#6b7280",
              borderBottom: tab === "types" ? "2px solid #1d4ed8" : "2px solid transparent",
              background: "transparent",
            }}
          >
            {t("accounting.accounts.tab_types")}
          </button>
          <button
            onClick={() => setTab("list")}
            style={{
              padding: "8px 14px", fontSize: 13, fontWeight: 600,
              color: tab === "list" ? "#1d4ed8" : "#6b7280",
              borderBottom: tab === "list" ? "2px solid #1d4ed8" : "2px solid transparent",
              background: "transparent",
            }}
          >
            {t("accounting.accounts.tab_list")}
          </button>
        </div>

        {tab === "list" && (
          <>
            <div className="flex items-center justify-between gap-3 mt-3">
              <button
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1 text-white"
                style={{ background: "#6366f1", padding: "8px 18px", borderRadius: 999, fontSize: 13, fontWeight: 600 }}
              >
                <Plus className="h-4 w-4" /> {t("accounting.accounts.add")}
              </button>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="border rounded px-2 py-1 text-sm"
                style={{ borderColor: "#d1d5db" }}
              >
                <option value="active">{t("accounting.accounts.status_active")}</option>
                <option value="closed">{t("accounting.accounts.status_closed")}</option>
              </select>
            </div>

            <div className="mt-3">
              <TableToolbar
                search={search} onSearchChange={setSearch}
                perPage={perPage} onPerPageChange={setPerPage}
                printRef={printRef} printTitle={t("accounting.accounts.print_title")}
                columns={cols}
                onToggleColumn={(k) => setCols((s) => s.map((c) => c.key === k ? { ...c, visible: !c.visible } : c))}
              />
            </div>

            <div className="overflow-x-auto rounded-md print-table-area" ref={printRef} style={{ border: "1px solid #d1d5db" }}>
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <SortableHead cols={visible} headStyle={headStyle} sort={sort} onSort={setSort} />
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={visible.length} style={{ ...cellStyle, textAlign: "center" }}>{t("accounting.loading")}</td></tr>
                  ) : pageRows.length === 0 ? (
                    <EmptyRow colSpan={visible.length} />
                  ) : pageRows.map((r) => (
                    <tr key={r.id}>
                      {visible.map((c) => c.key === "opt" ? (
                        <td key={c.key} style={cellStyle}>
                          <div className="flex flex-wrap items-center gap-1">
                            <button onClick={() => setEditing(r)} style={actionBtn({ bg: "#fff", fg: "#1d4ed8", border: "#93c5fd" })}>
                              <Pencil className="h-3 w-3" /> {t("accounting.accounts.action.edit")}
                            </button>
                            <Link to="/accounting/ledger/$accountId" params={{ accountId: r.id }}
                              style={actionBtn({ bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" })}>
                              <BookOpen className="h-3 w-3" /> {t("accounting.accounts.action.ledger")}
                            </Link>
                            {!r.is_closed && (
                            <button onClick={() => setDepositFor(r)} style={actionBtn({ bg: "#16a34a", fg: "#fff", border: "#16a34a" })}>
                              <Banknote className="h-3 w-3" /> {t("accounting.accounts.action.deposit")}
                            </button>
                            )}
                            {!r.is_closed && (
                            <button onClick={() => setTransferFor(r)} style={actionBtn({ bg: "#fde68a", fg: "#78350f", border: "#f59e0b" })}>
                              <ArrowLeftRight className="h-3 w-3" /> {t("accounting.accounts.action.transfer")}
                            </button>
                            )}
                            {!r.is_closed && (
                            <button onClick={() => setClosingId(r.id)} style={actionBtn({ bg: "#fff", fg: "#dc2626", border: "#fca5a5" })}>
                              <Power className="h-3 w-3" /> {t("accounting.accounts.action.close")}
                            </button>
                            )}
                          </div>
                        </td>
                      ) : (
                        <td key={c.key} style={cellStyle}>{cellFor(r, c.key)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TableFooter from={from} to={to} total={totalRows} page={page} pageCount={pageCount}
              onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pageCount, p + 1))} />
          </>
        )}

        {tab === "types" && (
          <div className="mt-3 overflow-x-auto" style={{ border: "1px solid #d1d5db" }}>
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={headStyle}>{t("accounting.accounts.col_name")}</th>
                  <th style={headStyle}>{t("accounting.accounts.col_classification")}</th>
                  <th style={headStyle}>{t("accounting.accounts.col_options")}</th>
                </tr>
              </thead>
              <tbody>
                {TYPE_TREE.map((node) => (
                  <Fragment key={node.type}>
                    <tr>
                      <td style={cellStyle}>{t(`accounting.types.${node.type}`)}</td>
                      <td style={cellStyle}><TypeBadge type={node.type} t={t} /></td>
                      <td style={cellStyle}></td>
                    </tr>
                    {node.childKeys.map((ck) => (
                      <tr key={node.type + ck}>
                        <td style={cellStyle}>-- {t(ck)}</td>
                        <td style={cellStyle}><TypeBadge type={node.type} t={t} /></td>
                        <td style={cellStyle}></td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataCard>

      {(adding || editing) && (
        <AccountEditorModal
          initial={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSubmit={async (input) => {
            if (editing) {
              await updateMut.mutateAsync({ id: editing.id, patch: input });
            } else {
              await createMut.mutateAsync(input);
            }
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      {closingId && (
        <Win7Modal title={t("accounting.accounts.confirm_title")} onClose={() => setClosingId(null)} width={360}>
          <div style={{ padding: 10, textAlign: "center" }}>
            <p style={{ fontSize: 14, marginBottom: 16 }}>{t("accounting.accounts.confirm_close")}</p>
            <div className="flex justify-center gap-2">
              <button
                style={{ ...modalBtn, background: "#dc2626", color: "#fff", borderColor: "#dc2626" }}
                onClick={async () => { await closeMut.mutateAsync(closingId); setClosingId(null); }}
              >
                {t("accounting.accounts.ok")}
              </button>
              <button style={modalBtn} onClick={() => setClosingId(null)}>{t("accounting.accounts.cancel")}</button>
            </div>
          </div>
        </Win7Modal>
      )}

      {depositFor && (
        <OpeningDepositModal
          account={depositFor}
          onClose={() => setDepositFor(null)}
          onSubmit={async (v) => {
            await depositMut.mutateAsync({
              account_id: depositFor.id,
              account_type: depositFor.account_type,
              amount: v.amount,
              entry_date: v.entry_date,
              payment_method: v.payment_method,
              note: v.note,
            });
            setDepositFor(null);
          }}
        />
      )}

      {transferFor && (
        <FinancialTransferModal
          fromAccount={transferFor}
          accounts={accounts}
          onClose={() => setTransferFor(null)}
          onSubmit={async (v) => {
            await transferMut.mutateAsync({
              from_account_id: transferFor.id,
              to_account_id: v.to_account_id,
              amount: v.amount,
              entry_date: v.entry_date,
              payment_method: v.payment_method,
              note: v.note,
            });
            setTransferFor(null);
          }}
        />
      )}
    </div>
  );
}

function AccountEditorModal({
  initial, onClose, onSubmit,
}: {
  initial: AccountWithBalance | null;
  onClose: () => void;
  onSubmit: (input: {
    name: string; account_number: string; account_type: AccountType;
    sub_account_type?: string | null; opening_balance?: number;
    note?: string | null; details?: AccountDetailKV[];
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [accountNumber, setAccountNumber] = useState(initial?.account_number ?? "");
  const [type, setType] = useState<AccountType | "">(initial?.account_type ?? "");
  const [subType, setSubType] = useState<string>(initial?.sub_account_type ?? "");
  const [opening, setOpening] = useState<string>(String(initial?.opening_balance ?? 0));
  const [note, setNote] = useState(initial?.note ?? "");
  const [details, setDetails] = useState<AccountDetailKV[]>(
    initial?.details?.length ? initial.details : Array.from({ length: 7 }, () => ({ label: "", value: "" }))
  );

  const setDetail = (i: number, patch: Partial<AccountDetailKV>) =>
    setDetails((d) => d.map((x, idx) => idx === i ? { ...x, ...patch } : x));

  const submit = async () => {
    if (!name.trim()) { toast.error(t("accounting.account_form.err_name")); return; }
    if (!accountNumber.trim()) { toast.error(t("accounting.account_form.err_number")); return; }
    if (!type) { toast.error(t("accounting.account_form.err_type")); return; }
    await onSubmit({
      name: name.trim(),
      account_number: accountNumber.trim(),
      account_type: type as AccountType,
      sub_account_type: subType || null,
      opening_balance: isEdit ? undefined : (Number(opening) || 0),
      note: note || null,
      details: details.filter((d) => d.label || d.value),
    });
  };

  const subOptions = type ? SUB_TYPE_KEYS[type as AccountType] : [];

  return (
    <Win7Modal title={isEdit ? t("accounting.account_form.title_edit") : t("accounting.account_form.title_add")} onClose={onClose} width={560}>
      <div style={{ padding: 4 }}>
        <Field label={t("accounting.account_form.name")}>
          <input style={{ ...inputStyle, width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("accounting.account_form.number")}>
          <input style={{ ...inputStyle, width: "100%" }} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
        </Field>
        <Field label={t("accounting.account_form.type")}>
          <select style={{ ...inputStyle, width: "100%" }} value={type} onChange={(e) => { setType(e.target.value as AccountType); setSubType(""); }}>
            <option value="">{t("accounting.account_form.choose")}</option>
            {(Object.keys(SUB_TYPE_KEYS) as AccountType[]).map((tp) => (
              <option key={tp} value={tp}>{t(`accounting.types.${tp}`)}</option>
            ))}
          </select>
        </Field>
        {subOptions.length > 0 && (
          <Field label={t("accounting.account_form.sub_type")}>
            <select style={{ ...inputStyle, width: "100%" }} value={subType} onChange={(e) => setSubType(e.target.value)}>
              <option value="">{t("accounting.account_form.dash")}</option>
              {subOptions.map((sk) => <option key={sk} value={t(sk)}>{t(sk)}</option>)}
            </select>
          </Field>
        )}
        {!isEdit && (
          <Field label={t("accounting.account_form.opening")}>
            <input type="number" style={{ ...inputStyle, width: "100%" }} value={opening} onChange={(e) => setOpening(e.target.value)} />
          </Field>
        )}

        <div style={{ marginTop: 10, marginBottom: 6, fontWeight: 600, fontSize: 13 }}>{t("accounting.account_form.details_title")}</div>
        <div style={{ border: "1px solid #d1d5db" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "#f3f4f6", fontSize: 12, fontWeight: 600 }}>
            <div style={{ padding: "6px 8px", borderInlineEnd: "1px solid #d1d5db", textAlign: "center" }}>{t("accounting.account_form.details_value")}</div>
            <div style={{ padding: "6px 8px", textAlign: "center" }}>{t("accounting.account_form.details_label")}</div>
          </div>
          {details.map((d, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid #e5e7eb" }}>
              <div style={{ padding: 4, borderInlineEnd: "1px solid #e5e7eb" }}>
                <input style={{ ...inputStyle, width: "100%" }} value={d.value} onChange={(e) => setDetail(i, { value: e.target.value })} />
              </div>
              <div style={{ padding: 4 }}>
                <input style={{ ...inputStyle, width: "100%" }} value={d.label} onChange={(e) => setDetail(i, { label: e.target.value })} />
              </div>
            </div>
          ))}
        </div>

        <Field label={t("accounting.account_form.note")}>
          <textarea style={{ ...inputStyle, width: "100%", minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("accounting.account_form.note_ph")} />
        </Field>

        <div className="flex justify-start gap-2" style={{ marginTop: 12 }}>
          <button style={{ ...modalBtn, background: "#6366f1", color: "#fff", borderColor: "#6366f1" }} onClick={submit}>
            {isEdit ? t("accounting.account_form.update") : t("accounting.account_form.save")}
          </button>
          <button style={{ ...modalBtn, background: "#1f2937", color: "#fff", borderColor: "#1f2937" }} onClick={onClose}>{t("accounting.account_form.close")}</button>
        </div>
      </div>
    </Win7Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, marginBottom: 4, color: "#374151" }}>{label}</div>
      {children}
    </div>
  );
}

type DepositValue = { amount: number; entry_date: string; payment_method: string | null; note: string | null };

function OpeningDepositModal({
  account, onClose, onSubmit,
}: {
  account: AccountWithBalance;
  onClose: () => void;
  onSubmit: (v: DepositValue) => Promise<void>;
}) {
  const { t } = useI18n();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error(t("accounting.deposit.err_amount")); return; }
    await onSubmit({ amount: amt, entry_date: date, payment_method: method, note: note || null });
  };

  return (
    <Win7Modal title={t("accounting.deposit.title", { name: account.name })} onClose={onClose} width={460}>
      <div style={{ padding: 4 }}>
        <Field label={t("accounting.deposit.amount")}>
          <input type="number" style={{ ...inputStyle, width: "100%" }} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("accounting.deposit.date")}>
          <DateInput value={date} onChange={setDate} style={{ ...inputStyle, width: "100%" }} />
        </Field>
        <Field label={t("accounting.deposit.method")}>
          <select style={{ ...inputStyle, width: "100%" }} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">{t("accounting.payment.cash")}</option>
            <option value="bank">{t("accounting.payment.bank")}</option>
            <option value="card">{t("accounting.payment.card")}</option>
            <option value="cheque">{t("accounting.payment.cheque")}</option>
          </select>
        </Field>
        <Field label={t("accounting.account_form.note")}>
          <textarea style={{ ...inputStyle, width: "100%", minHeight: 60 }} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-start gap-2" style={{ marginTop: 12 }}>
          <button style={{ ...modalBtn, background: "#16a34a", color: "#fff", borderColor: "#16a34a" }} onClick={submit}>{t("accounting.account_form.save")}</button>
          <button style={{ ...modalBtn, background: "#1f2937", color: "#fff", borderColor: "#1f2937" }} onClick={onClose}>{t("accounting.account_form.close")}</button>
        </div>
      </div>
    </Win7Modal>
  );
}

type TransferValue = { to_account_id: string; amount: number; entry_date: string; payment_method: string | null; note: string | null };

function FinancialTransferModal({
  fromAccount, accounts, onClose, onSubmit,
}: {
  fromAccount: AccountWithBalance;
  accounts: AccountWithBalance[];
  onClose: () => void;
  onSubmit: (v: TransferValue) => Promise<void>;
}) {
  const { t } = useI18n();
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");

  const options = accounts.filter((a) => a.id !== fromAccount.id && !a.is_closed);

  const submit = async () => {
    if (!toId) { toast.error(t("accounting.transfer.err_to")); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error(t("accounting.deposit.err_amount")); return; }
    await onSubmit({ to_account_id: toId, amount: amt, entry_date: date, payment_method: method, note: note || null });
  };

  return (
    <Win7Modal title={t("accounting.transfer.title", { name: fromAccount.name })} onClose={onClose} width={500}>
      <div style={{ padding: 4 }}>
        <Field label={t("accounting.transfer.from")}>
          <input style={{ ...inputStyle, width: "100%", background: "#f3f4f6" }} value={fromAccount.name} disabled />
        </Field>
        <Field label={t("accounting.transfer.to")}>
          <select style={{ ...inputStyle, width: "100%" }} value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">{t("accounting.account_form.choose")}</option>
            {options.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.account_number})</option>
            ))}
          </select>
        </Field>
        <Field label={t("accounting.deposit.amount")}>
          <input type="number" style={{ ...inputStyle, width: "100%" }} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t("accounting.deposit.date")}>
          <DateInput value={date} onChange={setDate} style={{ ...inputStyle, width: "100%" }} />
        </Field>
        <Field label={t("accounting.deposit.method")}>
          <select style={{ ...inputStyle, width: "100%" }} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">{t("accounting.payment.cash")}</option>
            <option value="bank">{t("accounting.payment.bank")}</option>
            <option value="card">{t("accounting.payment.card")}</option>
            <option value="cheque">{t("accounting.payment.cheque")}</option>
          </select>
        </Field>
        <Field label={t("accounting.account_form.note")}>
          <textarea style={{ ...inputStyle, width: "100%", minHeight: 60 }} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-start gap-2" style={{ marginTop: 12 }}>
          <button style={{ ...modalBtn, background: "#f59e0b", color: "#fff", borderColor: "#f59e0b" }} onClick={submit}>{t("accounting.transfer.save")}</button>
          <button style={{ ...modalBtn, background: "#1f2937", color: "#fff", borderColor: "#1f2937" }} onClick={onClose}>{t("accounting.account_form.close")}</button>
        </div>
      </div>
    </Win7Modal>
  );
}
