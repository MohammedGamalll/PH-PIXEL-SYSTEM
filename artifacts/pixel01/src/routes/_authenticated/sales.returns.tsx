import { createFileRoute } from "@tanstack/react-router";
import { SalesReturnsPage } from "@/components/sales/SalesReturnsPage";

export const Route = createFileRoute("/_authenticated/sales/returns")({
  component: SalesReturnsPage,
});
