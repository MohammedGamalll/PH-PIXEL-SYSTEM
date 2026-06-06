import { createFileRoute } from "@tanstack/react-router";
import { StandaloneReturnPage } from "@/components/returns/StandaloneReturnPage";

export const Route = createFileRoute("/_authenticated/returns/standalone")({
  component: StandaloneReturnPage,
});
