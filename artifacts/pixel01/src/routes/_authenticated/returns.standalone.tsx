import { createFileRoute } from "@tanstack/react-router";
import { StandaloneReturnPage } from "@/components/returns/StandaloneReturnPage";

export const Route = createFileRoute("/_authenticated/returns/standalone")({
  validateSearch: (search: Record<string, unknown>) => ({
    sessionId: typeof search.sessionId === "string" ? search.sessionId : undefined,
  }),
  component: StandaloneReturnPage,
});
