// Lightweight client-side export helpers (CSV + print-to-PDF via browser).

export function exportToCSV(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  // BOM for Excel Arabic compatibility
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type InvoicePrintData = {
  invoice_number: string;
  issue_date: string;
  due_date?: string | null;
  customer_name?: string | null;
  notes?: string | null;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  company_name?: string | null;
  company_phone?: string | null;
  logo_url?: string | null;
};

export function printInvoice(data: InvoicePrintData, lang: "ar" | "en" = "ar") {
  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const T = (a: string, e: string) => (isAr ? a : e);

  const html = `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${T("فاتورة", "Invoice")} ${data.invoice_number}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: ${isAr ? "'Cairo', 'Tahoma'" : "'Inter', 'Helvetica'"}, sans-serif; color: #0f172a; margin: 0; padding: 24px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #3b5bff; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 28px; font-weight: 800; color: #3b5bff; letter-spacing: 1px; }
  .brand small { display: block; font-size: 11px; color: #64748b; font-weight: 500; letter-spacing: 0; margin-top: 4px; }
  .meta { text-align: ${isAr ? "left" : "right"}; font-size: 13px; color: #475569; }
  .meta strong { display: block; font-size: 18px; color: #0f172a; margin-bottom: 4px; }
  h2 { font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px; }
  .row { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
  .row > div { flex: 1; }
  .row p { margin: 2px 0; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
  th { background: #f1f5f9; padding: 10px; text-align: ${isAr ? "right" : "left"}; font-weight: 600; border-bottom: 2px solid #cbd5e1; }
  td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
  .totals { margin-top: 24px; ${isAr ? "margin-right: auto;" : "margin-left: auto;"} width: 280px; }
  .totals div { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
  .totals .total { border-top: 2px solid #0f172a; margin-top: 6px; padding-top: 10px; font-size: 18px; font-weight: 700; }
  .notes { margin-top: 32px; padding: 16px; background: #f8fafc; border-radius: 8px; font-size: 13px; color: #475569; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; background: #dbeafe; color: #1e40af; }
  footer { margin-top: 48px; text-align: center; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="head">
    <div style="display:flex;align-items:center;gap:12px">
      ${data.logo_url ? `<img src="${escapeHtml(data.logo_url)}" alt="logo" style="height:56px;width:56px;object-fit:contain" />` : ""}
      <div>
        <div class="brand">${T("​", "​")}<small>${T("نظام إدارة الصيدلية", "Pharmacy management system")}</small></div>
        ${data.company_name ? `<p style="margin-top:8px;font-size:13px;font-weight:600">${escapeHtml(data.company_name)}</p>` : ""}
        ${data.company_phone ? `<p style="margin:0;font-size:12px;color:#64748b">${escapeHtml(data.company_phone)}</p>` : ""}
      </div>
    </div>
    <div class="meta">
      <strong>${T("فاتورة", "INVOICE")} #${escapeHtml(data.invoice_number)}</strong>
      <p>${T("تاريخ الإصدار", "Issue date")}: ${escapeHtml(data.issue_date)}</p>
      ${data.due_date ? `<p>${T("تاريخ الاستحقاق", "Due date")}: ${escapeHtml(data.due_date)}</p>` : ""}
      <p style="margin-top:6px"><span class="badge">${escapeHtml(data.status)}</span></p>
    </div>
  </div>

  <div class="row">
    <div>
      <h2>${T("فاتورة إلى", "Bill to")}</h2>
      <p style="font-weight:600;font-size:15px">${escapeHtml(data.customer_name || T("عميل نقدي", "Walk-in customer"))}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>${T("الوصف", "Description")}</th>
        <th style="text-align:${isAr ? "left" : "right"}">${T("الإجمالي", "Amount")}</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${T("إجمالي الفاتورة", "Invoice total")}</td>
        <td style="text-align:${isAr ? "left" : "right"};font-weight:600">${data.subtotal.toFixed(2)} ${T("ج.م", "EGP")}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <div><span>${T("الفرعي", "Subtotal")}</span><span>${data.subtotal.toFixed(2)} ${T("ج.م", "EGP")}</span></div>
    <div><span>${T("الضريبة", "Tax")}</span><span>${data.tax.toFixed(2)} ${T("ج.م", "EGP")}</span></div>
    <div class="total"><span>${T("الإجمالي", "Total")}</span><span>${data.total.toFixed(2)} ${T("ج.م", "EGP")}</span></div>
  </div>

  ${data.notes ? `<div class="notes"><strong>${T("ملاحظات", "Notes")}:</strong> ${escapeHtml(data.notes)}</div>` : ""}

  <footer>${T("تم إنشاء هذه الفاتورة بواسطة", "Generated by")} ${T("​", "​")} · ${new Date().toLocaleDateString(isAr ? "ar-EG" : "en-US")}</footer>

  <script>window.onload = () => { setTimeout(() => window.print(), 200); };</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
