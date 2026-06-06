import { createFileRoute } from "@tanstack/react-router";
import { SalesListPage } from "@/components/sales/SalesListPage";

export const Route = createFileRoute("/_authenticated/sales/quotations")({
  component: () => <SalesListPage mode="quotation" />,
});
