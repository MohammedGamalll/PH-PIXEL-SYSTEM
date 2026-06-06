import type { BusinessSettings } from "@/contexts/SettingsContext";

export function formatCurrency(
  amount: number | string | null | undefined,
  settings: Pick<BusinessSettings, "currency_symbol" | "currency_placement">,
  decimals = 2
): string {
  const n = Number(amount || 0);
  const value = n.toFixed(decimals);
  const sym = settings.currency_symbol || "ج.م";
  return settings.currency_placement === "after"
    ? `${sym} ${value}`
    : `${value} ${sym}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(h)}:${pad(d.getMinutes())} ${ampm}`;
}
