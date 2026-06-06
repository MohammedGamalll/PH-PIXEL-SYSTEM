import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type HRSummary = {
  totalPayroll: number;
  avgLateMinutes: number;
  totalAbsentDays: number;
  activeHeadcount: number;
};

export type AttendanceDeficitRow = {
  employee_id: string;
  name: string;
  late_minutes: number;
  absent_days: number;
  score: number;
};

export type PayrollTrendPoint = { month: string; total: number };

export type UnconfiguredEmployee = { id: string; name: string };

export type ActiveLeaveRow = {
  id: string;
  employee_id: string;
  name: string;
  notes: string | null;
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function shiftMonth(monthYear: string, delta: number): string {
  // monthYear: YYYY-MM
  const parts = monthYear.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(monthYear: string): { start: string; end: string } {
  const parts = monthYear.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0); // last day of month
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  };
}

export function useHRSummary(monthYear: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["hr_summary", monthYear],
    enabled: !!user,
    queryFn: async (): Promise<HRSummary> => {
      const { start, end } = monthRange(monthYear);

      const [payrollRes, attendanceRes, employeesRes] = await Promise.all([
        (supabase.from("payroll_records") as any)
          .select("net_salary,status,month_year")
          .eq("month_year", monthYear)
          .eq("status", "paid"),
        (supabase.from("attendance_logs") as any)
          .select("late_minutes,status,date,employee_id")
          .gte("date", start)
          .lte("date", end),
        (supabase.from("employees") as any)
          .select("id,status")
          .eq("status", "active"),
      ]);

      if (payrollRes.error) throw payrollRes.error;
      if (attendanceRes.error) throw attendanceRes.error;
      if (employeesRes.error) throw employeesRes.error;

      const payrolls = (payrollRes.data ?? []) as Array<{ net_salary: number }>;
      const attendance = (attendanceRes.data ?? []) as Array<{
        late_minutes: number;
        status: string;
        employee_id: string;
      }>;
      const employees = (employeesRes.data ?? []) as Array<{ id: string }>;

      const totalPayroll = payrolls.reduce((s, r) => s + Number(r.net_salary || 0), 0);

      // Avg late minutes per employee (across employees with any attendance log this month)
      const byEmp = new Map<string, { total: number; count: number }>();
      attendance.forEach((row) => {
        const cur = byEmp.get(row.employee_id) || { total: 0, count: 0 };
        cur.total += Number(row.late_minutes || 0);
        cur.count += 1;
        byEmp.set(row.employee_id, cur);
      });
      const perEmpAvgs: number[] = [];
      byEmp.forEach((v) => {
        if (v.count > 0) perEmpAvgs.push(v.total / v.count);
      });
      const avgLateMinutes =
        perEmpAvgs.length === 0
          ? 0
          : perEmpAvgs.reduce((s, n) => s + n, 0) / perEmpAvgs.length;

      const totalAbsentDays = attendance.filter((r) => r.status === "absent").length;
      const activeHeadcount = employees.length;

      return { totalPayroll, avgLateMinutes, totalAbsentDays, activeHeadcount };
    },
  });
}

export function usePayrollTrend(monthYear: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["hr_payroll_trend", monthYear],
    enabled: !!user,
    queryFn: async (): Promise<PayrollTrendPoint[]> => {
      const months: string[] = [];
      for (let i = 5; i >= 0; i--) months.push(shiftMonth(monthYear, -i));

      const { data, error } = await (supabase.from("payroll_records") as any)
        .select("month_year,net_salary,status")
        .in("month_year", months)
        .eq("status", "paid");
      if (error) throw error;

      const map = new Map<string, number>();
      months.forEach((m) => map.set(m, 0));
      ((data ?? []) as Array<{ month_year: string; net_salary: number }>).forEach((r) => {
        map.set(r.month_year, (map.get(r.month_year) || 0) + Number(r.net_salary || 0));
      });
      return months.map((m) => ({ month: m, total: map.get(m) || 0 }));
    },
  });
}

export function useAttendanceDeficit(monthYear: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["hr_attendance_deficit", monthYear],
    enabled: !!user,
    queryFn: async (): Promise<AttendanceDeficitRow[]> => {
      const { start, end } = monthRange(monthYear);
      const [attRes, empRes] = await Promise.all([
        (supabase.from("attendance_logs") as any)
          .select("employee_id,late_minutes,status")
          .gte("date", start)
          .lte("date", end),
        (supabase.from("employees") as any).select("id,name"),
      ]);
      if (attRes.error) throw attRes.error;
      if (empRes.error) throw empRes.error;

      const names = new Map<string, string>();
      ((empRes.data ?? []) as Array<{ id: string; name: string }>).forEach((e) =>
        names.set(e.id, e.name),
      );

      const agg = new Map<string, { late: number; absent: number }>();
      ((attRes.data ?? []) as Array<{
        employee_id: string;
        late_minutes: number;
        status: string;
      }>).forEach((r) => {
        const cur = agg.get(r.employee_id) || { late: 0, absent: 0 };
        cur.late += Number(r.late_minutes || 0);
        if (r.status === "absent") cur.absent += 1;
        agg.set(r.employee_id, cur);
      });

      const rows: AttendanceDeficitRow[] = [];
      agg.forEach((v, k) => {
        const score = v.late + v.absent * 480; // weight 1 absent day as 8 hours late
        if (score > 0) {
          rows.push({
            employee_id: k,
            name: names.get(k) || "—",
            late_minutes: v.late,
            absent_days: v.absent,
            score,
          });
        }
      });
      rows.sort((a, b) => b.score - a.score);
      return rows.slice(0, 5);
    },
  });
}

export function useUnconfiguredSalaries() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["hr_unconfigured_salaries"],
    enabled: !!user,
    queryFn: async (): Promise<UnconfiguredEmployee[]> => {
      const { data, error } = await (supabase.from("employees") as any)
        .select("id,name,basic_salary,status")
        .eq("status", "active")
        .eq("basic_salary", 0)
        .order("name");
      if (error) throw error;
      return ((data ?? []) as Array<{ id: string; name: string }>).map((e) => ({
        id: e.id,
        name: e.name,
      }));
    },
  });
}

export function useActiveLeavesToday() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["hr_active_leaves"],
    enabled: !!user,
    queryFn: async (): Promise<ActiveLeaveRow[]> => {
      const date = todayStr();
      const { data, error } = await (supabase.from("attendance_logs") as any)
        .select("id,employee_id,notes,status,date")
        .eq("date", date)
        .eq("status", "leave");
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string;
        employee_id: string;
        notes: string | null;
      }>;
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.employee_id);
      const empRes = await (supabase.from("employees") as any)
        .select("id,name")
        .in("id", ids);
      if (empRes.error) throw empRes.error;
      const names = new Map<string, string>();
      ((empRes.data ?? []) as Array<{ id: string; name: string }>).forEach((e) =>
        names.set(e.id, e.name),
      );
      return rows.map((r) => ({
        id: r.id,
        employee_id: r.employee_id,
        name: names.get(r.employee_id) || "—",
        notes: r.notes,
      }));
    },
  });
}
