import { useQuery } from "@tanstack/react-query";
import { fetchSessionStandaloneReturns } from "@/lib/cashier-session-data";

export function useSessionStandaloneReturns(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["session-standalone-returns", sessionId],
    enabled: !!sessionId,
    queryFn: () => fetchSessionStandaloneReturns(sessionId!),
  });
}
