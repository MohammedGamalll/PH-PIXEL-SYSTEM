import { useSettings } from "@/contexts/SettingsContext";
import { useI18n } from "@/lib/i18n";

export function PrintStyles({ title: _title }: { title?: string }) {
  return (
    <style>{`
      @media print {
        @page { size: A4 portrait; margin: 12mm; }
        body { background: #fff !important; }
        .no-print, header, nav, aside, [data-sidebar], button { display: none !important; }
        .print-only { display: block !important; }
        .print-area { box-shadow: none !important; border: none !important; padding: 0 !important; background: #fff !important; }
        .print-area table { page-break-inside: avoid; }
      }
      .print-only { display: none; }
    `}</style>
  );
}

export function PrintHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { settings } = useSettings();
  const { t, lang } = useI18n();
  const locale = lang === "ar" ? "ar-EG" : "en-US";
  return (
    <div className="print-only" style={{ textAlign: "center", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid #000" }}>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>{settings.business_name}</div>
      {settings.tax_number && (
        <div style={{ fontSize: 11, marginBottom: 4 }}>{t("accounting.tax_number")}: {settings.tax_number}</div>
      )}
      <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h1>
      {subtitle && <div style={{ fontSize: 12, marginTop: 4 }}>{subtitle}</div>}
      <div style={{ fontSize: 11, marginTop: 4 }}>{new Date().toLocaleDateString(locale)}</div>
    </div>
  );
}
