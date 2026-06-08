import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/lib/owner";
import { useAuth } from "@/lib/auth";
import { requireOwnerId, friendlyDbError } from "@/lib/db-errors";

export type PayrollRecord = {
  id: string;
  owner_id: string;
  employee_id: string;
  month_year: string;
  basic_salary: number;
  bonuses: number;
  deductions: number;
  late_deductions: number;
  absence_deductions: number;
  net_salary: number;
  status: "draft" | "paid";
  treasury_account_id: string | null;
  treasury_transaction_id: string | null;
  journal_entry_id: string | null;
  paid_at: string | null;
  notes: string | null;
};

export type Employee = {
  id: string;
  name: string;
  basic_salary: number;
  working_hours: number;
  status: string;
};

// Standardized monthly denominator (per plan §5)
const MONTH_DAYS = 30;

export function useEmployeesForPayroll() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["employees_for_payroll"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees" as any)
        .select("id,name,basic_salary,working_hours,status")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Employee[];
    },
  });
}

export function usePayrollMonth(monthYear: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["payroll_records", monthYear],
    enabled: !!user && !!monthYear,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_records" as any)
        .select("*")
        .eq("month_year", monthYear);
      if (error) throw error;
      return (data ?? []) as unknown as PayrollRecord[];
    },
  });
}

// Aggregate attendance stats per employee for a month
export type MonthAggregate = {
  late_minutes: number;
  overtime_minutes: number;
  absent_days: number;
};
export function useMonthAttendanceAggregates(monthYear: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["attendance_aggregates", monthYear],
    enabled: !!user && !!monthYear,
    queryFn: async () => {
      const start = `${monthYear}-01`;
      const [y, m] = monthYear.split("-").map(Number);
      const endDate = new Date(y, m, 0);
      const end = endDate.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("attendance_logs" as any)
        .select("employee_id,late_minutes,overtime_minutes,status")
        .gte("date", start)
        .lte("date", end);
      if (error) throw error;
      const map: Record<string, MonthAggregate> = {};
      for (const r of ((data ?? []) as unknown as Array<{ employee_id: string; late_minutes: number; overtime_minutes: number; status: string }>)) {
        const cur = (map[r.employee_id] ||= { late_minutes: 0, overtime_minutes: 0, absent_days: 0 });
        cur.late_minutes += Number(r.late_minutes || 0);
        cur.overtime_minutes += Number(r.overtime_minutes || 0);
        if (r.status === "absent") cur.absent_days += 1;
      }
      return map;
    },
  });
}

// Back-compat: late deductions map (minutes only)
export function useLateDeductions(monthYear: string) {
  const agg = useMonthAttendanceAggregates(monthYear);
  return {
    ...agg,
    data: agg.data
      ? Object.fromEntries(Object.entries(agg.data).map(([k, v]) => [k, v.late_minutes]))
      : {},
  } as any;
}

function computeNet(args: { basic: number; bonuses: number; deductions: number; late: number; absence: number }) {
  return Math.max(0, args.basic + args.bonuses - args.deductions - args.late - args.absence);
}

export function useGeneratePayroll() {
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      monthYear: string;
      employees: Employee[];
      aggregates: Record<string, MonthAggregate>;
    }) => {
      const { monthYear, employees, aggregates } = args;
      const rows = employees
        .filter((e) => e.status === "active" && Number(e.basic_salary || 0) > 0)
        .map((e) => {
          const basic = Number(e.basic_salary || 0);
          const wh = Number(e.working_hours || 8);
          const perMinute = basic / (MONTH_DAYS * wh * 60);
          const agg = aggregates[e.id] ?? { late_minutes: 0, overtime_minutes: 0, absent_days: 0 };
          const lateDed = Math.round(perMinute * agg.late_minutes * 100) / 100;
          const absDed = Math.round((basic / MONTH_DAYS) * agg.absent_days * 100) / 100;
          return {
            owner_id: requireOwnerId(ownerId),
            employee_id: e.id,
            month_year: monthYear,
            basic_salary: basic,
            bonuses: 0,
            deductions: 0,
            late_deductions: lateDed,
            absence_deductions: absDed,
            net_salary: computeNet({ basic, bonuses: 0, deductions: 0, late: lateDed, absence: absDed }),
            status: "draft",
          };
        });
      if (rows.length === 0) return;
      const { error } = await supabase
        .from("payroll_records" as any)
        .upsert(rows, { onConflict: "employee_id,month_year", ignoreDuplicates: true });
      if (error) throw friendlyDbError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll_records"] }),
  });
}

