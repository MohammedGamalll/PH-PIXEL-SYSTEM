import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, Clock, UserX, Users, AlertCircle, Calendar,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import {
  useHRSummary, usePayrollTrend, useAttendanceDeficit,
  useUnconfiguredSalaries, useActiveLeavesToday,
} from "@/hooks/use-hr-analytics";

export const Route = createFileRoute("/_authenticated/hr/reports")({
  component: HRReportsPage,
});

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtNum(n: number, digits = 0) {
  try {
    return n.toLocaleString("ar-EG", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  } catch {
    return n.toFixed(digits);
  }
}

function HRReportsPage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [monthYear, setMonthYear] = useState(currentMonth);

  const { data: summary } = useHRSummary(monthYear);
  const { data: trend = [] } = usePayrollTrend(monthYear);
  const { data: deficit = [] } = useAttendanceDeficit(monthYear);
  const { data: unconfigured = [] } = useUnconfiguredSalaries();
  const { data: leaves = [] } = useActiveLeavesToday();

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4" dir={isAr ? "rtl" : "ltr"}>
      {/* Header + filter */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" style={{ color: "#4f46e5" }} />
            {isAr ? "تقارير الموارد البشرية" : "HR Analytics"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? "ملخصات وأداء الموظفين والرواتب"
              : "Employee performance and payroll summaries"}
          </p>
        </div>
        <div>
          <Label className="text-xs">{isAr ? "الشهر (YYYY-MM)" : "Month"}</Label>
          <Input
            type="text"
            placeholder="YYYY-MM"
            value={monthYear}
            onChange={(e) => setMonthYear(e.target.value)}
            className="w-32 font-mono"
            pattern="\d{4}-\d{2}"
            maxLength={7}
          />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI
          color="emerald"
          icon={<BarChart3 className="h-5 w-5" />}
          label={isAr ? "إجمالي رواتب الشهر" : "Total Monthly Payroll"}
          value={fmtNum(summary?.totalPayroll ?? 0, 2)}
          suffix={isAr ? "ج.م" : "EGP"}
        />
        <KPI
          color="amber"
          icon={<Clock className="h-5 w-5" />}
          label={isAr ? "متوسط دقائق التأخير" : "Avg Late Minutes"}
          value={fmtNum(summary?.avgLateMinutes ?? 0, 1)}
          suffix={isAr ? "دقيقة" : "min"}
        />
        <KPI
          color="rose"
          icon={<UserX className="h-5 w-5" />}
          label={isAr ? "إجمالي أيام الغياب" : "Total Absent Days"}
          value={fmtNum(summary?.totalAbsentDays ?? 0)}
          suffix={isAr ? "يوم" : "days"}
        />
        <KPI
          color="blue"
          icon={<Users className="h-5 w-5" />}
          label={isAr ? "الموظفون النشطون" : "Active Headcount"}
          value={fmtNum(summary?.activeHeadcount ?? 0)}
          suffix={isAr ? "موظف" : "emp"}
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-600" />
            {isAr ? "منحنى المصروفات الشهري" : "Payroll Cost Trend"}
            <span className="text-xs text-muted-foreground font-normal">
              {isAr ? "(آخر 6 شهور)" : "(last 6 months)"}
            </span>
          </h2>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={trend} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtNum(Number(v))} />
                <Tooltip
                  formatter={(v) => [fmtNum(Number(v), 2), isAr ? "إجمالي" : "Total"]}
                  labelFormatter={(l) => String(l)}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-rose-600" />
            {isAr ? "الأكثر تأخيرًا وغيابًا" : "Top Attendance Deficit"}
            <span className="text-xs text-muted-foreground font-normal">
              {isAr ? "(أعلى 5)" : "(top 5)"}
            </span>
          </h2>
          {deficit.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-12">
              {isAr ? "لا توجد بيانات لهذا الشهر" : "No data for this month"}
            </div>
          ) : (
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart
                  data={deficit}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 16, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 11 }}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(v, k) => {
                      if (k === "late_minutes")
                        return [fmtNum(Number(v)), isAr ? "دقائق تأخير" : "Late min"];
                      if (k === "absent_days")
                        return [fmtNum(Number(v)), isAr ? "أيام غياب" : "Absent days"];
                      return [String(v), String(k)];
                    }}
                  />
                  <Bar dataKey="late_minutes" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="absent_days" stackId="a" fill="#ef4444">
                    {deficit.map((_, i) => (
                      <Cell key={i} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Bottom highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            {isAr ? "موظفون بلا رواتب أساسية" : "Unconfigured Salaries"}
            <Badge variant="outline" className="ms-auto bg-amber-100 text-amber-800 border-amber-300">
              {unconfigured.length}
            </Badge>
          </h2>
          {unconfigured.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              {isAr ? "كل الموظفين معدّ لهم راتب" : "All employees configured"}
            </div>
          ) : (
            <ul className="divide-y">
              {unconfigured.map((e) => (
                <li key={e.id} className="py-2 flex items-center justify-between text-sm">
                  <span className="font-medium">{e.name}</span>
                  <a
                    href="/users/employees"
                    className="text-blue-600 hover:underline text-xs"
                  >
                    {isAr ? "تعيين الراتب" : "Set salary"}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-purple-600" />
            {isAr ? "في إجازة اليوم" : "On Leave Today"}
            <Badge variant="outline" className="ms-auto bg-purple-100 text-purple-800 border-purple-300">
              {leaves.length}
            </Badge>
          </h2>
          {leaves.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              {isAr ? "لا أحد في إجازة اليوم" : "Nobody on leave today"}
            </div>
          ) : (
            <ul className="divide-y">
              {leaves.map((l) => (
                <li key={l.id} className="py-2 flex items-center justify-between text-sm gap-3">
                  <span className="font-medium">{l.name}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {l.notes || "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

type KPIColor = "emerald" | "amber" | "rose" | "blue";

function KPI({
  color, icon, label, value, suffix,
}: {
  color: KPIColor;
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
}) {
  const m: Record<KPIColor, string> = {
    emerald: "from-emerald-50 to-white border-emerald-200 text-emerald-800",
    amber: "from-amber-50 to-white border-amber-200 text-amber-800",
    rose: "from-rose-50 to-white border-rose-200 text-rose-800",
    blue: "from-blue-50 to-white border-blue-200 text-blue-800",
  };
  return (
    <Card className={`p-4 bg-gradient-to-br ${m[color]} border`}>
      <div className="flex items-center justify-between">
        <div className="text-xs opacity-70">{label}</div>
        <div className="opacity-60">{icon}</div>
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1">
        {value}
        {suffix && <span className="text-sm font-normal opacity-70 ms-1">{suffix}</span>}
      </div>
    </Card>
  );
}
