import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { useOpenCashierSession, useCashierSessions } from "@/hooks/use-invoices";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/sales/cashier-session")({
  component: NewSession,
});

function NewSession() {
  const { t, dir } = useI18n();
  const [cash, setCash] = useState<string>("");
  const open = useOpenCashierSession();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: sessions = [], isLoading } = useCashierSessions();

  const myOpenSession = (sessions as any[]).find((s) => s.status === "open" && s.user_id === user?.id);

  useEffect(() => {
    if (isLoading) return;
    if (myOpenSession) {
      navigate({ to: "/sales/cashier", search: { session: myOpenSession.id } as any });
    }
  }, [myOpenSession, isLoading, navigate]);

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("sales.titles.new_session")} />
      <DataCard className="border-gray-300">
        <label className="block mb-1.5 text-sm font-semibold text-start" style={{ color: "#374151" }}>{t("sales.session.open_cash")}</label>
        <input value={cash} onChange={(e) => setCash(e.target.value)} type="number" min={0} step="0.01" placeholder={t("sales.session.enter_amount")}
          className="h-10 px-3 rounded-md text-sm w-full outline-none mb-4"
          style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151" }} />
        <div className="flex gap-2">
          <button type="button" disabled={open.isPending || !cash || !!myOpenSession} onClick={async () => {
            if (myOpenSession) return;
            const id = await open.mutateAsync(Number(cash) || 0);
            navigate({ to: "/sales/cashier", search: { session: id } as any });
          }}
            className="h-11 px-5 rounded-md text-white text-sm" style={{ backgroundColor: "#6366f1" }}>
            {t("sales.session.start")}
          </button>
          <Link to="/sales/cashier-log" className="h-11 px-5 rounded-md text-sm inline-flex items-center" style={{ border: "1px solid #d1d5db", color: "#374151" }}>
            {t("sales.session.log")}
          </Link>
        </div>
      </DataCard>
    </div>
  );
}
