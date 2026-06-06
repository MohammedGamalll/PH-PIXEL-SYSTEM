import { createElement, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { useAccess } from "@/lib/access";

export type ActionKey = "view" | "create" | "edit" | "delete" | "print";
export type SpecialKey = "custom_discount" | "change_price" | "sell_on_credit" | "end_session";

/**
 * Central permission gate. Admin (owner) always bypasses. Otherwise the
 * raw V2 permissions JSON is read directly: `rawPermissions[moduleKey][action]`.
 * Missing modules and missing actions are treated as "no".
 */
export function useCan() {
  const { isAdmin, rawPermissions } = useAccess();
  const perms = (rawPermissions ?? {}) as Record<string, Record<string, boolean> | undefined>;

  const can = (moduleKey: string, action: ActionKey = "view"): boolean => {
    if (isAdmin) return true;
    return !!perms[moduleKey]?.[action];
  };

  const canSpecial = (moduleKey: string, key: SpecialKey): boolean => {
    if (isAdmin) return true;
    return !!(perms[moduleKey] as any)?.[key];
  };

  return { isAdmin, can, canSpecial };
}

type CanProps = {
  module: string;
  action?: ActionKey;
  /** "hide" (default) removes the node entirely; "disable" disables and adds a tooltip. */
  mode?: "hide" | "disable";
  /** Tooltip text shown when `mode="disable"` and access is denied. */
  deniedTitle?: string;
  children: ReactNode;
  /** Optional fallback rendered when denied (overrides hide). */
  fallback?: ReactNode;
};

const DEFAULT_DENIED_TITLE = "لا تملك صلاحية لهذا الإجراء";

/**
 * Declarative permission wrapper. Use for buttons / triggers in toolbars.
 *
 *   <Can module="sales_invoices" action="create"><Button>...</Button></Can>
 *   <Can module="pos" action="delete" mode="disable"><Button>...</Button></Can>
 */
export function Can({
  module,
  action = "view",
  mode = "hide",
  deniedTitle = DEFAULT_DENIED_TITLE,
  fallback,
  children,
}: CanProps) {
  const { can } = useCan();
  const allowed = can(module, action);
  if (allowed) return children as ReactElement;
  if (mode === "hide") return (fallback ?? null) as ReactElement;
  // disable mode: clone single child and add disabled + title
  if (isValidElement(children)) {
    const props = children.props as Record<string, unknown>;
    return cloneElement(children as ReactElement<any>, {
      disabled: true,
      title: deniedTitle,
      "aria-disabled": true,
      onClick: undefined,
      style: { ...(props.style as object | undefined), cursor: "not-allowed", opacity: 0.5 },
    });
  }
  return createElement("span", { title: deniedTitle, style: { opacity: 0.5 } }, children);
}
