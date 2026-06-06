import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { LabelDesign } from "@/components/products/LabelDesign";
import { toast } from "sonner";
import { Trash2, Search, Printer } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { normalizeArabic } from "@/lib/search";
import { computeProductBatches } from "@/lib/product-batches";
import { formatExpiryShort } from "@/hooks/use-product-batches";

type LabelSearch = { productId?: string; qty?: number };

export const Route = createFileRoute("/_authenticated/products/print-labels")({
  validateSearch: (raw: Record<string, unknown>): LabelSearch => ({
    productId: typeof raw.productId === "string" ? raw.productId : undefined,
    qty: raw.qty != null ? Math.max(1, Math.min(200, Number(raw.qty) || 1)) : undefined,
  }),
  component: PrintLabelsPage,
});

const BLUE = "#3b82f6";
const RED = "#ef4444";
const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db", backgroundColor: "#ffffff",
  borderRadius: 6, height: 38, padding: "0 10px", width: "100%", fontSize: 14, outline: "none",
};
const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px" };

function PrintLabelsPage() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const search0 = Route.useSearch();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const autoAddedRef = useRef<string | null>(null);
  const headStyle: React.CSSProperties = {
    backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px",
    fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb",
  };

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!search0.productId) return;
    if (autoAddedRef.current === search0.productId) return;
    if (!products || products.length === 0) return;
    const p = (products as any[]).find((x) => x.id === search0.productId);
    if (!p) return;
    autoAddedRef.current = search0.productId;
    setItems((s) => (s.some((x) => x.id === p.id) ? s : [...s, { ...p, qty: search0.qty ?? 1 }]));
  }, [products, search0.productId, search0.qty]);

  const matches = useMemo(() => {
    const q = normalizeArabic(search);
    if (!q) return [];
    return products.filter((p: any) =>
      normalizeArabic(`${p.name ?? ""} ${p.name_en ?? ""} ${p.sku ?? ""}`).includes(q)
    ).slice(0, 5);
  }, [search, products]);

  // Auto-add when exactly one match for a non-trivial query
  const lastAutoAddedQueryRef = useRef<string>("");
  useEffect(() => {
    const q = normalizeArabic(search);
    if (q.length < 2) return;
    if (matches.length !== 1) return;
    if (lastAutoAddedQueryRef.current === q) return;
    const p: any = matches[0];
    lastAutoAddedQueryRef.current = q;
    setItems((s) => (s.some((x) => x.id === p.id) ? s : [...s, { ...p, qty: 1 }]));
    setSearch("");
  }, [matches, search]);

  // Fetch nearest expiry for items in the list
  const itemIds = useMemo(() => items.map((i) => i.id), [items]);
  const { data: expiryMap } = useQuery({
    queryKey: ["label-expiries", itemIds],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const result = new Map<string, string>();
      await Promise.all(itemIds.map(async (id) => {
        const list = await computeProductBatches(id);
        const valid = list
          .filter((b) => b.expiry_date && b.remaining > 0 && b.expiry_date >= today)
          .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
        result.set(id, valid[0]?.expiry_date ?? "");
      }));
      return result;
    },
  });

  const flatLabels = items.flatMap((it, idx) =>
    Array.from({ length: Math.max(1, Number(it.qty) || 1) }).map((_, n) => ({ it, key: `${idx}-${n}` }))
  );

  const doPrint = () => {
    if (flatLabels.length === 0) { toast.error(t("products.toast.add_one_item")); return; }
    window.print();
  };

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader
        title={t("products.labels.title")}
        actions={
          <button type="button" onClick={doPrint}
            className="h-9 px-4 rounded-md text-white text-sm inline-flex items-center gap-2"
            style={{ backgroundColor: BLUE }}>
            <Printer className="h-4 w-4" /> {t("products.labels.print")}
          </button>
        }
      />

      <DataCard>
        <div className="relative mb-3">
          <Search className="h-4 w-4 absolute top-1/2 -translate-y-1/2" style={{ insetInlineEnd: "0.5rem", color: "#9ca3af" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("products.labels.search")}
            className="h-10 rounded-md w-full px-3 pe-8 text-sm outline-none"
            style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff" }} />
          {matches.length > 0 && (
            <div className="absolute z-10 start-0 end-0 mt-1 rounded-md" style={{ border: "1px solid #e5e7eb", backgroundColor: "#ffffff" }}>
              {matches.map((p: any) => (
                <button key={p.id} type="button"
                  onClick={() => { setItems((s) => [...s, { ...p, qty: 1 }]); setSearch(""); }}
                  className="block w-full text-start px-3 py-2 text-sm hover:bg-gray-50">
                  {p.name}{p.name_en ? ` — ${p.name_en}` : ""} {p.sku ? `(${p.sku})` : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={headStyle}>{t("products.labels.col.item")}</th><th style={headStyle}>{t("products.labels.col.sku")}</th>
            <th style={headStyle}>{t("products.labels.col.price")}</th><th style={headStyle}>{t("products.labels.col.count")}</th><th style={headStyle}></th>
          </tr></thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5} style={{ ...cellStyle, textAlign: "center", color: "#6b7280" }}>{t("products.labels.empty")}</td></tr>
            ) : items.map((it, idx) => (
              <tr key={idx}>
                <td style={cellStyle}>{it.name}{it.name_en ? ` — ${it.name_en}` : ""}</td>
                <td style={cellStyle}>{it.sku || "—"}</td>
                <td style={cellStyle}>{Number(it.price ?? 0).toFixed(2)}</td>
                <td style={cellStyle}>
                  <input type="number" min="1" value={it.qty} style={{ ...inputStyle, height: 32, width: 80 }}
                    onChange={(e) => setItems((s) => s.map((x, k) => k === idx ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x))} />
                </td>
                <td style={cellStyle}>
                  <button onClick={() => setItems((s) => s.filter((_, k) => k !== idx))}
                    className="h-8 w-8 rounded-md inline-flex items-center justify-center" style={{ color: RED }}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataCard>

      {flatLabels.length > 0 && (
        <DataCard>
          <div className="text-sm font-semibold mb-3" style={{ color: "#111827" }}>{t("products.labels.preview")}</div>
          <div className="print-area print-area--stickers flex flex-wrap gap-3 justify-center" style={{ backgroundColor: "#f9fafb", padding: 12, borderRadius: 8 }}>
            {flatLabels.map(({ it, key }) => (
              <div key={key} style={{ border: "1px dashed #d1d5db", backgroundColor: "#ffffff" }}>
                <LabelDesign product={it} expiry={formatExpiryShort(expiryMap?.get(it.id))} />
              </div>
            ))}
          </div>
        </DataCard>
      )}
    </div>
  );
}
