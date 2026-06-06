import { createFileRoute } from "@tanstack/react-router";
import { SalesImportPage } from "@/components/sales/SalesImportPage";

export const Route = createFileRoute("/_authenticated/sales/import")({
  component: SalesImportPage,
});
