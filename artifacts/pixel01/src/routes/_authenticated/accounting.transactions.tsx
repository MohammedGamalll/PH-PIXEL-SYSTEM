import { createFileRoute } from "@tanstack/react-router";
import { TransactionsLogPage } from "@/components/accounting/TransactionsLogPage";

export const Route = createFileRoute("/_authenticated/accounting/transactions")({
  component: TransactionsLogPage,
});
