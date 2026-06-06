import { createFileRoute } from "@tanstack/react-router";
import { CashFlowPage } from "@/components/accounting/CashFlowPage";

export const Route = createFileRoute("/_authenticated/accounting/cash-flow")({
  component: CashFlowPage,
});