export function useUpdatePayrollDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      bonuses?: number;
      deductions?: number;
      late_deductions?: number;
      absence_deductions?: number;
      basic_salary?: number;
      notes?: string;
    }) => {
      const { id, ...rest } = args;
      const { data: cur, error: e0 } = await supabase
        .from("payroll_records" as any)
        .select("basic_salary,bonuses,deductions,late_deductions,absence_deductions")
        .eq("id", id)
        .maybeSingle();
      if (e0) throw friendlyDbError(e0);
      const c: any = cur ?? {};
      const merged = {
        basic_salary: Number(rest.basic_salary ?? c.basic_salary ?? 0),
        bonuses: Number(rest.bonuses ?? c.bonuses ?? 0),
        deductions: Number(rest.deductions ?? c.deductions ?? 0),
        late_deductions: Number(rest.late_deductions ?? c.late_deductions ?? 0),
        absence_deductions: Number(rest.absence_deductions ?? c.absence_deductions ?? 0),
      };
      const net = computeNet({
        basic: merged.basic_salary,
        bonuses: merged.bonuses,
        deductions: merged.deductions,
        late: merged.late_deductions,
        absence: merged.absence_deductions,
      });
      const { error } = await supabase
        .from("payroll_records" as any)
        .update({ ...rest, net_salary: net })
        .eq("id", id)
        .eq("status", "draft");
      if (error) throw friendlyDbError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll_records"] }),
  });
}

export function useDeletePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payroll_records" as any).delete().eq("id", id);
      if (error) throw friendlyDbError(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll_records"] });
      qc.invalidateQueries({ queryKey: ["treasuries"] });
      qc.invalidateQueries({ queryKey: ["treasury_transactions"] });
    },
  });
}

export { useTreasuries } from "@/hooks/use-linked-treasuries";

export function useUpdateEmployeeSalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; basic_salary: number; working_hours: number }) => {
      const { error } = await supabase
        .from("employees" as any)
        .update({ basic_salary: args.basic_salary, working_hours: args.working_hours })
        .eq("id", args.id);
      if (error) throw friendlyDbError(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["employees_for_payroll"] });
    },
  });
}

export function usePayPayroll() {
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { payrollId: string; treasuryId: string; employeeName: string; monthYear: string; netSalary: number; notes?: string }) => {
      const owner = requireOwnerId(ownerId);
      const { payrollId, treasuryId, employeeName, monthYear, netSalary, notes } = args;
      if (netSalary <= 0) throw new Error("صافي الراتب يجب أن يكون أكبر من صفر");

      // Guard: prevent double payments
      const { data: existing, error: ce } = await supabase
        .from("payroll_records" as any)
        .select("status")
        .eq("id", payrollId)
        .maybeSingle();
      if (ce) throw friendlyDbError(ce);
      if (!existing || (existing as any).status === "paid") {
        throw new Error("هذا الراتب تم صرفه بالفعل");
      }

      const { data: tre, error: te } = await supabase
        .from("treasuries" as any)
        .select("id,balance,account_id")
        .eq("id", treasuryId)
        .maybeSingle();
      if (te) throw friendlyDbError(te);
      if (!tre) throw new Error("الخزينة غير موجودة");
      const treasuryAccountId = (tre as any).account_id as string | null;

      const { data: payAcc, error: pae } = await supabase.rpc("ensure_payroll_account" as any, { _owner: owner });
      if (pae) throw friendlyDbError(pae);
      const payrollAccountId = payAcc as unknown as string;

      const { data: tx, error: txe } = await supabase
        .from("treasury_transactions" as any)
        .insert({
          owner_id: owner,
          treasury_id: treasuryId,
          type: "withdraw",
          amount: netSalary,
          description: `راتب ${monthYear} — ${employeeName}`,
          reference: `payroll:${payrollId}`,
          transaction_date: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single();
      if (txe) throw friendlyDbError(txe);
      const txId = (tx as any).id as string;

      const { data: je, error: jee } = await supabase
        .from("journal_entries" as any)
        .insert({
          owner_id: owner,
          entry_date: new Date().toISOString().slice(0, 10),
          description: `صرف راتب ${monthYear} — ${employeeName}`,
          ref_no: monthYear,
          source_type: "payroll",
          source_id: payrollId,
          note: notes ?? null,
        })
        .select("id")
        .single();
      if (jee) {
        await supabase.from("treasury_transactions" as any).delete().eq("id", txId);
        throw friendlyDbError(jee);
      }
      const jeId = (je as any).id as string;

      const lines: Array<{ journal_entry_id: string; account_id: string; debit: number; credit: number }> = [
        { journal_entry_id: jeId, account_id: payrollAccountId, debit: netSalary, credit: 0 },
      ];
      if (treasuryAccountId) {
        lines.push({ journal_entry_id: jeId, account_id: treasuryAccountId, debit: 0, credit: netSalary });
      }
      if (lines.length === 2) {
        const { error: jle } = await supabase.from("journal_entry_lines" as any).insert(lines);
        if (jle) {
          await supabase.from("journal_entries" as any).delete().eq("id", jeId);
          await supabase.from("treasury_transactions" as any).delete().eq("id", txId);
          throw friendlyDbError(jle);
        }
      }

      const { error: pe } = await supabase
        .from("payroll_records" as any)
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          treasury_account_id: treasuryAccountId,
          treasury_transaction_id: txId,
          journal_entry_id: jeId,
          notes: notes ?? null,
        })
        .eq("id", payrollId);
      if (pe) throw friendlyDbError(pe);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll_records"] });
      qc.invalidateQueries({ queryKey: ["treasuries"] });
      qc.invalidateQueries({ queryKey: ["treasury_transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["journal_entries"] });
      qc.invalidateQueries({ queryKey: ["pnl"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
    },
  });
}
