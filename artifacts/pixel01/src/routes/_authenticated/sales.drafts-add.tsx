import { createFileRoute } from "@tanstack/react-router";
import { InvoiceForm } from "@/components/sales/InvoiceForm";

export const Route = createFileRoute("/_authenticated/sales/drafts-add")({
  component: () => <InvoiceForm mode="draft" />,
});
