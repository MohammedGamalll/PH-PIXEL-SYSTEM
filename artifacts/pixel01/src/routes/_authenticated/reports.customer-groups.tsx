import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/products/PageHeader";
import { ContactFilters } from "@/components/contacts/ContactFilters";
import { ReportTable } from "@/components/reports/ReportTable";
import type { ColumnDef } from "@/components/products/TableToolbar";
import { useCustomerGroups } from "@/hooks/use-customer-groups";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/reports/customer-groups")({
  component: CustomerGroupsReportPage,
});

function CustomerGroupsReportPage() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const { data: groups = [] } = useCustomerGroups();

  const { data: totals = new Map<string, number>() } = useQuery({
    queryKey: ["customer-groups-report", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // customer_id -> group_id
      const { data: contacts } = await (supabase.from("contacts") as any)
        .select("id, customer_group_id")
        .not("customer_group_id", "is", null);
      const groupByCustomer = new Map<string, string>();
      (contacts ?? []).forEach((c: any) => groupByCustomer.set(c.id, c.customer_group_id));

      const { data: invs } = await (supabase.from("invoices") as any)
        .select("customer_id, total, status, type")
        .eq("type", "sale");
      const sums = new Map<string, number>();
      (invs ?? []).forEach((i: any) => {
        if (i.status === "cancelled") return;
        const gid = i.customer_id ? groupByCustomer.get(i.customer_id) : null;
        if (!gid) return;
        sums.set(gid, (sums.get(gid) || 0) + Number(i.total || 0));
      });
      return sums;
    },
  });

  const cols: ColumnDef[] = [
    { key: "name", label: t("reports.col.group_name"), visible: true },
    { key: "total", label: t("reports.col.total_sales"), visible: true },
  ];
  const rows = useMemo(
    () =>
      (groups as any[]).map((g) => ({
        id: g.id,
        name: g.name,
        total: totals.get(g.id) || 0,
      })),
    [groups, totals],
  );

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("reports.customer_groups.title")} />
      <ContactFilters />
      <ReportTable
        rows={rows}
        initialCols={cols}
        rowKey={(r) => r.id}
        searchFields={(r) => r.name}
        cellFor={(r, k) => {
          const v = (r as any)[k];
          if (typeof v === "number") return v.toFixed(2);
          return v;
        }}
        numericKeys={["total"]}
        exportName="customer-groups-report"
        printTitle="customer-groups-report"
      />
    </div>
  );
}
