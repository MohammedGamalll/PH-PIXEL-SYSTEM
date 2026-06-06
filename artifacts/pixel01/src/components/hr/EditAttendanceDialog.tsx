import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useUpsertAttendance, type AttendanceLog } from "@/hooks/use-attendance";
import { DateInput } from "@/components/shared/DateInput";

const STANDARD_START = "09:00:00";

function minutesBetween(from: string, to: string) {
  const [h1, m1] = from.split(":").map(Number);
  const [h2, m2] = to.split(":").map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

type Props = {
  open: boolean;
  log: AttendanceLog | null;
  workingHours?: number;
  onClose: () => void;
};

export function EditAttendanceDialog({ open, log, workingHours = 8, onClose }: Props) {
  const [date, setDate] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [status, setStatus] = useState<"present" | "absent" | "leave">("present");
  const [notes, setNotes] = useState("");
  const upsert = useUpsertAttendance();

  useEffect(() => {
    if (log) {
      setDate(log.date);
      setCheckIn(log.check_in ?? "");
      setCheckOut(log.check_out ?? "");
      setStatus(log.status);
      setNotes(log.notes ?? "");
    }
  }, [log]);

  const onSave = () => {
    if (!log) return;
    let late = 0, ot = 0;
    if (checkIn) {
      late = Math.max(0, minutesBetween(STANDARD_START, checkIn + (checkIn.length === 5 ? ":00" : "")));
    }
    if (checkOut) {
      const end = `${String(9 + Math.floor(workingHours)).padStart(2, "0")}:00:00`;
      ot = Math.max(0, minutesBetween(end, checkOut + (checkOut.length === 5 ? ":00" : "")));
    }
    upsert.mutate({
      employee_id: log.employee_id,
      date,
      check_in: checkIn || null,
      check_out: checkOut || null,
      status,
      notes: notes || null,
      late_minutes: late,
      overtime_minutes: ot,
    } as any, {
      onSuccess: () => { toast.success("تم الحفظ"); onClose(); },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>تعديل سجل الحضور</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">التاريخ</Label>
            <div className="mt-1"><DateInput value={date} onChange={setDate} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">الحضور</Label>
              <Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">الانصراف</Label>
              <Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">الحالة</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="present">حاضر</SelectItem>
                <SelectItem value="absent">غائب</SelectItem>
                <SelectItem value="leave">إجازة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={onSave} disabled={upsert.isPending} className="bg-emerald-600 hover:bg-emerald-700">حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
