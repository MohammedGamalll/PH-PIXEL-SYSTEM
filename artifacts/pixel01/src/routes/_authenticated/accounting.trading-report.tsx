import { createFileRoute } from "@tanstack/react-router";
import { TradingReportPage } from "@/components/accounting/TradingReportPage";

export const Route = createFileRoute("/_authenticated/accounting/trading-report")({
  component: TradingReportPage,
});
