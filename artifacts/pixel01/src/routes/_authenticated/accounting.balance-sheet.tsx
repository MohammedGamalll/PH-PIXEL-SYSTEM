import { createFileRoute } from "@tanstack/react-router";
import { BalanceSheetPage } from "@/components/accounting/BalanceSheetPage";

export const Route = createFileRoute("/_authenticated/accounting/balance-sheet")({
  component: BalanceSheetPage,
});
