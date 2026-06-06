import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { usePaymentAccounts } from "@/hooks/use-accounts";
import { useI18n } from "@/lib/i18n";

type Props = {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  autoSelectFirst?: boolean;
  /** show legacy raw value (e.g. "cash"/"bank") as a disabled option if not in the list */
  allowLegacy?: boolean;
  disabled?: boolean;
};

export function AccountSelect({
  value,
  onChange,
  className,
  style,
  autoSelectFirst = true,
  allowLegacy = true,
  disabled,
}: Props) {
  const { t } = useI18n();
  const { data: accounts = [], isLoading } = usePaymentAccounts();

  const isKnown = accounts.some((a) => a.id === value);
  const showLegacy = allowLegacy && !!value && !isKnown && !isLoading;

  useEffect(() => {
    if (autoSelectFirst && !value && accounts.length > 0) {
      const def = accounts.find((a) => (a as any).is_default_cash) ?? accounts[0];
      onChange(def.id);
    }
  }, [autoSelectFirst, value, accounts, onChange]);

  if (!isLoading && accounts.length === 0 && !showLegacy) {
    return (
      <div className={className} style={style}>
        <Link
          to="/accounting/accounts"
          className="text-xs underline"
          style={{ color: "#b91c1c", lineHeight: "2.25rem" }}
        >
          {t("common.no_accounts_add_one")}
        </Link>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || isLoading}
      className={className}
      style={style}
    >
      {!value && <option value="">{t("common.select_account")}</option>}
      {showLegacy && (
        <option value={value}>{value}</option>
      )}
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.account_number} — {a.name}{(a as any).is_default_cash ? " ⭐" : ""}
        </option>
      ))}
    </select>
  );
}

