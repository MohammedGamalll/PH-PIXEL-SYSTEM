import { createFileRoute } from "@tanstack/react-router";
import { DetailedSalesReportPage } from "@/components/sales/DetailedSalesReportPage";

export const Route = createFileRoute("/_authenticated/sales/detailed-report")({
  component: DetailedSalesReportPage,
});
