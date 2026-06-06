import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { EmployeePermissionsV2 } from "@/lib/permissions";

export type CashierPermissions = {
  view_sales: boolean;
  add_sales: boolean;
  edit_sales: boolean;
  delete_sales: boolean;
  invoice_discount: boolean;
  edit_item_price: boolean;
  edit_item_discount: boolean;
  delete_invoice: boolean;
  manage_shift: boolean;
  sell_on_credit: boolean;
};

export type EmployeePermissions = {
  products: boolean;
  sales: boolean;
  purchases: boolean;
  contacts: boolean;
  reports: boolean;
  settings: boolean;
  cashier: CashierPermissions;
};

const CASHIER_FALSE: CashierPermissions = {
  view_sales: false,
  add_sales: false,
  edit_sales: false,
  delete_sales: false,
  invoice_discount: false,
  edit_item_price: false,
  edit_item_discount: false,
  delete_invoice: false,
  manage_shift: false,
  sell_on_credit: false,
};

const ALL_TRUE: EmployeePermissions = {
  products: true,
  sales: true,
  purchases: true,
  contacts: true,
  reports: true,
  settings: true,
  cashier: {
    view_sales: true,
    add_sales: true,
    edit_sales: true,
    delete_sales: true,
    invoice_discount: true,
    edit_item_price: true,
    edit_item_discount: true,
    delete_invoice: true,
    manage_shift: true,
    sell_on_credit: true,
  },
};

// All known V2 module keys (matches src/lib/permissions.ts PERMISSION_GROUPS)
const V2_KEYS = new Set([
  "pos", "sales_invoices", "sales_returns", "customers",
  "purchase_invoices", "purchase_returns", "suppliers",
  "products", "warehouses", "stock_transfers", "inventory_count",
  "treasury", "expenses", "ledger",
  "monitoring", "reports", "contacts_reports",
  "employees", "settings",
]);

function isV2Record(raw: any): boolean {
  if (!raw || typeof raw !== "object") return false;
  return Object.keys(raw).some((k) => {
    const v = raw[k];
    return V2_KEYS.has(k) && v && typeof v === "object";
  });
}

function v2View(raw: any, key: string): boolean {
  return !!(raw?.[key] && typeof raw[key] === "object" && raw[key].view);
}

function anyView(raw: any, keys: string[]): boolean {
  return keys.some((k) => v2View(raw, k));
}

function deriveV1FromV2(raw: EmployeePermissionsV2 | any): EmployeePermissions {
  const pos = raw?.pos ?? {};
  return {
    sales: anyView(raw, ["pos", "sales_invoices", "sales_returns"]),
    purchases: anyView(raw, ["purchase_invoices", "purchase_returns", "suppliers", "expenses"]),
    products: anyView(raw, ["products", "warehouses", "stock_transfers", "inventory_count"]),
    contacts: anyView(raw, ["customers", "suppliers", "contacts_reports"]),
    reports: v2View(raw, "reports") || v2View(raw, "contacts_reports"),
    settings: v2View(raw, "settings"),
    cashier: {
      view_sales: !!pos.view,
      add_sales: !!pos.create,
      edit_sales: !!pos.edit,
      delete_sales: !!pos.delete,
      invoice_discount: !!pos.custom_discount,
      edit_item_price: !!pos.change_price,
      edit_item_discount: !!pos.custom_discount,
      delete_invoice: !!pos.delete,
      manage_shift: !!pos.view,
      sell_on_credit: !!pos.sell_on_credit,
    },
  };
}

function normalizeV1(raw: any): EmployeePermissions {
  // Legacy V1 record — preserve previous defaults
  return {
    products: raw?.products ?? true,
    sales: raw?.sales ?? true,
    purchases: raw?.purchases ?? true,
    contacts: raw?.contacts ?? true,
    reports: raw?.reports ?? false,
    settings: raw?.settings ?? false,
    cashier: { ...CASHIER_FALSE, ...(raw?.cashier ?? {}) },
  };
}

function normalize(raw: any): EmployeePermissions {
  if (isV2Record(raw)) return deriveV1FromV2(raw);
  // empty object → no permissions (not all-true)
  if (raw && typeof raw === "object" && Object.keys(raw).length === 0) {
    return {
      products: false, sales: false, purchases: false,
      contacts: false, reports: false, settings: false,
      cashier: { ...CASHIER_FALSE },
    };
  }
  return normalizeV1(raw);
}

export function useCurrentEmployee() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["current_employee", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees" as any)
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const employee = q.data ?? null;
  const isEmployee = !!employee;
  const rawPermissions: EmployeePermissionsV2 = (employee?.permissions ?? {}) as EmployeePermissionsV2;
  const permissions: EmployeePermissions = isEmployee
    ? normalize(employee.permissions)
    : ALL_TRUE;

  const can = (section: keyof EmployeePermissions, action?: keyof CashierPermissions): boolean => {
    if (!isEmployee) return true;
    const v = permissions[section];
    if (typeof v === "boolean") return v;
    if (section === "cashier" && action) return !!(v as CashierPermissions)[action];
    return true;
  };

  return { employee, isEmployee, permissions, rawPermissions, can, isLoading: q.isLoading };
}
