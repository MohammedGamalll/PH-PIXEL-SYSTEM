import { createFileRoute } from "@tanstack/react-router";
import { InvoiceForm } from "@/components/sales/InvoiceForm";

export const Route = createFileRoute("/_authenticated/sales/quotations-add")({
  component: () => <InvoiceForm mode="quotation" />,
});
