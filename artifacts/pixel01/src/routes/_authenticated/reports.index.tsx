import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, FileText } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/reports/")({
  component: ReportsPage,
});

const COLORS = ["hsl(var(--primary))", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

function ReportsPage() {
  const { user } = useAuth();
  const { lang, t, dir } = useI18n();
  const isAr = lang === "ar";

  const { data: invoices = [] } = useQuery({
    queryKey: ["rep_invoices"], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("total, issue_date, status");
      if (error) throw error;
      return data;
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["rep_expenses"], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("amount, category, expense_date");
      if (error) throw error;
      return data;
    },
  });

  const totalSales = invoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const netProfit = totalSales - totalExpenses;

  // Monthly comparison
  const months: Record<string, { month: string; sales: number; expenses: number }> = {};
  const monthName = (n: number) => {
    const ar = ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"];
    const en = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return (isAr ? ar : en)[n];
  };
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    months[k] = { month: monthName(d.getMonth()), sales: 0, expenses: 0 };
  }
  invoices.forEach((i) => {
    const d = new Date(i.issue_date);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    if (months[k]) months[k].sales += Number(i.total || 0);
  });
  expenses.forEach((e) => {
    const d = new Date(e.expense_date);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    if (months[k]) months[k].expenses += Number(e.amount || 0);
  });
  const monthly = Object.values(months);

  // Expenses by category
  const byCat: Record<string, number> = {};
  expenses.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0); });
  const catData = Object.entries(byCat).map(([name, value]) => ({ name, value }));

  const stats = [
    { label: t("reports.index.total_sales"), value: totalSales, icon: TrendingUp, color: "text-green-600" },
    { label: t("reports.index.total_expenses"), value: totalExpenses, icon: TrendingDown, color: "text-destructive" },
    { label: t("reports.index.net_profit"), value: netProfit, icon: DollarSign, color: netProfit >= 0 ? "text-primary" : "text-destructive" },
    { label: t("reports.index.invoices_count"), value: invoices.length, icon: FileText, color: "text-foreground", isCount: true },
  ];

  return (
    <div className="space-y-6 max-w-7xl" dir={dir}>
      <div>
        <h1 className="text-2xl font-bold">{t("reports.index.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("reports.index.subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-2xl font-bold mt-1 ${s.color}`}>
                  {s.isCount ? s.value : Number(s.value).toFixed(2)}
                </p>
              </div>
              <s.icon className={`h-8 w-8 ${s.color} opacity-40`} />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold mb-4">{t("reports.index.sales_vs_expenses")}</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="sales" name={t("reports.index.sales")} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name={t("reports.index.expenses")} fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">{t("reports.index.by_category")}</h2>
          <div className="h-72">
            {catData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {t("reports.no_data")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(d: { name: string }) => d.name}>
                    {catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
