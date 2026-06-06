import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { printTableElement } from "@/lib/print-table";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/reports/trending-items")({
  component: TrendingItemsPage,
});

type Row = { id: string; name: string; qty: number; total: number };

function TrendingItemsPage() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState("10");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: aggregated = [] } = useQuery({
    queryKey: ["trending-items", from, to],
    enabled: !!user,
    queryFn: async (): Promise<Row[]> => {
      const [iItemsRes, invoicesRes, productsRes] = await Promise.all([
        (supabase.from("invoice_items") as any).select("product_id,quantity,base_quantity,total,invoice_id"),
        (supabase.from("invoices") as any).select("id,type,issue_date,is_returned_from_id"),
        (supabase.from("products") as any).select("id,name"),
      ]);
      if (iItemsRes.error) throw iItemsRes.error;
      if (invoicesRes.error) throw invoicesRes.error;
      if (productsRes.error) throw productsRes.error;

      const invMap = new Map<string, any>();
      for (const i of (invoicesRes.data ?? []) as any[]) invMap.set(i.id, i);
      const prodMap = new Map<string, string>();
      for (const p of (productsRes.data ?? []) as any[]) prodMap.set(p.id, p.name);

      const agg = new Map<string, { qty: number; total: number; name: string }>();
      for (const it of (iItemsRes.data ?? []) as any[]) {
        const inv = invMap.get(it.invoice_id);
        if (!inv || inv.type !== "sale") continue;
        if (inv.is_returned_from_id) continue;
        if (from && (!inv.issue_date || inv.issue_date < from)) continue;
        if (to && (!inv.issue_date || inv.issue_date > to)) continue;
        if (!it.product_id) continue;
        const name = prodMap.get(it.product_id) || "—";
        const cur = agg.get(it.product_id) || { qty: 0, total: 0, name };
        cur.qty += Number(it.base_quantity ?? it.quantity ?? 0);
        cur.total += Number(it.total ?? 0);
        agg.set(it.product_id, cur);
      }
      return Array.from(agg.entries())
        .map(([id, v]) => ({ id, name: v.name, qty: v.qty, total: v.total }))
        .sort((a, b) => b.qty - a.qty);
    },
  });

  const limited = useMemo(() => {
    if (limit === "all") return aggregated;
    const n = Number(limit) || 10;
    return aggregated.slice(0, n);
  }, [aggregated, limit]);

  const inp: React.CSSProperties = { border: "1px solid #d1d5db", backgroundColor: "#ffffff", borderRadius: 6, height: 36, padding: "0 8px", fontSize: 13, outline: "none", color: "#374151" };
  const lbl: React.CSSProperties = { fontSize: 12, color: "#374151", marginBottom: 4, display: "block" };
  const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151" };
  const headStyle: React.CSSProperties = { backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px", fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb" };

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("reports.trending.title")} />

      <DataCard>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label style={lbl}>{t("reports.col.date")}</label>
            <div className="flex gap-1">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inp, width: "100%" }} />
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...inp, width: "100%" }} />
            </div>
          </div>
          <div>
            <label style={lbl}>عدد الأصناف</label>
            <select value={limit} onChange={(e) => setLimit(e.target.value)} style={{ ...inp, width: "100%" }}>
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="all">{t("users.filters.all")}</option>
            </select>
          </div>
        </div>

        <h3 className="text-center text-sm font-semibold mb-2" style={{ color: "#374151" }}>
          {t("reports.trending.chart_title")}
        </h3>
        <div ref={printRef} style={{ width: "100%", height: 380 }}>
          <ResponsiveContainer>
            <BarChart data={limited} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#374151" }} angle={-25} textAnchor="end" interval={0} height={70} />
              <YAxis tick={{ fontSize: 12, fill: "#374151" }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="qty" name={t("reports.trending.qty_sold")} fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={headStyle}>{t("reports.col.item")}</th>
              <th style={headStyle}>{t("reports.trending.qty_sold")}</th>
              <th style={headStyle}>{t("reports.col.sum")}</th>
            </tr></thead>
            <tbody>
              {limited.length === 0 ? (
                <tr><td colSpan={3} style={{ ...cellStyle, textAlign: "center", color: "#9ca3af" }}>—</td></tr>
              ) : limited.map((r) => (
                <tr key={r.id}>
                  <td style={cellStyle}>{r.name}</td>
                  <td style={cellStyle}>{r.qty.toFixed(2)}</td>
                  <td style={cellStyle}>{r.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-start mt-4">
          <button
            type="button"
            onClick={() => printTableElement(printRef.current, "trending-items")}
            className="h-9 px-4 rounded-md text-sm flex items-center gap-2 text-white"
            style={{ backgroundColor: "#3b82f6" }}
          >
            <Printer className="h-4 w-4" /> {t("reports.print")}
          </button>
        </div>
      </DataCard>
    </div>
  );
}
