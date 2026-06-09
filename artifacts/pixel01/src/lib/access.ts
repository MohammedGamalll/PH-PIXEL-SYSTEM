import { useCurrentEmployee, type EmployeePermissions } from "@/hooks/use-current-employee";
import type { EmployeePermissionsV2, ActionKey } from "@/lib/permissions";

export function useAccess() {
  const { isEmployee, permissions, rawPermissions, isLoading } = useCurrentEmployee();
  return { isAdmin: !isEmployee, isEmployee, permissions, rawPermissions, isLoading };
}

// Routes only the admin (owner) can ever open.
const ADMIN_ONLY_PREFIXES = [
  "/accounting",
  "/users/employees",
  "/users/shift-report",
  "/warehouses",
  "/deleted-records",
  "/system",
  "/employees",
  "/employees/",
];

// Always allowed for any authenticated user.
const ALWAYS_ALLOWED = ["/dashboard", "/login", "/"];


// HR module: employees may only access /hr/attendance ("حسابي").
const EMPLOYEE_HR_ALLOWED = new Set<string>(["/hr/attendance"]);

// Map a path → V2 module key (+ optional required action). First matching rule wins.
// Order matters — more specific prefixes must come before broader ones.
const V2_RULES: Array<{ test: (p: string) => boolean; module: string; action?: ActionKey }> = [
  // Monitoring
  { test: (p) => p === "/monitoring" || p.startsWith("/monitoring/"), module: "monitoring" },

  // Sales — add/edit need create/edit action
  { test: (p) => p.startsWith("/sales/cashier"), module: "pos" },
  { test: (p) => p === "/sales/cashier-log" || p.startsWith("/sales/cashier-log/"), module: "pos" },
  { test: (p) => p === "/sales/returns" || p.startsWith("/sales/returns/"), module: "sales_returns" },
  { test: (p) => p === "/returns/standalone" || p.startsWith("/returns/standalone/"), module: "sales_returns" },
  { test: (p) => p === "/sales/add" || p.startsWith("/sales/add/") || p === "/sales/drafts-add" || p === "/sales/quotations-add", module: "sales_invoices", action: "create" },
  { test: (p) => p.startsWith("/sales/edit/"), module: "sales_invoices", action: "edit" },
  { test: (p) => p === "/sales" || p.startsWith("/sales/"), module: "sales_invoices" },
  { test: (p) => p === "/invoices" || p.startsWith("/invoices/"), module: "sales_invoices" },

  // Purchases — add/edit need create/edit action
  { test: (p) => p === "/purchases/returns" || p.startsWith("/purchases/returns/"), module: "purchase_returns" },
  { test: (p) => p === "/purchases/add" || p.startsWith("/purchases/add/"), module: "purchase_invoices", action: "create" },
  { test: (p) => p.startsWith("/purchases/edit/"), module: "purchase_invoices", action: "edit" },
  { test: (p) => p === "/purchases" || p.startsWith("/purchases/"), module: "purchase_invoices" },
  { test: (p) => p === "/expenses/add" || p === "/expenses/add/", module: "expenses", action: "create" },
  { test: (p) => p.startsWith("/expenses/edit/"), module: "expenses", action: "edit" },
  { test: (p) => p === "/expenses" || p.startsWith("/expenses/"), module: "expenses" },

  // Contacts reports (must come before generic /users/ rule)
  { test: (p) => p === "/users/reports" || p.startsWith("/users/reports/"), module: "contacts_reports" },
  { test: (p) => p === "/users/sales-rep-report" || p.startsWith("/users/sales-rep-report/"), module: "contacts_reports" },
  { test: (p) => p === "/reports/customer-groups" || p.startsWith("/reports/customer-groups/"), module: "contacts_reports" },

  // Contacts
  { test: (p) => p.startsWith("/users/customers"), module: "customers" },
  { test: (p) => p.startsWith("/users/suppliers"), module: "suppliers" },
  { test: (p) => p.startsWith("/users/"), module: "customers" },

  // Inventory
  { test: (p) => p === "/exchange/items" || p.startsWith("/exchange/items/"), module: "products" },
  { test: (p) => p.startsWith("/products/branch-transfers"), module: "stock_transfers" },
  { test: (p) => p === "/inventory-count/create" || p.startsWith("/inventory-count/create/"), module: "inventory_count", action: "create" },
  { test: (p) => p.startsWith("/inventory-count/edit/"), module: "inventory_count", action: "edit" },
  { test: (p) => p === "/inventory-count" || p.startsWith("/inventory-count/"), module: "inventory_count" },
  { test: (p) => p === "/products/add" || p.startsWith("/products/add/"), module: "products", action: "create" },
  { test: (p) => /^\/products\/[^/]+\/edit/.test(p), module: "products", action: "edit" },
  { test: (p) => p === "/products" || p.startsWith("/products/"), module: "products" },

  // Reports (general)
  { test: (p) => p === "/reports" || p.startsWith("/reports/"), module: "reports" },

  // Settings
  { test: (p) => p === "/settings" || p.startsWith("/settings/"), module: "settings" },
];


function v2Has(perms: EmployeePermissionsV2 | undefined, moduleKey: string, action: ActionKey = "view"): boolean {
  const m = perms?.[moduleKey];
  return !!(m && (m as any)[action]);
}

function canSeeReports(perms: EmployeePermissionsV2 | undefined): boolean {
  if (!perms) return false;
  return [
    "pos", "sales_invoices", "sales_returns",
    "purchase_invoices", "purchase_returns",
    "products", "warehouses", "inventory_count",
    "treasury", "expenses", "ledger",
  ].some((k) => v2Has(perms, k));
}

export function isPathAllowed(
  pathname: string,
  isAdmin: boolean,
  _permissionsV1: EmployeePermissions,
  rawPermissions?: EmployeePermissionsV2,
): boolean {
  if (isAdmin) return true;
  if (ALWAYS_ALLOWED.some((p) => pathname === p)) return true;

  // HR: only /hr/attendance for employees
  if (pathname === "/hr" || pathname.startsWith("/hr/")) {
    return EMPLOYEE_HR_ALLOWED.has(pathname);
  }

  if (ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return false;
  }

  const rule = V2_RULES.find((r) => r.test(pathname));
  if (rule) {
    if (rule.module === "__reports__") return canSeeReports(rawPermissions);
    return v2Has(rawPermissions, rule.module, rule.action ?? "view");
  }


  return true;
}
