function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PRINT_TABLE_CSS = `
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; font-family: Arial, "Segoe UI", Tahoma, sans-serif; }
  body { margin: 0; padding: 0; color: #111; direction: rtl; }
  .print-header { margin-bottom: 10px; }
  .print-header h1 { margin: 0 0 4px; font-size: 16px; }
  .print-header .meta { font-size: 11px; color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; table-layout: fixed; }
  th, td { border: 1px solid #d1d5db; padding: 4px 5px; text-align: right; word-wrap: break-word; overflow-wrap: anywhere; }
  thead { display: table-header-group !important; }
  thead th { background: #f3f4f6; font-weight: 700; }
  tbody tr:nth-child(even) { background: #fafafa; }
  tfoot td { background: #f3f4f6; font-weight: 700; }
  tr { page-break-inside: avoid; }
`;

export type PrintTableData = {
  title: string;
  headers: string[];
  rows: string[][];
  footer?: string[];
  subtitle?: string;
  landscape?: boolean;
};

/** Build and print a clean data table (all rows, plain text cells). */
export function printTableFromData({
  title,
  headers,
  rows,
  footer,
  subtitle,
  landscape = true,
}: PrintTableData) {
  const pageRule = landscape ? "@page { size: A4 landscape; margin: 10mm; }" : "@page { size: A4; margin: 12mm; }";
  const css = PRINT_TABLE_CSS.replace("@page { size: A4 landscape; margin: 10mm; }", pageRule);
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(String(c ?? ""))}</td>`).join("")}</tr>`)
    .join("");
  const foot = footer?.length
    ? `<tfoot><tr>${footer.map((c) => `<td>${escapeHtml(String(c ?? ""))}</td>`).join("")}</tr></tfoot>`
    : "";
  const meta = subtitle ? `<div class="meta">${escapeHtml(subtitle)}</div>` : "";
  const html = `
    <div class="print-header">
      <h1>${escapeHtml(title)}</h1>
      ${meta}
    </div>
    <table>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
      ${foot}
    </table>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body>${html}</body></html>`);
  doc.close();
  const win = iframe.contentWindow!;
  const cleanup = () => { setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 500); };
  win.onafterprint = cleanup;
  setTimeout(() => {
    try { win.focus(); win.print(); } catch { cleanup(); }
  }, 200);
}

// Print a single DOM element (typically a table wrapper) by cloning it into a
// hidden iframe. Bypasses global @media print rules and works on Win7.
export function printTableElement(el: HTMLElement | null, title = "table") {
  if (!el) return;
  const html = el.outerHTML;
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  ${PRINT_TABLE_CSS}
  thead button { display: inline !important; border: none !important; background: transparent !important; padding: 0 !important; font: inherit !important; color: inherit !important; cursor: default !important; }
  thead button svg { display: none !important; }
  tbody button, tfoot button, .no-print { display: none !important; }
  th[data-print-hide="1"], td[data-print-hide="1"] { display: none !important; }
</style></head><body>${html}</body></html>`);
  doc.close();
  const win = iframe.contentWindow!;
  const cleanup = () => { setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 500); };
  win.onafterprint = cleanup;
  setTimeout(() => {
    try { win.focus(); win.print(); } catch { cleanup(); }
  }, 200);
}
