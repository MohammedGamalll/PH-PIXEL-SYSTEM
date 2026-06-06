import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/contexts/SettingsContext";
import logoUrl from "@/assets/pharmacy-logo.png";

export function Logo({ className = "", useSettingsColor = false, branchName }: { className?: string; useSettingsColor?: boolean; branchName?: string | null }) {
  const { lang } = useI18n();
  const { settings } = useSettings();
  const accent = useSettingsColor
    ? (settings.sidebar_business_name_color || settings.sidebar_text || "#0ea5e9")
    : undefined;
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src={logoUrl}
        alt={lang === "ar" ? "​" : "​"}
        className="h-10 w-10 object-contain"
      />
      <div className="leading-tight">
        <span
          className="block font-extrabold text-base tracking-tight whitespace-nowrap"
          style={useSettingsColor ? { color: accent } : undefined}
        >
          {lang === "ar" ? (
            <>
              صيدلية{" "}
              <span style={useSettingsColor ? { color: accent } : undefined} className={useSettingsColor ? "" : "text-sky-500"}>
                د. أحمد
              </span>
            </>
          ) : (
            <>
              Dr. Ahmed{" "}
              <span style={useSettingsColor ? { color: accent } : undefined} className={useSettingsColor ? "" : "text-sky-500"}>
                Pharmacy
              </span>
            </>
          )}
        </span>
        {branchName && (
          <span className="block text-[11px] font-semibold opacity-90 whitespace-nowrap">
            {lang === "ar" ? `الفرع: ${branchName}` : `Branch: ${branchName}`}
          </span>
        )}
      </div>
    </div>
  );
}
