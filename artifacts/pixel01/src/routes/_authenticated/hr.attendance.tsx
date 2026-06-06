import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCurrentEmployee } from "@/hooks/use-current-employee";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Clock, LogIn, LogOut, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  useTodayAttendance, useCheckIn, useCheckOut,
  useAttendanceList, useUpsertAttendance, useDeleteAttendance,
  type AttendanceLog,
} from "@/hooks/use-attendance";
import { useAccess } from "@/lib/access";
import { DateInput } from "@/components/shared/DateInput";
import { EditAttendanceDialog } from "@/components/hr/EditAttendanceDialog";

export const Route = createFileRoute("/_authenticated/hr/attendance")({
  component: AttendancePage,
});

function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function AttendancePage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { isAdmin } = useAccess();
  const { employee } = useCurrentEmployee();
  const { user } = useAuth();
  const now = useLiveClock();

  const { data: employees = [] } = useQuery({
    queryKey: ["employees_list"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees" as any)
        .select("id,name,working_hours")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; name: string; working_hours: number }>;
    },
  });

  const employeeId = employee?.id ?? user?.id ?? null;
  const myWorkingHours = Number(employee?.working_hours ?? 8);
  const { data: today } = useTodayAttendance(employeeId);
  const checkIn = useCheckIn();
  const checkOut = useCheckOut(myWorkingHours);

  const onCheckIn = () => {
    if (!employeeId) return;
    checkIn.mutate(employeeId, {
      onSuccess: () => toast.success(isAr ? "تم تسجيل الحضور" : "Checked in"),
      onError: (e: Error) => toast.error(e.message),
    });
  };
  const onCheckOut = () => {
    if (!employeeId) return;
    checkOut.mutate(
      { employeeId, checkIn: today?.check_in ?? null },
      {
        onSuccess: () => toast.success(isAr ? "تم تسجيل الانصراف" : "Checked out"),
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  const clockStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  const dateStr = now.toLocaleDateString(isAr ? "ar-EG" : "en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4" dir={isAr ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{isAr ? "الحضور والانصراف" : "Attendance"}</h1>
          <p className="text-sm text-muted-foreground">{isAr ? "تسجيل ساعات العمل ومتابعتها" : "Track work hours"}</p>
        </div>
      </div>

      <Tabs defaultValue={isAdmin ? "admin" : "me"} className="w-full">
        <TabsList>
          <TabsTrigger value="me">{isAr ? "حسابي" : "My attendance"}</TabsTrigger>
          {isAdmin && <TabsTrigger value="admin">{isAr ? "إدارة الحضور" : "Manage"}</TabsTrigger>}
        </TabsList>

        <TabsContent value="me" className="mt-4">
          <Card className="p-8 bg-gradient-to-br from-blue-50 via-white to-emerald-50 border-2 border-blue-100">
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-5 w-5" />
                <span className="text-sm">{dateStr}</span>
              </div>
              <div className="text-6xl md:text-7xl font-mono font-bold tracking-widest text-slate-800 tabular-nums">
                {clockStr}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 mt-4 w-full sm:w-auto">
                <Button
                  size="lg"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-6 text-lg gap-2"
                  disabled={!!today?.check_in || checkIn.isPending || !employeeId}
                  onClick={onCheckIn}
                >
                  <LogIn className="h-5 w-5" />
                  {isAr ? "تسجيل حضور" : "Check in"}
                </Button>
                <Button
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg gap-2"
                  disabled={!today?.check_in || !!today?.check_out || checkOut.isPending}
                  onClick={onCheckOut}
                >
                  <LogOut className="h-5 w-5" />
                  {isAr ? "تسجيل انصراف" : "Check out"}
                </Button>
              </div>
              {today && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 w-full max-w-2xl">
                  <Stat label={isAr ? "الحضور" : "Check in"} value={today.check_in ?? "—"} color="emerald" />
                  <Stat label={isAr ? "الانصراف" : "Check out"} value={today.check_out ?? "—"} color="blue" />
                  <Stat label={isAr ? "تأخير (د)" : "Late (min)"} value={String(today.late_minutes ?? 0)} color="orange" />
                  <Stat label={isAr ? "إضافي (د)" : "Overtime"} value={String(today.overtime_minutes ?? 0)} color="purple" />
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="admin" className="mt-4">
            <AdminAttendance employees={employees} isAr={isAr} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: "emerald" | "blue" | "orange" | "purple" }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    orange: "bg-orange-50 border-orange-200 text-orange-800",
    purple: "bg-purple-50 border-purple-200 text-purple-800",
  };
  return (
    <div className={`rounded-lg border p-3 text-center ${colors[color]}`}>
      <div className="text-xs opacity-75">{label}</div>
      <div className="text-lg font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function AdminAttendance({ employees, isAr }: { employees: Array<{ id: string; name: string; working_hours: number }>; isAr: boolean }) {
  const { user } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [empFilter, setEmpFilter] = useState<string>("all");
  const { data: logs = [] } = useAttendanceList({ date, employeeId: empFilter === "all" ? undefined : empFilter });

  // Fetch current user's profile so the admin's own attendance row shows
  // a real name instead of "—" (admin is not in the employees table).
  const { data: myProfile } = useQuery({
    queryKey: ["my_profile_for_attendance", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles" as any)
        .select("id,full_name")
        .eq("id", user!.id)
        .maybeSingle();
      return (data ?? null) as { id: string; full_name: string | null } | null;
    },
  });

  const empMap = useMemo(() => {
    const m: Record<string, string> = Object.fromEntries(employees.map((e) => [e.id, e.name]));
    if (user?.id && !m[user.id]) {
      m[user.id] = myProfile?.full_name || user.email || (isAr ? "المدير" : "Admin");
    }
    return m;
  }, [employees, user, myProfile, isAr]);
  const whMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, Number(e.working_hours || 8)])), [employees]);

  const upsert = useUpsertAttendance();
  const del = useDeleteAttendance();
  const [open, setOpen] = useState(false);
  const [editLog, setEditLog] = useState<AttendanceLog | null>(null);
  const [newDate, setNewDate] = useState(date);

  const onAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      employee_id: String(fd.get("employee_id") || ""),
      date: newDate || date,
      check_in: (fd.get("check_in") as string) || null,
      check_out: (fd.get("check_out") as string) || null,
      status: (fd.get("status") as "present" | "absent" | "leave") || "present",
      notes: (fd.get("notes") as string) || null,
      late_minutes: Number(fd.get("late_minutes") || 0),
      overtime_minutes: Number(fd.get("overtime_minutes") || 0),
    };
    if (!payload.employee_id) {
      toast.error(isAr ? "اختر موظفًا" : "Select employee");
      return;
    }
    upsert.mutate(payload as any, {
      onSuccess: () => {
        toast.success(isAr ? "تم الحفظ" : "Saved");
        setOpen(false);
      },
      onError: (err: Error) => toast.error(err.message),
    });
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <Label className="text-xs">{isAr ? "التاريخ" : "Date"}</Label>
          <div className="mt-1"><DateInput value={date} onChange={setDate} /></div>
        </div>
        <div className="min-w-[200px]">
          <Label className="text-xs">{isAr ? "الموظف" : "Employee"}</Label>
          <Select value={empFilter} onValueChange={setEmpFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
              {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1" />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4" />{isAr ? "تسجيل يدوي" : "Manual entry"}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{isAr ? "تسجيل حضور يدوي" : "Manual attendance"}</DialogTitle></DialogHeader>
            <form onSubmit={onAdd} className="space-y-3">
              <div>
                <Label>{isAr ? "الموظف" : "Employee"}</Label>
                <Select name="employee_id">
                  <SelectTrigger><SelectValue placeholder={isAr ? "اختر..." : "Select..."} /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{isAr ? "التاريخ" : "Date"}</Label><div className="mt-1"><DateInput value={newDate} onChange={setNewDate} /></div></div>
                <div>
                  <Label>{isAr ? "الحالة" : "Status"}</Label>
                  <Select name="status" defaultValue="present">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="present">{isAr ? "حاضر" : "Present"}</SelectItem>
                      <SelectItem value="absent">{isAr ? "غائب" : "Absent"}</SelectItem>
                      <SelectItem value="leave">{isAr ? "إجازة" : "Leave"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>{isAr ? "الحضور" : "Check in"}</Label><Input type="time" name="check_in" /></div>
                <div><Label>{isAr ? "الانصراف" : "Check out"}</Label><Input type="time" name="check_out" /></div>
                <div><Label>{isAr ? "تأخير (د)" : "Late (min)"}</Label><Input type="number" name="late_minutes" defaultValue={0} min={0} /></div>
                <div><Label>{isAr ? "إضافي (د)" : "Overtime (min)"}</Label><Input type="number" name="overtime_minutes" defaultValue={0} min={0} /></div>
              </div>
              <div><Label>{isAr ? "ملاحظات" : "Notes"}</Label><Input name="notes" /></div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>{isAr ? "إلغاء" : "Cancel"}</Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">{isAr ? "حفظ" : "Save"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="p-2 text-start">{isAr ? "الموظف" : "Employee"}</th>
              <th className="p-2 text-start">{isAr ? "التاريخ" : "Date"}</th>
              <th className="p-2 text-start">{isAr ? "حضور" : "In"}</th>
              <th className="p-2 text-start">{isAr ? "انصراف" : "Out"}</th>
              <th className="p-2 text-start">{isAr ? "الحالة" : "Status"}</th>
              <th className="p-2 text-start">{isAr ? "تأخير" : "Late"}</th>
              <th className="p-2 text-start">{isAr ? "إضافي" : "OT"}</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-6">{isAr ? "لا توجد سجلات" : "No records"}</td></tr>
            )}
            {logs.map((l) => (
              <tr key={l.id} className="border-t hover:bg-slate-50/60">
                <td className="p-2 font-medium">{empMap[l.employee_id] ?? "—"}</td>
                <td className="p-2">{l.date}</td>
                <td className="p-2 text-emerald-700">{l.check_in ?? "—"}</td>
                <td className="p-2 text-blue-700">{l.check_out ?? "—"}</td>
                <td className="p-2">
                  <Badge className={
                    l.status === "present" ? "bg-emerald-100 text-emerald-800 border-emerald-300" :
                    l.status === "leave" ? "bg-amber-100 text-amber-800 border-amber-300" :
                    "bg-rose-100 text-rose-800 border-rose-300"
                  } variant="outline">
                    {l.status === "present" ? (isAr ? "حاضر" : "Present") : l.status === "leave" ? (isAr ? "إجازة" : "Leave") : (isAr ? "غائب" : "Absent")}
                  </Badge>
                </td>
                <td className="p-2 text-orange-700 tabular-nums">{l.late_minutes}</td>
                <td className="p-2 text-purple-700 tabular-nums">{l.overtime_minutes}</td>
                <td className="p-2 text-end">
                  <div className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" className="text-blue-600" onClick={() => setEditLog(l)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => {
                      if (confirm(isAr ? "حذف السجل؟" : "Delete record?")) del.mutate(l.id);
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EditAttendanceDialog
        open={!!editLog}
        log={editLog}
        workingHours={editLog ? whMap[editLog.employee_id] ?? 8 : 8}
        onClose={() => setEditLog(null)}
      />
    </Card>
  );
}
