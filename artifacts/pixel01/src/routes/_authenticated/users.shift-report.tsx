import { createFileRoute } from "@tanstack/react-router";
import { ShiftReportPage } from "@/components/users/ShiftReportPage";

export const Route = createFileRoute("/_authenticated/users/shift-report")({
  component: ShiftReportPage,
});
