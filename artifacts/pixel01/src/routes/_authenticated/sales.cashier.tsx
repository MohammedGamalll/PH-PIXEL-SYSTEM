import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { CashierApp } from "@/components/sales/cashier/CashierApp";
import { useCashierSessions } from "@/hooks/use-invoices";
import { useI18n } from "@/lib/i18n";

const searchSchema = z.object({ session: z.string().optional() });

export const Route = createFileRoute("/_authenticated/sales/cashier")({
  validateSearch: (s) => searchSchema.parse(s),
  component: CashierPage,
});

function CashierPage() {
  const { t, dir } = useI18n();
  const { session } = Route.useSearch();
  const { data: sessions = [], isLoading } = useCashierSessions();
  if (isLoading) return null;
  const byId = session ? sessions.find((s: any) => s.id === session) : null;
  if (session && byId?.status === "closed") {
    return (
      <div dir={dir} className="p-6 text-center text-sm" style={{ color: "#374151" }}>
        {t("sales.session.closed_reopen") || "هذه الجلسة مغلقة."}{" "}
        <Link to="/sales/cashier-session" className="text-blue-600 underline">
          {t("sales.session.start_new")}
        </Link>
      </div>
    );
  }
  const active = byId?.status === "open"
    ? byId
    : sessions.find((s: any) => s.status === "open");

  if (!active) {
    return (
      <div dir={dir} className="p-6 text-center text-sm" style={{ color: "#374151" }}>
        {t("sales.session.none_open")}{" "}
        <Link to="/sales/cashier-session" className="text-blue-600 underline">
          {t("sales.session.start_new")}
        </Link>
      </div>
    );
  }

  return (
    <div className="-m-3 sm:-m-4 lg:-m-8" style={{ height: "calc(100dvh - 64px)" }}>
      <CashierApp sessionId={active.id} />
    </div>
  );
}
