import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Win7Modal } from "@/components/sales/cashier/Win7Modal";
import { th, td } from "@/components/sales/cashier/win7";
import type { SessionStandaloneReturn } from "@/lib/cashier-session-data";
import { fetchStandaloneReturnItemsForReturn } from "@/lib/standalone-return-items";

function isMissingColumnError(msg: string, column: string): boolean {
  const m = (msg || "").toLowerCase();
  const col = column.toLowerCase();
  return (
    (m.includes(col) && m.includes("schema cache"))
    || (m.includes(`'${col}'`) && m.includes("could not find"))
    || (m.includes(col) && m.includes("does not exist"))
  );
}

type Props = {
  returnId: string | null;
  onClose: () => void;
  preview?: SessionStandaloneReturn | null;
};

export function StandaloneReturnDetailsModal({ returnId, onClose, preview }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["standalone-return-details", returnId],
    enabled: !!returnId,
    queryFn: async () => {
      const selectFull =
        "id, reference_no, return_type, return_date, created_at, total_amount, reason, payment_method, contact_id, contact_type, treasury_id";
      const selectBase =
        "id, reference_no, return_type, return_date, created_at, total_amount, reason, treasury_id";

      let hdr: any = null;
      let usedFull = true;
      const full = await (supabase.from("standalone_returns") as any)
        .select(selectFull)
        .eq("id", returnId!)
        .maybeSingle();
      if (full.error && isMissingColumnError(full.error.message || "", "payment_method")) {
        usedFull = false;
        const base = await (supabase.from("standalone_returns") as any)
          .select(selectBase)
          .eq("id", returnId!)
          .maybeSingle();
        if (base.error) throw base.error;
        hdr = base.data;
      } else {
        if (full.error) throw full.error;
        hdr = full.data;
      }
      if (!hdr) throw new Error("المرتجع غير موجود");

      if (!usedFull && hdr.reference_no) {
        const { data: cps } = await (supabase.from("contact_payments") as any)
          .select("ref_no, notes")
          .eq("ref_no", hdr.reference_no)
          .limit(1);
        const cp = (cps ?? [])[0];
        hdr.payment_method = cp?.notes?.includes("مرتجع حر") ? "account" : "cash";
      }

      let treasuryName: string | null = null;
      if (hdr.treasury_id) {
        const { data: tr } = await (supabase.from("treasuries") as any)
          .select("name")
          .eq("id", hdr.treasury_id)
          .maybeSingle();
        treasuryName = tr?.name ?? null;
      }

      const returnType = String(hdr.return_type || preview?.return_type || "sales");
      const items = await fetchStandaloneReturnItemsForReturn(returnId!, returnType);

      return { hdr: { ...hdr, treasury_name: treasuryName }, items };
    },
  });

  const hdr = data?.hdr ?? preview;
  const items = data?.items ?? preview?.items ?? [];
  const returnType = hdr?.return_type ?? preview?.return_type;
  const paymentMethod = (hdr as any)?.payment_method ?? preview?.payment_method;

  const typeLabel =
    returnType === "sales" ? "مرتجع مبيعات حر"
    : returnType === "purchase" ? "مرتجع مشتريات حر"
    : "مرتجع حر";

  const payLabel = paymentMethod === "account" ? "على حساب" : "نقدي";
  const refNo = hdr?.reference_no || preview?.reference_no || "—";
  const total = Number(hdr?.total_amount ?? preview?.total_amount ?? 0);
  const dateStr = hdr?.return_date || hdr?.created_at || preview?.return_date || preview?.created_at;
  const reason = hdr?.reason || preview?.reason;

  return (
    <Win7Modal
      title={`تفاصيل المرتجع الحر — ${refNo}`}
      onClose={onClose}
      width={640}
    >
      {isLoading && !preview ? (
        <div style={{ padding: 20, textAlign: "center" }}>جاري التحميل…</div>
      ) : (
        <div dir="rtl" style={{ padding: 8, fontSize: 13 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div><b>النوع:</b> {typeLabel}</div>
            <div><b>السداد:</b> {payLabel}</div>
            <div><b>التاريخ:</b> {dateStr ? new Date(String(dateStr)).toLocaleString("ar-EG") : "—"}</div>
            <div>
              <b>الإجمالي:</b>{" "}
              <span style={{ color: returnType === "purchase" ? "#15803d" : "#b45309", fontWeight: 700 }}>
                {returnType === "purchase" ? "+" : "-"}{total.toFixed(2)} ج.م
              </span>
            </div>
            {(hdr as any)?.treasury_name && (
              <div><b>الخزينة:</b> {(hdr as any).treasury_name}</div>
            )}
            {reason && (
              <div style={{ gridColumn: "1 / -1" }}><b>السبب:</b> {reason}</div>
            )}
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ background: "#d4d4d4" }}>
              <tr>
                <th style={th}>#</th>
                <th style={th}>الصنف</th>
                <th style={th}>الكمية</th>
                <th style={th}>السعر</th>
                <th style={th}>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {(items as any[]).map((it, i) => (
                <tr key={i} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>{it.name || "—"}</td>
                  <td style={td}>{it.quantityLabel || "—"}</td>
                  <td style={td}>{Number(it.unitPriceMain || 0).toFixed(2)}</td>
                  <td style={td}>{Number(it.total || 0).toFixed(2)}</td>
                </tr>
              ))}
              {(items as any[]).length === 0 && (
                <tr><td colSpan={5} style={{ padding: 16, textAlign: "center", color: "#6b7280" }}>لا توجد أصناف</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Win7Modal>
  );
}
