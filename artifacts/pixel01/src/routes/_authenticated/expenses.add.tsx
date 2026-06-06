import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/products/PageHeader";
import { useCreateExpense } from "@/hooks/use-expenses-new";
import { useI18n } from "@/lib/i18n";
import { ExpenseForm } from "@/components/expenses/ExpenseForm";

export const Route = createFileRoute("/_authenticated/expenses/add")({
  component: AddExpensePage,
});

function AddExpensePage() {
  const { t, dir } = useI18n();
  const navigate = useNavigate();
  const create = useCreateExpense();

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("expenses.page.add_title")} showBack />
      <ExpenseForm
        submitLabel={t("expenses.actions.save")}
        isSubmitting={create.isPending}
        onSubmit={async (values) => {
          await create.mutateAsync(values);
          navigate({ to: "/expenses/all" });
        }}
      />
    </div>
  );
}
