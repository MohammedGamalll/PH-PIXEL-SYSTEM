import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/contexts/SettingsContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Win7Modal } from "./Win7Modal";
import { inputStyle, modalBtn } from "./win7";
import {
  fetchSessionContactPayments,
  fetchSessionStandaloneReturns,
  sumStandaloneReturns,
  type SessionStandaloneReturn,
} from "@/lib/cashier-session-data";

type Props = {
  sessionId: string;
  openingCash: number;
  openedAt: string;
  onClose: () => void;
  onClosed: () => void;
};

type Stat = {
  cashSales: number;
  cardSales: number;
  creditSales: number;
  multiSales: number;
  bankSales: number;
  invoiceCount: number;
  expenses: number;
  customerPayments: number;
  supplierPayments: number;
  cashRefunds: number;
  cardRefunds: number;
  bankRefunds: number;
  creditRefunds: number;
  returnCount: number;
  stdSalesRefund: number;
  stdPurchaseDeposit: number;
  stdReturns: SessionStandaloneReturn[];
  items: { description: string; sku: string | null; brand: string | null; quantity: number; total: number }[];
  returnedItems: { description: string; sku: string | null; brand: string | null; quantity: number; total: number }[];
};

export function CloseSessionModal({ sessionId, openingCash, openedAt, onClose, onClosed }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const qc = useQueryClient();
  const [stat, setStat] = useState<Stat | null>(null);
  const [actualCash, setActualCash] = useState<string>("");
  const [actualCard, setActualCard] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
      const { data: invs } = await (supabase.from("invoices") as any)
        .select("id, total, payment_method, type")
        .eq("session_id", sessionId)
        .in("type", ["sale", "sale_return"]);
      const all = (invs ?? []) as any[];
      const sales = all.filter((x) => x.type === "sale");
      const returns = all.filter((x) => x.type === "sale_return");
      const sumBy = (m: string) =>
        sales.filter((x) => x.payment_method === m).reduce((a, b) => a + Number(b.total || 0), 0);
      const refundBy = (m: string) =>
        returns.filter((x) => x.payment_method === m).reduce((a, b) => a + Math.abs(Number(b.total || 0)), 0);

      const { data: exps } = await (supabase.from("expenses") as any)
        .select("amount, notes")
        .ilike("notes", `%session:${sessionId}%`);
      const expSum = (exps ?? []).reduce((a: number, b: any) => a + Number(b.amount || 0), 0);

      const stdReturns = await fetchSessionStandaloneReturns(sessionId);
      const { stdSalesRefund, stdPurchaseDeposit } = sumStandaloneReturns(stdReturns);
      const { customerPayments: custPay, supplierPayments: supPay } = await fetchSessionContactPayments(sessionId, stdReturns);

      // Aggregate sold + returned items
      const saleIds = sales.map((x) => x.id);
      const returnIds = returns.map((x) => x.id);
      const allIds = [...saleIds, ...returnIds];
      let items: Stat["items"] = [];
      let returnedItems: Stat["returnedItems"] = [];
      if (allIds.length) {
        const { data: rows } = await (supabase.from("invoice_items") as any)
          .select("invoice_id, description, quantity, total, product_id")
          .in("invoice_id", allIds);
        const productIds = Array.from(new Set((rows ?? []).map((r: any) => r.product_id).filter(Boolean)));
        let prodMap: Record<string, { sku: string | null; brand: string | null }> = {};
        if (productIds.length) {
          const { data: prods } = await (supabase.from("products") as any)
            .select("id, sku, brand_id, brands(name)")
            .in("id", productIds);
          for (const p of (prods ?? []) as any[]) {
            prodMap[p.id] = { sku: p.sku ?? null, brand: p.brands?.name ?? null };
          }
        }
        const saleSet = new Set(saleIds);
        const aggSale: Record<string, Stat["items"][number]> = {};
        const aggRet: Record<string, Stat["items"][number]> = {};
        for (const r of (rows ?? []) as any[]) {
          const k = r.product_id || r.description;
          const meta = r.product_id ? prodMap[r.product_id] : null;
          const isSale = saleSet.has(r.invoice_id);
          const target = isSale ? aggSale : aggRet;
          if (!target[k]) target[k] = { description: r.description, sku: meta?.sku ?? null, brand: meta?.brand ?? null, quantity: 0, total: 0 };
          target[k].quantity += isSale ? Number(r.quantity || 0) : Math.abs(Number(r.quantity || 0));
          target[k].total += isSale ? Number(r.total || 0) : Math.abs(Number(r.total || 0));
        }
        items = Object.values(aggSale);
        returnedItems = Object.values(aggRet);
      }

      setStat({
        cashSales: sumBy("cash"),
        cardSales: sumBy("card"),
        creditSales: sumBy("credit"),
        multiSales: sumBy("multi"),
        bankSales: sumBy("bank") + sumBy("transfer"),
        invoiceCount: sales.length,
        expenses: expSum,
        customerPayments: custPay,
        supplierPayments: supPay,
        cashRefunds: refundBy("cash"),
        cardRefunds: refundBy("card"),
        bankRefunds: refundBy("bank") + refundBy("transfer"),
        creditRefunds: refundBy("credit"),
        returnCount: returns.length,
        stdSalesRefund,
        stdPurchaseDeposit,
        stdReturns,
        items,
        returnedItems,
      });
      } catch (e) {
        console.error("CloseSessionModal load:", e);
        if (!cancelled) {
          setStat({
            cashSales: 0, cardSales: 0, creditSales: 0, multiSales: 0, bankSales: 0,
            invoiceCount: 0, expenses: 0, customerPayments: 0, supplierPayments: 0,
            cashRefunds: 0, cardRefunds: 0, bankRefunds: 0, creditRefunds: 0,
            returnCount: 0, stdSalesRefund: 0, stdPurchaseDeposit: 0, stdReturns: [],
            items: [], returnedItems: [],
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  const expectedDrawer = useMemo(
    () =>
      openingCash +
      (stat?.cashSales ?? 0) +
      (stat?.customerPayments ?? 0) +
      (stat?.stdPurchaseDeposit ?? 0) -
      (stat?.expenses ?? 0) -
      (stat?.supplierPayments ?? 0) -
      (stat?.cashRefunds ?? 0) -
      (stat?.stdSalesRefund ?? 0),
    [openingCash, stat],
  );
  const totalShift = (stat?.cashSales ?? 0) + (stat?.cardSales ?? 0) + (stat?.creditSales ?? 0) + (stat?.multiSales ?? 0) + (stat?.bankSales ?? 0);
  const totalRefunds = (stat?.cashRefunds ?? 0) + (stat?.cardRefunds ?? 0) + (stat?.bankRefunds ?? 0) + (stat?.creditRefunds ?? 0);
  const netSales = totalShift - totalRefunds;
  const itemsTotal = (stat?.items ?? []).reduce((a, b) => a + b.total, 0);
  const itemsQty = (stat?.items ?? []).reduce((a, b) => a + b.quantity, 0);
  const returnedTotal = (stat?.returnedItems ?? []).reduce((a, b) => a + b.total, 0);
  const returnedQty = (stat?.returnedItems ?? []).reduce((a, b) => a + b.quantity, 0);

  const brandAgg = useMemo(() => {
    const m: Record<string, { qty: number; total: number }> = {};
    for (const it of stat?.items ?? []) {
      const k = it.brand || "—";
      if (!m[k]) m[k] = { qty: 0, total: 0 };
      m[k].qty += it.quantity;
      m[k].total += it.total;
    }
    return Object.entries(m).map(([brand, v]) => ({ brand, ...v }));
  }, [stat]);

  const fmt = (n: number) => n.toFixed(2);

  const handleSave = async () => {
    if (!actualCash) {
      toast.error("ادخل مجموع النقد الفعلي");
      return;
    }
    setSaving(true);
    const cashNum = Number(actualCash) || 0;
    const composedNotes = [
      notes.trim(),
      `النقد المتوقع: ${fmt(expectedDrawer)} | الفعلي: ${fmt(cashNum)} | الفرق: ${fmt(cashNum - expectedDrawer)}`,
    ].filter(Boolean).join("\n");
    const { error } = await (supabase.from("cashier_sessions" as any) as any)
      .update({
        status: "closed",
        closing_cash: cashNum,
        closed_at: new Date().toISOString(),
        notes: composedNotes,
      })
      .eq("id", sessionId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["cashier_sessions"] });
    toast.success("تم إقفال الجلسة");
    onClosed();
    navigate({ to: "/sales/cashier-log" });
  };

  const openedDate = new Date(openedAt);
  const nowDate = new Date();
  const dateRange = `( ${formatDateTime(openedDate)} - ${formatDateTime(nowDate)} )`;

  const displayName = (user?.user_metadata as any)?.full_name || user?.email || "—";

  return (
    <Win7Modal title={`الجلسة الحالية ${dateRange}`} onClose={onClose} width={780}>
      {!stat ? (
        <div style={{ padding: 20, textAlign: "center" }}>جاري التحميل…</div>
      ) : (
        <div dir="rtl" style={{ display: "grid", gap: 12, fontSize: 13, padding: 4 }}>
          {/* Payment methods table */}
          <table style={tbl}>
            <thead>
              <tr>
                <th style={thStyle}>طريقة الدفع</th>
                <th style={thStyle}>المبيعات</th>
                <th style={thStyle}>مصروف</th>
              </tr>
            </thead>
            <tbody>
              <Row label="النقدية في الدرج:" sales={fmt(openingCash)} exp="--" />
              <Row label="الدفع نقدا:" sales={fmt(stat.cashSales)} exp={fmt(stat.expenses)} />
              <Row label="الدفع بالبطاقة:" sales={fmt(stat.cardSales)} exp="0.00" />
              <Row label="تحويل بنكي:" sales={fmt(stat.bankSales)} exp="0.00" />
              <Row label="بيع آجل:" sales={fmt(stat.creditSales)} exp="0.00" />
              <Row label="دفع متعدد:" sales={fmt(stat.multiSales)} exp="0.00" />
              {totalRefunds > 0 && (
                <>
                  <tr style={{ background: "#fde2e2" }}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "#b91c1c" }}>مرتجعات نقدية:</td>
                    <td style={{ ...tdStyle, color: "#b91c1c" }}>-{fmt(stat.cashRefunds)} ج.م</td>
                    <td style={tdStyle}>--</td>
                  </tr>
                  <tr style={{ background: "#fde2e2" }}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "#b91c1c" }}>مرتجعات بطاقة:</td>
                    <td style={{ ...tdStyle, color: "#b91c1c" }}>-{fmt(stat.cardRefunds)} ج.م</td>
                    <td style={tdStyle}>--</td>
                  </tr>
                  <tr style={{ background: "#fde2e2" }}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "#b91c1c" }}>مرتجعات تحويل بنكي:</td>
                    <td style={{ ...tdStyle, color: "#b91c1c" }}>-{fmt(stat.bankRefunds)} ج.م</td>
                    <td style={tdStyle}>--</td>
                  </tr>
                  <tr style={{ background: "#fde2e2" }}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "#b91c1c" }}>مرتجعات آجلة:</td>
                    <td style={{ ...tdStyle, color: "#b91c1c" }}>-{fmt(stat.creditRefunds)} ج.م</td>
                    <td style={tdStyle}>--</td>
                  </tr>
                </>
              )}
            </tbody>
            <tfoot>
              <RowHL bg="#bee3f8" label="اجمالي المبيعات:" value={fmt(totalShift)} />
              {totalRefunds > 0 && (
                <RowHL bg="#fde2e2" label="اجمالي المرتجعات:" value={`-${fmt(totalRefunds)}`} />
              )}
              {totalRefunds > 0 && (
                <RowHL bg="#bee3f8" label="صافي المبيعات بعد المرتجعات:" value={fmt(netSales)} />
              )}
              <RowHL bg="#d1fae5" label="المبلغ الإجمالي (متوقع في الدرج):" value={fmt(expectedDrawer)} />
              <RowHL bg="#d1fae5" label="المبيعات الآجلة:" value={fmt(stat.creditSales)} />
              <RowHL bg="#fde2e2" label="مجموع المصاريف:" value={fmt(stat.expenses)} />
            </tfoot>
          </table>

          {/* Items details */}
          <Section title="تفاصيل الاصناف المباعة">
            <table style={tbl}>
              <thead>
                <tr>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>الباركود SKU</th>
                  <th style={thStyle}>صنف</th>
                  <th style={thStyle}>الكمية</th>
                  <th style={thStyle}>المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {stat.items.length === 0 ? (
                  <tr><td colSpan={5} style={{ ...tdStyle, color: "#6b7280" }}>لا يوجد</td></tr>
                ) : stat.items.map((it, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{i + 1}.</td>
                    <td style={tdStyle}>{it.sku || "—"}</td>
                    <td style={tdStyle}>{it.description}</td>
                    <td style={tdStyle}>{it.quantity.toFixed(2)}</td>
                    <td style={tdStyle}>{fmt(it.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#d1fae5", fontWeight: 700 }}>
                  <td style={tdStyle}>#</td>
                  <td colSpan={2} style={tdStyle}>المبلغ الإجمالي: {fmt(itemsTotal)}</td>
                  <td style={tdStyle}>{itemsQty.toFixed(0)}</td>
                  <td style={tdStyle}>{fmt(itemsTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </Section>

          {/* Returned items details */}
          {stat.returnedItems.length > 0 && (
            <Section title="تفاصيل الاصناف المرتجعة">
              <table style={tbl}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>الباركود SKU</th>
                    <th style={thStyle}>صنف</th>
                    <th style={thStyle}>الكمية</th>
                    <th style={thStyle}>المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {stat.returnedItems.map((it, i) => (
                    <tr key={i} style={{ background: "#fef2f2" }}>
                      <td style={tdStyle}>{i + 1}.</td>
                      <td style={tdStyle}>{it.sku || "—"}</td>
                      <td style={tdStyle}>{it.description}</td>
                      <td style={{ ...tdStyle, color: "#b91c1c" }}>{it.quantity.toFixed(2)}</td>
                      <td style={{ ...tdStyle, color: "#b91c1c" }}>{fmt(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#fde2e2", fontWeight: 700 }}>
                    <td style={tdStyle}>#</td>
                    <td colSpan={2} style={tdStyle}>إجمالي المرتجعات ({stat.returnCount} فاتورة): {fmt(returnedTotal)}</td>
                    <td style={tdStyle}>{returnedQty.toFixed(0)}</td>
                    <td style={{ ...tdStyle, color: "#b91c1c" }}>-{fmt(returnedTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </Section>
          )}


          {/* Brand details */}
          <Section title="تفاصيل الاصناف المباعة (حسب الماركة)">
            <table style={tbl}>
              <thead>
                <tr>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>ماركات الاصناف</th>
                  <th style={thStyle}>الكمية</th>
                  <th style={thStyle}>المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {brandAgg.length === 0 ? (
                  <tr><td colSpan={4} style={{ ...tdStyle, color: "#6b7280" }}>لا يوجد</td></tr>
                ) : brandAgg.map((b, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{i + 1}.</td>
                    <td style={tdStyle}>{b.brand}</td>
                    <td style={tdStyle}>{b.qty.toFixed(2)}</td>
                    <td style={tdStyle}>{fmt(b.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#d1fae5", fontWeight: 700 }}>
                  <td style={tdStyle}>#</td>
                  <td style={tdStyle}>المبلغ الإجمالي: {fmt(itemsTotal)}</td>
                  <td style={tdStyle}>{itemsQty.toFixed(0)}</td>
                  <td style={tdStyle}>{fmt(itemsTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </Section>

          {stat.stdReturns.length > 0 && (
            <Section title={`\u0645\u0631\u062A\u062C\u0639\u0627\u062A \u062D\u0631\u0629 (${stat.stdReturns.length})`}>
              <table style={tbl}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>{"\u0627\u0644\u0645\u0631\u062C\u0639"}</th>
                    <th style={thStyle}>{"\u0627\u0644\u0646\u0648\u0639"}</th>
                    <th style={thStyle}>{"\u0627\u0644\u062A\u0627\u0631\u064A\u062E"}</th>
                    <th style={thStyle}>{"\u0627\u0644\u0645\u0628\u0644\u063A"}</th>
                    <th style={thStyle}>{"\u0627\u0644\u0633\u0628\u0628"}</th>
                  </tr>
                </thead>
                <tbody>
                  {stat.stdReturns.map((r, i) => (
                    <tr key={r.id} style={{ background: "#fffbeb" }}>
                      <td style={tdStyle}>{i + 1}</td>
                      <td style={tdStyle}>{r.reference_no || "\u2014"}</td>
                      <td style={tdStyle}>{r.return_type === "sales" ? "\u0645\u0628\u064A\u0639\u0627\u062A" : "\u0645\u0634\u062A\u0631\u064A\u0627\u062A"}</td>
                      <td style={tdStyle}>{r.return_date || r.created_at ? new Date(r.return_date || r.created_at!).toLocaleString("ar-EG") : "\u2014"}</td>
                      <td style={{ ...tdStyle, color: "#b45309", fontWeight: 700 }}>-{fmt(r.total_amount)} {"\u062C.\u0645"}</td>
                      <td style={tdStyle}>{r.reason || "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Contact payments */}
          <Section title="دفعات الزبائن والموردين">
            <table style={tbl}>
              <tbody>
                <tr style={{ background: "#d1fae5" }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>اجمالي دفعات الزبائن:</td>
                  <td style={tdStyle}>{fmt(stat.customerPayments)} ج.م</td>
                </tr>
                <tr style={{ background: "#fde2e2" }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>اجمالي دفعات الموردين:</td>
                  <td style={tdStyle}>{fmt(stat.supplierPayments)} ج.م</td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Expected cash breakdown */}
          <Section title="المتوقع في الدرج — تفاصيل الحساب">
            <table style={tbl}>
              <tbody>
                <CalcRow label="رصيد افتتاحي" value={fmt(openingCash)} sign="+" />
                <CalcRow label="مبيعات نقدية" value={fmt(stat.cashSales)} sign="+" />
                <CalcRow label="تحصيلات عملاء" value={fmt(stat.customerPayments)} sign="+" />
                {stat.stdPurchaseDeposit > 0 && <CalcRow label="مقبوضات مرتجع مشتريات (حر)" value={fmt(stat.stdPurchaseDeposit)} sign="+" />}
                <CalcRow label="مصاريف نقدية" value={fmt(stat.expenses)} sign="-" />
                <CalcRow label="مدفوعات موردين" value={fmt(stat.supplierPayments)} sign="-" />
                {stat.cashRefunds > 0 && (
                  <CalcRow label="مرتجعات نقدية (فواتير بيع)" value={fmt(stat.cashRefunds)} sign="-" />
                )}
                {stat.stdSalesRefund > 0 && <CalcRow label="مدفوعات مرتجع مبيعات (حر)" value={fmt(stat.stdSalesRefund)} sign="-" />}
                <tr style={{ background: "#d1fae5", fontWeight: 800, fontSize: 14 }}>
                  <td style={tdStyle}>= المتوقع في الدرج</td>
                  <td style={{ ...tdStyle, textAlign: "left" }}>{fmt(expectedDrawer)} ج.م</td>
                </tr>
              </tbody>
            </table>
          </Section>


          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={lbl}>مجموع النقد الفعلي: *</label>
              <input
                type="number"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                autoFocus
                placeholder={fmt(expectedDrawer)}
                style={{ ...inputStyle, width: "100%", padding: 6, fontWeight: 700 }}
              />
              {actualCash !== "" && (
                <div style={{ fontSize: 11, color: Math.abs(Number(actualCash) - expectedDrawer) < 0.005 ? "#16a34a" : (Number(actualCash) > expectedDrawer ? "#2563eb" : "#dc2626"), marginTop: 3 }}>
                  المتوقع {fmt(expectedDrawer)} • الفرق {fmt(Number(actualCash) - expectedDrawer)}
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>مجموع الدفع عن طريق البطاقة:</label>
              <input
                type="number"
                value={actualCard}
                onChange={(e) => setActualCard(e.target.value)}
                placeholder={fmt(stat.cardSales)}
                style={{ ...inputStyle, width: "100%", padding: 6, fontWeight: 700 }}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={lbl}>ملاحظة ختامية:</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="ملاحظة ختامية"
              style={{ ...inputStyle, width: "100%", resize: "vertical" }}
            />
          </div>

          {/* Footer info */}
          <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: 8, fontSize: 12, color: "#374151", lineHeight: 1.7 }}>
            <div>المستخدم: <b>{displayName}</b></div>
            {user?.email && <div>الايميل: <b dir="ltr" style={{ display: "inline-block" }}>{user.email}</b></div>}
            <div>عنوان المشروع: <b>{settings.business_name}</b></div>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-start", paddingTop: 4, borderTop: "1px solid #e5e7eb" }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                ...modalBtn,
                background: "linear-gradient(180deg, #6366f1, #4338ca)",
                color: "#fff",
                fontWeight: 700,
                padding: "8px 22px",
                border: "1px solid #3730a3",
              }}
            >
              {saving ? "..." : "إنهاء الجلسة"}
            </button>
            <button onClick={onClose} style={{ ...modalBtn, background: "#1f2937", color: "#fff", border: "1px solid #111827" }} disabled={saving}>
              إلغاء
            </button>
          </div>
        </div>
      )}
    </Win7Modal>
  );
}

function formatDateTime(d: Date) {
  const day = d.getDate();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthLong = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const suffix = (n: number) => {
    if (n >= 11 && n <= 13) return "th";
    const last = n % 10;
    return last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th";
  };
  const hh = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = ((hh + 11) % 12) + 1;
  void months;
  return `${day}${suffix(day)} ${monthLong[d.getMonth()]}, ${d.getFullYear()} ${String(h12).padStart(2, "0")}:${mm} ${ampm}`;
}

const tbl: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  border: "1px solid #cbd5e1",
};
const thStyle: React.CSSProperties = {
  padding: "6px 8px",
  background: "#f3f4f6",
  borderBottom: "1px solid #cbd5e1",
  textAlign: "right",
  fontWeight: 700,
  fontSize: 12,
};
const tdStyle: React.CSSProperties = {
  padding: "5px 8px",
  borderBottom: "1px solid #e5e7eb",
  textAlign: "right",
  fontSize: 12,
};
const lbl: React.CSSProperties = { display: "block", fontSize: 12, marginBottom: 4, fontWeight: 600 };

function Row({ label, sales, exp }: { label: string; sales: string; exp: string }) {
  return (
    <tr>
      <td style={{ ...tdStyle, fontWeight: 600 }}>{label}</td>
      <td style={tdStyle}>{sales} ج.م</td>
      <td style={tdStyle}>{exp === "--" ? "--" : `${exp} ج.م`}</td>
    </tr>
  );
}
function RowHL({ label, value, bg }: { label: string; value: string; bg: string }) {
  return (
    <tr style={{ background: bg, fontWeight: 700 }}>
      <td style={tdStyle}>{label}</td>
      <td colSpan={2} style={tdStyle}>{value} ج.م</td>
    </tr>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 style={{ fontSize: 14, fontWeight: 700, margin: "4px 0 6px", color: "#1f2937" }}>{title}</h4>
      {children}
    </div>
  );
}
function CalcRow({ label, value, sign }: { label: string; value: string; sign: "+" | "-" }) {
  const color = sign === "+" ? "#16a34a" : "#dc2626";
  return (
    <tr>
      <td style={{ ...tdStyle, fontWeight: 600 }}>
        <span style={{ color, fontWeight: 800, marginInlineEnd: 6 }}>{sign}</span>
        {label}
      </td>
      <td style={{ ...tdStyle, textAlign: "left" }}>{value} ج.م</td>
    </tr>
  );
}
