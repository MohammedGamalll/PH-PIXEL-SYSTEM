import { createFileRoute } from "@tanstack/react-router";
import { AccountsListPage } from "@/components/accounting/AccountsListPage";

export const Route = createFileRoute("/_authenticated/accounting/accounts")({
  component: AccountsListPage,
});
