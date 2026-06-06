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
  doc.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; font-family: Arial, "Segoe UI", Tahoma, sans-serif; }
  body { margin: 0; padding: 0; color: #111; direction: rtl; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: right; }
  thead th { background: #f3f4f6; font-weight: 700; }
  tfoot td { background: #f3f4f6; font-weight: 700; }
  button, .no-print { display: none !important; }
</style></head><body>${html}</body></html>`);
  doc.close();
  const win = iframe.contentWindow!;
  const cleanup = () => { setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 500); };
  win.onafterprint = cleanup;
  setTimeout(() => {
    try { win.focus(); win.print(); } catch { cleanup(); }
  }, 200);
}
