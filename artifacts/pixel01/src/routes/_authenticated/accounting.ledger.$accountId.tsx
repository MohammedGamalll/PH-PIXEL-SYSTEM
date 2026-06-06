import { createFileRoute } from "@tanstack/react-router";
import { LedgerPage } from "@/components/accounting/LedgerPage";

export const Route = createFileRoute("/_authenticated/accounting/ledger/$accountId")({
  component: LedgerRoute,
});

function LedgerRoute() {
  const { accountId } = Route.useParams();
  return <LedgerPage accountId={accountId} />;
}
