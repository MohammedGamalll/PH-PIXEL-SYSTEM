import { createFileRoute } from "@tanstack/react-router";
import { ShippingListPage } from "@/components/sales/ShippingListPage";

export const Route = createFileRoute("/_authenticated/sales/shipping")({
  component: ShippingListPage,
});
