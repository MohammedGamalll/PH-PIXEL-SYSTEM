// Per-employee permissions matrix definitions.
// Stored as JSONB in employees.permissions (flexible — coexists with legacy keys).

export const STANDARD_ACTIONS = ["view", "create", "edit", "delete", "print"] as const;
export type ActionKey = (typeof STANDARD_ACTIONS)[number];

export type ModuleActions = Record<ActionKey, boolean>;

export type ModulePermissions = ModuleActions & {
  custom_discount?: boolean;
  change_price?: boolean;
  sell_on_credit?: boolean;
  end_session?: boolean;
};

export type EmployeePermissionsV2 = {
  [moduleKey: string]: Partial<ModulePermissions> | undefined;
};

export type SpecialPermissionDef = {
  key: "custom_discount" | "change_price" | "sell_on_credit" | "end_session";
  label: string;
};

export type ModuleDef = {
  key: string;
  name_ar: string;
  /** actions disabled in UI (rendered as "—"). Defaults to none. */
  disabledActions?: ActionKey[];
  /** special POS-style permissions shown in an expandable sub-row. */
  special?: SpecialPermissionDef[];
};

export type GroupDef = {
  key: string;
  name_ar: string;
  /** Tailwind class for group sub-header background. */
  headerClass: string;
  modules: ModuleDef[];
};

// Invoices/returns are immutable for accounting integrity — no delete allowed.
const NO_DELETE: ActionKey[] = ["delete"];

export const PERMISSION_GROUPS: GroupDef[] = [
  {
    key: "sales",
    name_ar: "المبيعات",
    headerClass:
      "bg-[var(--group-sales-bg)] text-[var(--group-sales-fg)] border-[var(--group-sales-border)]",
    modules: [
      {
        key: "pos",
        name_ar: "نقطة البيع (POS)",
        disabledActions: NO_DELETE,
        special: [
          { key: "custom_discount", label: "السماح بخصم مخصص" },
          { key: "change_price", label: "تغيير السعر" },
          { key: "sell_on_credit", label: "البيع الآجل" },
          { key: "end_session", label: "إنهاء جلسة الكاشير" },
        ],
      },
      { key: "sales_invoices", name_ar: "فواتير المبيعات", disabledActions: NO_DELETE },
      { key: "sales_returns", name_ar: "مرتجعات المبيعات", disabledActions: NO_DELETE },
      { key: "customers", name_ar: "العملاء" },
    ],
  },
  {
    key: "purchases",
    name_ar: "المشتريات",
    headerClass:
      "bg-[var(--group-purchases-bg)] text-[var(--group-purchases-fg)] border-[var(--group-purchases-border)]",
    modules: [
      { key: "purchase_invoices", name_ar: "فواتير الشراء", disabledActions: NO_DELETE },
      { key: "purchase_returns", name_ar: "مرتجعات الشراء", disabledActions: NO_DELETE },
      { key: "suppliers", name_ar: "الموردين" },
    ],
  },
  {
    key: "inventory",
    name_ar: "المخازن",
    headerClass:
      "bg-[var(--group-inventory-bg)] text-[var(--group-inventory-fg)] border-[var(--group-inventory-border)]",
    modules: [
      { key: "products", name_ar: "الأصناف والمجموعات" },
      { key: "warehouses", name_ar: "المستودعات" },
      { key: "stock_transfers", name_ar: "التحويل المخزوني" },
      { key: "inventory_count", name_ar: "الجرد وتسوية المخزون" },
    ],
  },
  {
    key: "accounting",
    name_ar: "الحسابات والمالية",
    headerClass:
      "bg-[var(--group-accounting-bg)] text-[var(--group-accounting-fg)] border-[var(--group-accounting-border)]",
    modules: [
      { key: "treasury", name_ar: "الخزينة والنقدية" },
      { key: "expenses", name_ar: "المصروفات" },
      { key: "ledger", name_ar: "دفتر الأستاذ والقيود", disabledActions: ["create", "edit", "delete"] },
    ],
  },
  {
    key: "insights",
    name_ar: "لوحة المتابعة والتقارير",
    headerClass:
      "bg-[var(--group-accounting-bg)] text-[var(--group-accounting-fg)] border-[var(--group-accounting-border)]",
    modules: [
      { key: "monitoring", name_ar: "لوحة المتابعة", disabledActions: ["create", "edit", "delete", "print"] },
      { key: "reports", name_ar: "التقارير", disabledActions: ["create", "edit", "delete"] },
      { key: "contacts_reports", name_ar: "تقارير العملاء والموردين", disabledActions: ["create", "edit", "delete"] },
    ],
  },
  {
    key: "settings",
    name_ar: "الموارد البشرية والإعدادات",
    headerClass:
      "bg-[var(--group-settings-bg)] text-[var(--group-settings-fg)] border-[var(--group-settings-border)]",
    modules: [
      { key: "employees", name_ar: "الموظفين" },
      { key: "settings", name_ar: "الإعدادات العامة" },
    ],
  },
];

export const ACTION_LABELS: Record<ActionKey, string> = {
  view: "عرض",
  create: "إضافة",
  edit: "تعديل",
  delete: "حذف",
  print: "طباعة/تصدير",
};

export function emptyModuleActions(): ModuleActions {
  return { view: false, create: false, edit: false, delete: false, print: false };
}

/** Returns the actions actually editable for a module (excludes disabledActions). */
export function availableActions(module: ModuleDef): ActionKey[] {
  const dis = new Set(module.disabledActions ?? []);
  return STANDARD_ACTIONS.filter((a) => !dis.has(a));
}

export function defaultEmployeePermissions(): EmployeePermissionsV2 {
  return {
    pos: { view: true, create: true, edit: false, delete: false, print: false },
    sales_invoices: { view: true, create: false, edit: false, delete: false, print: false },
    customers: { view: true, create: false, edit: false, delete: false, print: false },
    products: { view: true, create: false, edit: false, delete: false, print: false },
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Merge permissions while preserving unknown/legacy keys.
 * - top-level keys are preserved
 * - nested module object keys are preserved
 */
export function mergeEmployeePermissions(
  existing: EmployeePermissionsV2 | Record<string, unknown> | null | undefined,
  incoming: EmployeePermissionsV2 | Record<string, unknown> | null | undefined,
): EmployeePermissionsV2 {
  const base = isPlainObject(existing) ? existing : {};
  const next = isPlainObject(incoming) ? incoming : {};
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(next)) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = { ...(out[k] as Record<string, unknown>), ...v };
    } else {
      out[k] = v;
    }
  }
  return out as EmployeePermissionsV2;
}
