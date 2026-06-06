import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/products/PageHeader";
import { ContactFilters } from "@/components/contacts/ContactFilters";
import { DataCard } from "@/components/products/DataCard";
import { ReportTable } from "@/components/reports/ReportTable";
import type { ColumnDef } from "@/components/products/TableToolbar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Printer } from "lucide-react";
import { usePurchases } from "@/hooks/use-purchases";
import { useExpenses } from "@/hooks/use-expenses-new";
import { useContacts } from "@/hooks/use-contacts";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/reports/tax")({
  component: TaxReportPage,
});

function TaxReportPage() {
  const { t, dir, lang } = useI18n();
  const locale = lang === "ar" ? "ar-EG" : "en-US";
  const cur = (n: number) => t("reports.currency", { n: n.toFixed(2) });
  const { user } = useAuth();
  const [tab, setTab] = useState("purchase");
  const { data: purchases = [] } = usePurchases();
  const { data: expenses = [] } = useExpenses();
  const { data: suppliers = [] } = useContacts("supplier");
  const { data: customers = [] } = useContacts("customer");
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices_all"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const purchaseCols: ColumnDef[] = [
    { key: "date", label: t("reports.col.date"), visible: true },
    { key: "ref", label: t("reports.col.ref"), visible: true },
    { key: "supplier", label: t("reports.col.supplier"), visible: true },
    { key: "tax_no", label: t("reports.col.tax_no"), visible: true },
    { key: "amount", label: t("reports.col.amount"), visible: true },
    { key: "method", label: t("reports.col.method"), visible: true },
    { key: "discount", label: t("reports.col.discount"), visible: true },
  ];
  const salesCols: ColumnDef[] = [
    { key: "date", label: t("reports.col.date"), visible: true },
    { key: "ref", label: t("reports.col.ref"), visible: true },
    { key: "customer", label: t("reports.col.customer"), visible: true },
    { key: "tax_no", label: t("reports.col.tax_no"), visible: true },
    { key: "amount", label: t("reports.col.amount"), visible: true },
    { key: "method", label: t("reports.col.method"), visible: true },
    { key: "discount", label: t("reports.col.discount"), visible: true },
  ];
  const expensesCols: ColumnDef[] = [
    { key: "date", label: t("reports.col.date"), visible: true },
    { key: "ref", label: t("reports.col.ref"), visible: true },
    { key: "supplier", label: t("reports.col.supplier"), visible: true },
    { key: "amount", label: t("reports.col.amount"), visible: true },
    { key: "method", label: t("reports.col.method"), visible: true },
  ];

  const supMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of suppliers as any[]) m.set(s.id, s);
    return m;
  }, [suppliers]);
  const custMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of customers as any[]) m.set(c.id, c);
    return m;
  }, [customers]);
  const contactName = (c: any) => c ? (c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "") : "";

  const purchaseRows = useMemo(
    () =>
      (purchases as any[]).map((p) => {
        const s = p.supplier_id ? supMap.get(p.supplier_id) : null;
        return {
          id: p.id,
          date: p.purchase_date ? new Date(p.purchase_date).toLocaleDateString(locale) : "",
          ref: p.ref_no || p.purchase_number || "",
          supplier: contactName(s) || "",
          tax_no: s?.tax_number || "",
          amount: Number(p.tax || 0),
          method: p.payment_method || "",
          discount: Number(p.discount_amount || 0),
        };
      }),
    [purchases, supMap, locale],
  );

  const salesRows = useMemo(
    () =>
      (invoices as any[]).map((i) => {
        const c = i.customer_id ? custMap.get(i.customer_id) : null;
        return {
          id: i.id,
          date: i.issue_date ? new Date(i.issue_date).toLocaleDateString(locale) : "",
          ref: i.invoice_number || "",
          customer: contactName(c) || i.customer_name_snapshot || "عميل نقدي",
          tax_no: c?.tax_number || "",
          amount: Number(i.tax || 0),
          method: i.payment_method || "",
          discount: Number(i.discount_amount || 0),
        };
      }),
    [invoices, custMap, locale],
  );

  const expenseRows = useMemo(
    () =>
      (expenses as any[]).map((e) => {
        const s = e.spent_to ? supMap.get(e.spent_to) : null;
        return {
          id: e.id,
          date: e.expense_date ? new Date(e.expense_date).toLocaleDateString(locale) : "",
          ref: e.ref_no || "",
          supplier: contactName(s) || e.spent_by || "",
          amount: Number(e.tax_applied || 0),
          method: e.payment_method || "",
        };
      }),
    [expenses, supMap, locale],
  );

  const sumTax = (rs: any[]) => rs.reduce((s, r) => s + Number(r.amount || 0), 0);
  const collected = sumTax(salesRows);
  const paid = sumTax(purchaseRows) + sumTax(expenseRows);

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("reports.tax.title")} subtitle={t("reports.tax.subtitle")} />
      <ContactFilters />
      <DataCard>
        <div className="text-sm font-semibold mb-1" style={{ color: "#374151" }}>
          {t("reports.tax.summary_label")}
        </div>
        <div className="text-base" style={{ color: "#374151" }}>
          {t("reports.tax.net")} <span className="font-bold">{cur(collected - paid)}</span>
        </div>
      </DataCard>

      <button
        type="button"
        className="h-9 px-4 rounded-md text-sm flex items-center gap-2 text-white"
        style={{ backgroundColor: "#6366f1" }}
        onClick={() => window.print()}
      >
        <Printer className="h-4 w-4" /> {t("reports.print")}
      </button>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="purchase">{t("reports.tax.tab_purchase")}</TabsTrigger>
          <TabsTrigger value="sales">{t("reports.tax.tab_sales")}</TabsTrigger>
          <TabsTrigger value="expenses">{t("reports.tax.tab_expenses")}</TabsTrigger>
        </TabsList>
        <TabsContent value="purchase">
          <ReportTable
            rows={purchaseRows}
            initialCols={purchaseCols}
            rowKey={(r) => r.id}
            searchFields={(r) => `${r.ref} ${r.supplier}`}
            cellFor={(r, k) => {
              const v = (r as any)[k];
              if (typeof v === "number") return v.toFixed(2);
              return v;
            }}
            numericKeys={["amount", "discount"]}
            exportName="tax-purchase"
            printTitle="tax-purchase"
          />
        </TabsContent>
        <TabsContent value="sales">
          <ReportTable
            rows={salesRows}
            initialCols={salesCols}
            rowKey={(r) => r.id}
            searchFields={(r) => `${r.ref} ${r.customer}`}
            cellFor={(r, k) => {
              const v = (r as any)[k];
              if (typeof v === "number") return v.toFixed(2);
              return v;
            }}
            numericKeys={["amount", "discount"]}
            exportName="tax-sales"
            printTitle="tax-sales"
          />
        </TabsContent>
        <TabsContent value="expenses">
          <ReportTable
            rows={expenseRows}
            initialCols={expensesCols}
            rowKey={(r) => r.id}
            searchFields={(r) => `${r.ref} ${r.supplier}`}
            cellFor={(r, k) => {
              const v = (r as any)[k];
              if (typeof v === "number") return v.toFixed(2);
              return v;
            }}
            numericKeys={["amount"]}
            exportName="tax-expenses"
            printTitle="tax-expenses"
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}
