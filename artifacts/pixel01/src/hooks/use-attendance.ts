import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/lib/owner";
import { useAuth } from "@/lib/auth";
import { requireOwnerId, friendlyDbError } from "@/lib/db-errors";

export type AttendanceLog = {
  id: string;
  owner_id: string;
  employee_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: "present" | "absent" | "leave";
  late_minutes: number;
  overtime_minutes: number;
  notes: string | null;
};

const STANDARD_START_HOUR = 9; // 09:00

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function minutesBetween(from: string, to: string) {
  const [h1, m1] = from.split(":").map(Number);
  const [h2, m2] = to.split(":").map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

export function useAttendanceList(params: { date?: string; employeeId?: string } = {}) {
  const { user } = useAuth();
  const { date, employeeId } = params;
  return useQuery({
    queryKey: ["attendance_logs", date ?? "all", employeeId ?? "all"],
    enabled: !!user,
    queryFn: async () => {
      let q = (supabase.from("attendance_logs" as any).select("*")).order("date", { ascending: false });
      if (date) q = q.eq("date", date);
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AttendanceLog[];
    },
  });
}

export function useTodayAttendance(employeeId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["attendance_today", employeeId],
    enabled: !!user && !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_logs" as any)
        .select("*")
        .eq("employee_id", employeeId!)
        .eq("date", today())
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as AttendanceLog | null;
    },
  });
}

export function useCheckIn() {
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (employeeId: string) => {
      const t = nowTime();
      const standardStart = `${String(STANDARD_START_HOUR).padStart(2, "0")}:00:00`;
      const late = Math.max(0, minutesBetween(standardStart, t));
      const { error } = await supabase.from("attendance_logs" as any).upsert(
        {
          owner_id: requireOwnerId(ownerId),
          employee_id: employeeId,
          date: today(),
          check_in: t,
          late_minutes: late,
          status: "present",
        },
        { onConflict: "employee_id,date" },
      );
      if (error) throw friendlyDbError(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance_today"] });
      qc.invalidateQueries({ queryKey: ["attendance_logs"] });
    },
  });
}

export function useCheckOut(workingHours = 8) {
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { employeeId: string; checkIn: string | null }) => {
      const t = nowTime();
      const endTarget = `${String(STANDARD_START_HOUR + Math.floor(workingHours)).padStart(2, "0")}:00:00`;
      const overtime = Math.max(0, minutesBetween(endTarget, t));
      const { error } = await supabase.from("attendance_logs" as any).upsert(
        {
          owner_id: requireOwnerId(ownerId),
          employee_id: args.employeeId,
          date: today(),
          check_out: t,
          overtime_minutes: overtime,
          status: "present",
        },
        { onConflict: "employee_id,date" },
      );
      if (error) throw friendlyDbError(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance_today"] });
      qc.invalidateQueries({ queryKey: ["attendance_logs"] });
    },
  });
}

export function useUpsertAttendance() {
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<AttendanceLog> & { employee_id: string; date: string }) => {
      const { error } = await supabase.from("attendance_logs" as any).upsert(
        { ...row, owner_id: requireOwnerId(ownerId) },
        { onConflict: "employee_id,date" },
      );
      if (error) throw friendlyDbError(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance_logs"] });
      qc.invalidateQueries({ queryKey: ["attendance_today"] });
    },
  });
}

export function useDeleteAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("attendance_logs" as any).delete().eq("id", id);
      if (error) throw friendlyDbError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance_logs"] }),
  });
}
