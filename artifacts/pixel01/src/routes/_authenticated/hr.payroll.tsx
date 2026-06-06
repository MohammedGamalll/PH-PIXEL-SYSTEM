import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wallet, RefreshCw, Trash2, BadgeDollarSign, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  useEmployeesForPayroll, usePayrollMonth, useMonthAttendanceAggregates,
  useGeneratePayroll, useUpdatePayrollDraft, useDeletePayroll,
  useTreasuries, usePayPayroll,
  type PayrollRecord,
} from "@/hooks/use-payroll";
import { PayslipPrintDialog } from "@/components/hr/PayslipPrintDialog";

export const Route = createFileRoute("/_authenticated/hr/payroll")({
  component: PayrollPage,
});

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Manual YYYY-MM input (no calendar picker per plan §9)
function MonthInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      type="text"
      placeholder="YYYY-MM"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-32 font-mono"
      pattern="\d{4}-\d{2}"
      maxLength={7}
    />
  );
}

function PayrollPage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [monthYear, setMonthYear] = useState(currentMonth);

  const { data: employees = [] } = useEmployeesForPayroll();
  const { data: records = [] } = usePayrollMonth(monthYear);
  const { data: aggregates = {} } = useMonthAttendanceAggregates(monthYear);
  const { data: treasuries = [] } = useTreasuries();
  const gen = useGeneratePayroll();
  const upd = useUpdatePayrollDraft();
  const del = useDeletePayroll();
  const pay = usePayPayroll();

  const [payOpen, setPayOpen] = useState<PayrollRecord | null>(null);
  const [treasuryId, setTreasuryId] = useState<string>("");
  const [printRecord, setPrintRecord] = useState<PayrollRecord | null>(null);

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const recsByEmp = useMemo(() => Object.fromEntries(records.map((r) => [r.employee_id, r])), [records]);

  const rows = employees.filter((e) => e.status === "active");

  const totalNet = records.reduce((s, r) => s + Number(r.net_salary || 0), 0);
  const totalPaid = records.filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.net_salary || 0), 0);

  const generate = () => {
    if (!/^\d{4}-\d{2}$/.test(monthYear)) { toast.error(isAr ? "صيغة الشهر YYYY-MM" : "Use YYYY-MM"); return; }
    gen.mutate({ monthYear, employees: rows, aggregates }, {
      onSuccess: () => toast.success(isAr ? "تم توليد الرواتب" : "Payroll generated"),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const updateField = (id: string, field: "bonuses" | "deductions", value: number) => {
    upd.mutate({ id, [field]: value } as any, {
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const doPay = () => {
    if (!payOpen) return;
    if (!treasuryId) { toast.error(isAr ? "اختر الخزينة" : "Select treasury"); return; }
    const emp = empMap[payOpen.employee_id];
    pay.mutate(
      { payrollId: payOpen.id, treasuryId, employeeName: emp?.name ?? "", monthYear, netSalary: Number(payOpen.net_salary) },
      {
        onSuccess: () => { toast.success(isAr ? "تم صرف الراتب" : "Salary paid"); setPayOpen(null); setTreasuryId(""); },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4" dir={isAr ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BadgeDollarSign className="h-6 w-6 text-emerald-600" />
            {isAr ? "الرواتب الشهرية" : "Monthly payroll"}
          </h1>
          <p className="text-sm text-muted-foreground">{isAr ? "إصدار وصرف رواتب الموظفين" : "Generate and pay employee salaries"}</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">{isAr ? "الشهر (YYYY-MM)" : "Month"}</Label>
            <MonthInput value={monthYear} onChange={setMonthYear} />
          </div>
          <Button onClick={generate} disabled={gen.isPending} className="bg-blue-600 hover:bg-blue-700 gap-2">
            <RefreshCw className="h-4 w-4" />
            {isAr ? "توليد الرواتب" : "Generate"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard color="emerald" label={isAr ? "إجمالي الموظفين" : "Employees"} value={String(rows.length)} />
        <SummaryCard color="blue" label={isAr ? "إجمالي الصافي" : "Total net"} value={totalNet.toFixed(2)} />
        <SummaryCard color="purple" label={isAr ? "تم صرفه" : "Paid"} value={totalPaid.toFixed(2)} />
      </div>

      <Card className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="p-2 text-start">{isAr ? "الموظف" : "Employee"}</th>
                <th className="p-2 text-start">{isAr ? "الأساسي" : "Basic"}</th>
                <th className="p-2 text-start">{isAr ? "تأخير (د)" : "Late(m)"}</th>
                <th className="p-2 text-start">{isAr ? "إضافي (د)" : "OT(m)"}</th>
                <th className="p-2 text-start">{isAr ? "أيام غياب" : "Absent"}</th>
                <th className="p-2 text-start">{isAr ? "خصم تأخير" : "Late ded"}</th>
                <th className="p-2 text-start">{isAr ? "خصم غياب" : "Abs ded"}</th>
                <th className="p-2 text-start">{isAr ? "حافز" : "Bonuses"}</th>
                <th className="p-2 text-start">{isAr ? "خصم/سُلفة" : "Ded."}</th>
                <th className="p-2 text-start">{isAr ? "صافي" : "Net"}</th>
                <th className="p-2 text-start">{isAr ? "الحالة" : "Status"}</th>
                <th className="p-2 text-end">{isAr ? "إجراء" : "Action"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={12} className="text-center text-muted-foreground py-6">{isAr ? "لا يوجد موظفون" : "No employees"}</td></tr>
              )}
              {rows.map((e) => {
                const r = recsByEmp[e.id];
                const basic = Number(e.basic_salary || 0);
                const agg = aggregates[e.id] ?? { late_minutes: 0, overtime_minutes: 0, absent_days: 0 };
                return (
                  <tr key={e.id} className={`border-t ${basic === 0 ? "bg-amber-50/50" : ""}`}>
                    <td className="p-2 font-medium">{e.name}</td>
                    <td className="p-2 tabular-nums">{basic.toFixed(2)}</td>
                    <td className="p-2 text-orange-700 tabular-nums">{agg.late_minutes}</td>
                    <td className="p-2 text-purple-700 tabular-nums">{agg.overtime_minutes}</td>
                    <td className="p-2 text-rose-700 tabular-nums">{agg.absent_days}</td>
                    <td className="p-2 tabular-nums text-orange-700">{r ? Number(r.late_deductions).toFixed(2) : "—"}</td>
                    <td className="p-2 tabular-nums text-rose-700">{r ? Number(r.absence_deductions).toFixed(2) : "—"}</td>
                    <td className="p-2">
                      {r && r.status === "draft" ? (
                        <Input type="number" defaultValue={r.bonuses} className="w-20 h-8"
                          onBlur={(ev) => {
                            const v = Number(ev.target.value || 0);
                            if (v !== Number(r.bonuses)) updateField(r.id, "bonuses", v);
                          }} />
                      ) : (
                        <span className="tabular-nums text-emerald-700">{r ? Number(r.bonuses).toFixed(2) : "—"}</span>
                      )}
                    </td>
                    <td className="p-2">
                      {r && r.status === "draft" ? (
                        <Input type="number" defaultValue={r.deductions} className="w-20 h-8"
                          onBlur={(ev) => {
                            const v = Number(ev.target.value || 0);
                            if (v !== Number(r.deductions)) updateField(r.id, "deductions", v);
                          }} />
                      ) : (
                        <span className="tabular-nums text-rose-700">{r ? Number(r.deductions).toFixed(2) : "—"}</span>
                      )}
                    </td>
                    <td className="p-2 font-bold tabular-nums">{r ? Number(r.net_salary).toFixed(2) : "—"}</td>
                    <td className="p-2">
                      {r ? (
                        <Badge variant="outline" className={r.status === "paid"
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : "bg-slate-100 text-slate-700 border-slate-300"}>
                          {r.status === "paid" ? (isAr ? "تم الصرف" : "Paid") : (isAr ? "مسودة" : "Draft")}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{isAr ? "غير مولّد" : "—"}</span>
                      )}
                    </td>
                    <td className="p-2 text-end">
                      {r && r.status === "draft" && (
                        <div className="inline-flex gap-1">
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1"
                            onClick={() => setPayOpen(r)}>
                            <Wallet className="h-3.5 w-3.5" />
                            {isAr ? "صرف" : "Pay"}
                          </Button>
                          <Button size="sm" variant="ghost" className="text-rose-600"
                            onClick={() => { if (confirm(isAr ? "حذف؟" : "Delete?")) del.mutate(r.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      {r && r.status === "paid" && (
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="outline" className="gap-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                            onClick={() => setPrintRecord(r)}>
                            <Printer className="h-3.5 w-3.5" />
                            {isAr ? "إيصال" : "Print"}
                          </Button>
                          <Button size="sm" variant="ghost" className="text-rose-600"
                            onClick={() => {
                              if (confirm(isAr ? "حذف صف الراتب سيلغي معاملة الخزينة والقيد المحاسبي. متابعة؟" : "Deleting will reverse treasury & ledger entries. Continue?")) {
                                del.mutate(r.id, { onSuccess: () => toast.success(isAr ? "تم الحذف" : "Deleted") });
                              }
                            }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {records.length > 0 && (
              <tfoot className="bg-slate-50">
                <tr>
                  <td colSpan={9} className="p-2 text-end font-semibold">{isAr ? "الإجمالي" : "Total"}</td>
                  <td className="p-2 font-bold tabular-nums text-emerald-700">{totalNet.toFixed(2)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <Dialog open={!!payOpen} onOpenChange={(v) => { if (!v) { setPayOpen(null); setTreasuryId(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isAr ? "إصدار الراتب" : "Pay salary"}</DialogTitle></DialogHeader>
          {payOpen && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="text-sm text-emerald-800">{isAr ? "الموظف" : "Employee"}: <b>{empMap[payOpen.employee_id]?.name}</b></div>
                <div className="text-sm text-emerald-800">{isAr ? "الشهر" : "Month"}: <b>{monthYear}</b></div>
                <div className="text-xl font-bold text-emerald-900 mt-1">{isAr ? "صافي الراتب" : "Net"}: {Number(payOpen.net_salary).toFixed(2)}</div>
              </div>
              <div>
                <Label>{isAr ? "الخزينة" : "Treasury"}</Label>
                {treasuries.length === 0 ? (
                  <div className="text-sm p-3 rounded border border-amber-300 bg-amber-50 text-amber-900">
                    {isAr ? "لا توجد حسابات نقدية. " : "No cash accounts found. "}
                    <Link to="/accounting/accounts" className="underline font-semibold">
                      {isAr ? "أضف حسابًا وعلِّم خانة \"حساب نقدي\"" : "Add an account with the \"Cash equivalent\" flag"}
                    </Link>
                  </div>

                ) : (
                  <Select value={treasuryId} onValueChange={setTreasuryId}>
                    <SelectTrigger><SelectValue placeholder={isAr ? "اختر الخزينة..." : "Select treasury..."} /></SelectTrigger>
                    <SelectContent>
                      {treasuries.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} — {Number(t.balance).toFixed(2)} {t.currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setPayOpen(null)}>{isAr ? "إلغاء" : "Cancel"}</Button>
                <Button onClick={doPay} disabled={pay.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                  {isAr ? "تأكيد الصرف" : "Confirm"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PayslipPrintDialog
        open={!!printRecord}
        onClose={() => setPrintRecord(null)}
        record={printRecord}
        employeeName={printRecord ? empMap[printRecord.employee_id]?.name ?? "" : ""}
      />
    </div>
  );
}

function SummaryCard({ color, label, value }: { color: "emerald" | "blue" | "purple"; label: string; value: string }) {
  const m: Record<string, string> = {
    emerald: "from-emerald-50 to-white border-emerald-200 text-emerald-800",
    blue: "from-blue-50 to-white border-blue-200 text-blue-800",
    purple: "from-purple-50 to-white border-purple-200 text-purple-800",
  };
  return (
    <Card className={`p-4 bg-gradient-to-br ${m[color]} border`}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </Card>
  );
}
