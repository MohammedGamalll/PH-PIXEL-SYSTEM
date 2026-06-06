import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { BackButton } from "@/components/shared/BackButton";

export function PageHeader({
  title,
  subtitle,
  actions,
  titleExtra,
  showBack = true,
  backTo,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  titleExtra?: ReactNode;
  /** Show a back button to the left of the title (default: true). Pass false on root pages. */
  showBack?: boolean;
  /** Optional fallback route when there's no history entry. */
  backTo?: string;
}) {
  const { dir } = useI18n();
  return (
    <div
      dir={dir}
      className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 w-full mb-4 sm:mb-6 pb-3 sm:pb-4 border-b"
      style={{ borderColor: "#e5e7eb" }}
    >
      <div className="flex-1 text-start min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {showBack && <BackButton fallbackTo={backTo} />}
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold truncate" style={{ color: "#111827" }}>
            {title}
          </h1>
          {titleExtra}
        </div>
        {subtitle && (
          <p className="text-xs sm:text-sm mt-1" style={{ color: "#6b7280" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap sm:justify-end sm:shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

