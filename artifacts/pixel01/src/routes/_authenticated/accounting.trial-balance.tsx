import { createFileRoute } from "@tanstack/react-router";
import { TrialBalancePage } from "@/components/accounting/TrialBalancePage";

export const Route = createFileRoute("/_authenticated/accounting/trial-balance")({
  component: TrialBalancePage,
});
