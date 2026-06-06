import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/public/invoice/$token")({
  component: PublicInvoicePage,
});

type Item = {
  description: string;
  quantity: number;
  unit_name: string | null;
  unit_price: number;
  sold_price_at_time: number | null;
  discount_amount: number;
  total: number;
};

type Payload = {
  invoice_number: string;
  issue_date: string;
  type: string;
  subtotal: number;
  tax: number;
  discount: number;
  shipping_cost: number;
  total: number;
  paid_amount: number;
  payment_status: string;
  payment_method: string;
  notes: string | null;
  seller_name: string;
  items: Item[];
};

function PublicInvoicePage() {
  const { token } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-invoice", token],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_public_invoice", { p_token: token });
      if (error) throw error;
      return data as Payload | null;
    },
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center" dir="rtl">جاري التحميل…</div>;
  if (error || !data) return <div className="min-h-screen flex items-center justify-center" dir="rtl">الرابط غير صالح أو منتهي.</div>;

  const due = Math.max(0, Number(data.total || 0) - Number(data.paid_amount || 0));

  return (
    <div className="min-h-screen bg-[#e9e9e9] py-6 print:bg-white print:py-0" dir="rtl">
      <div className="print-area max-w-2xl mx-auto bg-white p-6 border border-gray-300 rounded print:border-0 print:max-w-full print:mx-0 print:rounded-none">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-lg font-bold">{data.seller_name || "—"}</h1>
            <p className="text-xs text-gray-500">فاتورة #{data.invoice_number}</p>
            <p className="text-xs text-gray-500">{data.issue_date}</p>
          </div>
          <button onClick={() => window.print()} className="h-9 px-3 inline-flex items-center gap-1 text-xs rounded border border-gray-300 print:hidden">
            <Printer className="h-3 w-3" /> طباعة
          </button>
        </div>

        <table className="w-full text-sm border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 p-2 text-right">الصنف</th>
              <th className="border border-gray-300 p-2 text-right">الكمية</th>
              <th className="border border-gray-300 p-2 text-right">السعر الأصلي</th>
              <th className="border border-gray-300 p-2 text-right">الخصم</th>
              <th className="border border-gray-300 p-2 text-right">السعر بعد الخصم</th>
              <th className="border border-gray-300 p-2 text-right">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it, i) => {
              const qty = Number(it.quantity || 0);
              const original = Number(it.unit_price || 0);
              const lineDisc = Number(it.discount_amount || 0);
              const perUnitDisc = qty > 0 ? lineDisc / qty : 0;
              const finalPrice = Number(it.sold_price_at_time ?? (original - perUnitDisc));
              return (
                <tr key={i}>
                  <td className="border border-gray-300 p-2">{it.description}</td>
                  <td className="border border-gray-300 p-2">{qty} {it.unit_name || ""}</td>
                  <td className="border border-gray-300 p-2">{original.toFixed(2)}</td>
                  <td className="border border-gray-300 p-2">{perUnitDisc.toFixed(2)}</td>
                  <td className="border border-gray-300 p-2">{finalPrice.toFixed(2)}</td>
                  <td className="border border-gray-300 p-2">{Number(it.total).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {(() => {
          const grossSubtotal = data.items.reduce(
            (s, it) => s + Number(it.unit_price || 0) * Number(it.quantity || 0), 0);
          const promoDiscountTotal = data.items.reduce((s, it) => s + Number(it.discount_amount || 0), 0);
          return (
            <div className="mt-4 text-sm space-y-1">
              <div className="flex justify-between"><span>إجمالي قبل الخصم</span><span>{grossSubtotal.toFixed(2)} ج.م</span></div>
              {promoDiscountTotal > 0 && (
                <div className="flex justify-between text-red-700"><span>إجمالي خصومات العروض</span><span>- {promoDiscountTotal.toFixed(2)} ج.م</span></div>
              )}
              <div className="flex justify-between"><span>المجموع الفرعي</span><span>{Number(data.subtotal).toFixed(2)} ج.م</span></div>
              {Number(data.discount) > 0 && <div className="flex justify-between"><span>الخصم</span><span>- {Number(data.discount).toFixed(2)} ج.م</span></div>}
              {Number(data.tax) > 0 && <div className="flex justify-between"><span>الضريبة</span><span>{Number(data.tax).toFixed(2)} ج.م</span></div>}
              {Number(data.shipping_cost) > 0 && <div className="flex justify-between"><span>الشحن</span><span>{Number(data.shipping_cost).toFixed(2)} ج.م</span></div>}
              <div className="flex justify-between font-bold border-t border-gray-300 pt-1"><span>الإجمالي</span><span>{Number(data.total).toFixed(2)} ج.م</span></div>
              <div className="flex justify-between"><span>المدفوع</span><span>{Number(data.paid_amount).toFixed(2)} ج.م</span></div>
              {due > 0 && <div className="flex justify-between text-red-700"><span>المتبقي</span><span>{due.toFixed(2)} ج.م</span></div>}
            </div>
          );
        })()}

        {data.notes && <p className="mt-4 text-xs text-gray-600 border-t border-gray-300 pt-2">{data.notes}</p>}
      </div>
    </div>
  );
}
