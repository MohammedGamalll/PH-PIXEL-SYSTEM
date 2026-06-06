import { createFileRoute } from "@tanstack/react-router";
import { PurchaseForm } from "@/components/purchases/PurchaseForm";

export const Route = createFileRoute("/_authenticated/purchases/add")({
  component: () => <PurchaseForm />,
});
