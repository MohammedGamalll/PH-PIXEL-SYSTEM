import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, Package } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { useI18n } from "@/lib/i18n";
import { formatBaseQuantity, toMainUnits } from "@/lib/units";
import { useProductBatches } from "@/hooks/use-product-batches";
import { BatchChips } from "@/components/products/BatchChips";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: any | null;
}

const BORDER = "1px solid #9ca3af";
const HEAD_BG = "#f3f4f6";

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex" style={{ borderBottom: "1px solid #e5e7eb" }}>
      <div className="w-40 px-3 py-2 text-sm font-medium" style={{ background: HEAD_BG, color: "#374151" }}>
        {label}
      </div>
      <div className="flex-1 px-3 py-2 text-sm" style={{ color: "#111827" }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

export function ProductDetailsDialog({ open, onOpenChange, product }: Props) {
  const { t, dir, lang } = useI18n();
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const { data: profile } = useQuery({
    queryKey: ["profile", ownerId],
    enabled: !!user && !!ownerId && open,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("company_name,full_name").eq("id", ownerId!).maybeSingle();
      return data;
    },
  });
  const { data: category } = useQuery({
    queryKey: ["product-cat", product?.category_id],
    enabled: !!product?.category_id && open,
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("name").eq("id", product!.category_id).single();
      return data;
    },
  });
  const { data: brand } = useQuery({
    queryKey: ["product-brand", product?.brand_id],
    enabled: !!product?.brand_id && open,
    queryFn: async () => {
      const { data } = await supabase.from("brands").select("name").eq("id", product!.brand_id).single();
      return data;
    },
  });

  if (!product) return null;

  const storeName = profile?.company_name || profile?.full_name || t("products.details.store");
  const printDate = new Date().toLocaleString(lang === "ar" ? "ar-EG" : "en-US");
  const currency = t("products.details.currency");
  const cost = Number(product.cost ?? 0);
  const price = Number(product.price ?? 0);
  const margin = price - cost;
  const marginPct = cost > 0 ? ((margin / cost) * 100).toFixed(2) : "—";
  const stock = Number(product.stock ?? 0);
  const mainQty = toMainUnits(stock, product);
  const stockLabel = formatBaseQuantity(stock, product);
  const stockValueCost = cost * mainQty;
  const stockValuePrice = price * mainQty;
  const threshold = Number(product.low_stock_threshold ?? 0);
  const isOut = mainQty <= 0;
  const isLow = !isOut && threshold > 0 && mainQty <= threshold;
  const alertText = isOut
    ? "⛔ نفذ المخزون"
    : isLow
    ? `⚠️ المخزون منخفض (حد التنبيه: ${threshold})`
    : threshold > 0
    ? `متوفر (حد التنبيه: ${threshold})`
    : "متوفر";
  const alertBg = isOut ? "#fee2e2" : isLow ? "#fef3c7" : "#ecfdf5";
  const alertFg = isOut ? "#991b1b" : isLow ? "#92400e" : "#065f46";

  const unitRows: Array<{ level: string; name: string; ratio: string }> = [];
  if (product.main_unit) unitRows.push({ level: t("products.details.unit_main"), name: product.main_unit, ratio: "—" });
  if (product.sub_unit_1) unitRows.push({
    level: t("products.details.unit_sub1"),
    name: product.sub_unit_1,
    ratio: `1 ${product.main_unit || "—"} = ${product.sub_unit_1_ratio ?? "?"} ${product.sub_unit_1}`,
  });
  if (product.sub_unit_2) unitRows.push({
    level: t("products.details.unit_sub2"),
    name: product.sub_unit_2,
    ratio: `1 ${product.sub_unit_1 || "—"} = ${product.sub_unit_2_ratio ?? "?"} ${product.sub_unit_2}`,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" dir={dir}>
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>{t("products.details.title")} — {product.name}</DialogTitle>
          <button
            onClick={() => window.print()}
            className="h-9 px-4 rounded-md text-sm inline-flex items-center gap-2 text-white me-8"
            style={{ background: "#3b82f6" }}
          >
            <Printer className="h-4 w-4" /> {t("products.details.print")}
          </button>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <div
              className="aspect-square rounded-md overflow-hidden flex items-center justify-center bg-white"
              style={{ border: BORDER }}
            >
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" />
              ) : (
                <Package className="h-16 w-16 text-gray-300" />
              )}
            </div>
          </div>

          <div className="md:col-span-2 rounded-md overflow-hidden" style={{ border: BORDER }}>
            <Row label={t("products.details.name_ar")} value={product.name} />
            <Row label={t("products.details.name_en")} value={product.name_en} />
            <Row label={t("products.details.sku")} value={product.sku} />
            <Row label={t("products.details.category")} value={category?.name} />
            <Row label={t("products.details.brand")} value={brand?.name} />
            <Row label={t("products.details.main_unit")} value={product.main_unit || product.unit} />
          </div>
        </div>

        <div className="rounded-md overflow-hidden" style={{ border: BORDER }}>
          <div className="px-3 py-2 text-sm font-semibold" style={{ background: HEAD_BG, borderBottom: BORDER }}>
            {t("products.details.unit_tree")}
          </div>
          <div className="p-3 text-sm">
            {unitRows.length ? (
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: HEAD_BG }}>
                    <th className="text-start px-2 py-1" style={{ border: "1px solid #e5e7eb" }}>{t("products.details.level")}</th>
                    <th className="text-start px-2 py-1" style={{ border: "1px solid #e5e7eb" }}>{t("products.details.name")}</th>
                    <th className="text-start px-2 py-1" style={{ border: "1px solid #e5e7eb" }}>{t("products.details.equation")}</th>
                  </tr>
                </thead>
                <tbody>
                  {unitRows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1" style={{ border: "1px solid #e5e7eb" }}>{r.level}</td>
                      <td className="px-2 py-1" style={{ border: "1px solid #e5e7eb" }}>{r.name}</td>
                      <td className="px-2 py-1" style={{ border: "1px solid #e5e7eb" }}>{r.ratio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <span className="text-gray-500">{t("products.details.no_sub_units")}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-md overflow-hidden" style={{ border: BORDER }}>
            <div className="px-3 py-2 text-sm font-semibold" style={{ background: HEAD_BG, borderBottom: BORDER }}>{t("products.details.prices")}</div>
            <Row label={t("products.details.cost")} value={`${currency} ${cost.toFixed(2)}`} />
            <Row label={t("products.details.price")} value={`${currency} ${price.toFixed(2)}`} />
            <Row label={t("products.details.profit")} value={`${currency} ${margin.toFixed(2)} (${marginPct}%)`} />
          </div>
          <div className="rounded-md overflow-hidden" style={{ border: BORDER }}>
            <div className="px-3 py-2 text-sm font-semibold" style={{ background: HEAD_BG, borderBottom: BORDER }}>{t("products.details.stock")}</div>
            <Row label={t("products.details.balance")} value={stockLabel} />
            <Row label="حد التنبيه" value={threshold > 0 ? `${threshold} ${product.main_unit || product.unit || ""}` : "—"} />
            <Row label="حالة المخزون" value={<span className="inline-block px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: alertBg, color: alertFg }}>{alertText}</span>} />
            <Row label={t("products.details.stock_value_cost")} value={`${currency} ${stockValueCost.toFixed(2)}`} />
            <Row label={t("products.details.stock_value_price")} value={`${currency} ${stockValuePrice.toFixed(2)}`} />
          </div>
        </div>

        {product && (
          <>
            <BatchChips productId={product.id} product={product} />
            <ExpiryBatches productId={product.id} product={product} />
          </>
        )}

        <div className="rounded-md overflow-hidden" style={{ border: BORDER }}>
          <Row label={t("products.details.created")} value={product.created_at ? new Date(product.created_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US") : "—"} />
          <Row label={t("products.details.updated")} value={product.updated_at ? new Date(product.updated_at).toLocaleString(lang === "ar" ? "ar-EG" : "en-US") : "—"} />
        </div>

        <div className="print-area print-area--details" aria-hidden="true">
          <header className="pd-header">
            <div className="pd-store">{storeName}</div>
            <h1>{t("products.details.print_title")}</h1>
          </header>

          <table className="pd-table">
            <tbody>
              <tr><th>{t("products.details.name")}</th><td>{product.name}</td><th>{t("products.details.name_en")}</th><td>{product.name_en ?? "—"}</td></tr>
              <tr><th>{t("products.details.sku")}</th><td>{product.sku ?? "—"}</td><th>{t("products.details.category")}</th><td>{category?.name ?? "—"}</td></tr>
              <tr><th>{t("products.details.brand")}</th><td>{brand?.name ?? "—"}</td><th>{t("products.details.main_unit")}</th><td>{product.main_unit || product.unit || "—"}</td></tr>
            </tbody>
          </table>

          <h2>{t("products.details.unit_tree")}</h2>
          <table className="pd-table">
            <thead>
              <tr><th>{t("products.details.level")}</th><th>{t("products.details.name")}</th><th>{t("products.details.equation")}</th></tr>
            </thead>
            <tbody>
              {unitRows.length ? unitRows.map((r, i) => (
                <tr key={i}><td>{r.level}</td><td>{r.name}</td><td>{r.ratio}</td></tr>
              )) : <tr><td colSpan={3}>{t("products.details.no_sub_units")}</td></tr>}
            </tbody>
          </table>

          <h2>{t("products.details.print_prices_stock")}</h2>
          <table className="pd-table">
            <thead>
              <tr><th>{t("products.details.cost")}</th><th>{t("products.details.price")}</th><th>{t("products.details.profit")}</th><th>{t("products.details.balance")}</th><th>{t("products.details.stock_value_cost")}</th><th>{t("products.details.stock_value_price")}</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>{currency} {cost.toFixed(2)}</td>
                <td>{currency} {price.toFixed(2)}</td>
                <td>{currency} {margin.toFixed(2)}</td>
                <td>{stockLabel}</td>
                <td>{currency} {stockValueCost.toFixed(2)}</td>
                <td>{currency} {stockValuePrice.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <footer className="pd-footer">
            <span>{storeName}</span>
            <span>{t("products.details.print_date")} {printDate}</span>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExpiryBatches({ productId, product }: { productId: string; product: any }) {
  const { data: batches = [], isLoading } = useProductBatches(productId, { includeEmpty: true, includePast: true });
  const today = new Date().toISOString().slice(0, 10);
  if (!isLoading && batches.length === 0) return null;
  return (
    <div className="rounded-md overflow-hidden" style={{ border: BORDER }}>
      <div className="px-3 py-2 text-sm font-semibold" style={{ background: HEAD_BG, borderBottom: BORDER }}>
        دُفعات تاريخ الصلاحية
      </div>
      <div className="p-3">
        {isLoading ? (
          <div className="text-sm text-gray-500">جاري التحميل...</div>
        ) : batches.length === 0 ? (
          <div className="text-sm text-gray-500">لا توجد دُفعات مسجّلة.</div>
        ) : (
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: HEAD_BG }}>
                <th className="text-start px-2 py-1" style={{ border: "1px solid #e5e7eb" }}>تاريخ الصلاحية</th>
                <th className="text-start px-2 py-1" style={{ border: "1px solid #e5e7eb" }}>المُشترَى</th>
                <th className="text-start px-2 py-1" style={{ border: "1px solid #e5e7eb" }}>المُباع</th>
                <th className="text-start px-2 py-1" style={{ border: "1px solid #e5e7eb" }}>المتبقي</th>
                <th className="text-start px-2 py-1" style={{ border: "1px solid #e5e7eb" }}>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const expired = b.expiry_date < today;
                const out = b.remaining <= 0;
                return (
                  <tr key={b.expiry_date} style={{ background: expired ? "#fee2e2" : out ? "#f3f4f6" : undefined }}>
                    <td className="px-2 py-1" style={{ border: "1px solid #e5e7eb" }}>{b.expiry_date}</td>
                    <td className="px-2 py-1" style={{ border: "1px solid #e5e7eb" }}>{formatBaseQuantity(b.purchased, product)}</td>
                    <td className="px-2 py-1" style={{ border: "1px solid #e5e7eb" }}>{formatBaseQuantity(b.sold, product)}</td>
                    <td className="px-2 py-1" style={{ border: "1px solid #e5e7eb", fontWeight: 700 }}>{formatBaseQuantity(Math.max(0, b.remaining), product)}</td>
                    <td className="px-2 py-1" style={{ border: "1px solid #e5e7eb", color: expired ? "#dc2626" : out ? "#6b7280" : "#16a34a" }}>
                      {expired ? "منتهية" : out ? "نفدت" : "متاحة"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
