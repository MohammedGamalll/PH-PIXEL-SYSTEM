import { createFileRoute } from "@tanstack/react-router";
import { PromotionsPage } from "@/components/sales/PromotionsPage";

export const Route = createFileRoute("/_authenticated/sales/promotions")({
  component: PromotionsPage,
});
