import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/products/PageHeader";
import { useUpdateExpense } from "@/hooks/use-expenses-new";
import { useI18n } from "@/lib/i18n";
import { ExpenseForm, type ExpenseFormInitial } from "@/components/expenses/ExpenseForm";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/expenses/edit/$id")({
  component: EditExpensePage,
});

function EditExpensePage() {
  const { t, dir } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams({ from: "/_authenticated/expenses/edit/$id" });
  const update = useUpdateExpense();

  const { data: expense, isLoading } = useQuery({
    queryKey: ["expense", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const initial: ExpenseFormInitial | undefined = expense ? {
    branch_id: expense.branch_id ?? undefined,
    category_id: expense.category_id ?? undefined,
    sub_category_id: expense.sub_category_id ?? undefined,
    sales_rep_id: expense.sales_rep_id ?? undefined,
    ref_no: expense.ref_no ?? undefined,
    expense_date: expense.expense_date ?? undefined,
    spent_by: expense.spent_by ?? undefined,
    spent_to: expense.spent_to ?? undefined,
    amount: expense.amount != null ? Number(expense.amount) : undefined,
    reason: expense.reason ?? undefined,
    is_recurring: !!expense.is_recurring,
    recur_interval_number: expense.recur_interval_number ?? undefined,
    recur_interval_type: expense.recur_interval_type ?? undefined,
    recur_count: expense.recur_count ?? undefined,
    tax_applied: expense.tax_applied ?? undefined,
    payment_method: expense.payment_method ?? undefined,
    payment_account: expense.payment_account ?? undefined,
    payment_note: expense.payment_note ?? undefined,
    paid_amount: expense.paid_amount != null ? Number(expense.paid_amount) : undefined,
    notes: expense.notes ?? undefined,
  } : undefined;

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title="تعديل المصروف" />
      {isLoading || !expense ? (
        <div className="p-6 text-center text-sm" style={{ color: "#6b7280" }}>جاري التحميل...</div>
      ) : (
        <ExpenseForm
          initial={initial}
          submitLabel={t("expenses.actions.save")}
          isSubmitting={update.isPending}
          onSubmit={async (values) => {
            await update.mutateAsync({ id, values });
            navigate({ to: "/expenses/all" });
          }}
        />
      )}
    </div>
  );
}
