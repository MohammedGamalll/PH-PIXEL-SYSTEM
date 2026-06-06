import { createFileRoute } from "@tanstack/react-router";
import { ProfitLossPage } from "@/components/accounting/ProfitLossPage";

export const Route = createFileRoute("/_authenticated/accounting/profit-loss")({
  component: ProfitLossPage,
});
