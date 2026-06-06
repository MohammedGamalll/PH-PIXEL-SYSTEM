import { Link, useRouterState } from "@tanstack/react-router";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  Home, Activity, Package, ShoppingCart, Download, Users,
  BookOpen, BarChart3, Settings, Clock, Trash2, Warehouse as WarehouseIcon, type LucideIcon,
} from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { type EmployeePermissions } from "@/hooks/use-current-employee";
import { useSettings } from "@/contexts/SettingsContext";
import { useAccess, isPathAllowed } from "@/lib/access";

type SubItem = { ar: string; en: string; to: string };
type Section = {
  id: string;
  ar: string;
  en: string;
  icon: LucideIcon;
  to?: string; // flat link
  items?: SubItem[];
  permKey?: keyof EmployeePermissions;
};

const sections: Section[] = [
  { id: "home", ar: "الرئيسية", en: "Dashboard", icon: Home, to: "/dashboard" },
  { id: "monitoring", ar: "لوحة المتابعة", en: "Monitoring", icon: Activity, to: "/monitoring" },
  {
    id: "products",
    ar: "الأصناف",
    en: "Products",
    icon: Package,
    permKey: "products",
    items: [
      { ar: "أضف صنفاً", en: "Add product", to: "/products/add" },
      { ar: "كل الاصناف", en: "All products", to: "/products" },
      { ar: "المخزون التالف", en: "Damaged stock", to: "/products/damaged" },
      { ar: "الجرد المخزوني", en: "Inventory count", to: "/inventory-count" },
      { ar: "طباعة الملصقات", en: "Print labels", to: "/products/print-labels" },
      { ar: "وحدات الاصناف", en: "Units", to: "/products/units" },
      { ar: "مجموعات الاصناف", en: "Categories", to: "/products/categories" },
      { ar: "تحديث الأسعار", en: "Update prices", to: "/products/update-prices" },
      { ar: "مجموعات الأسعار", en: "Price groups", to: "/products/price-groups" },
      { ar: "ماركات الاصناف", en: "Brands", to: "/products/brands" },
      { ar: "ضمانات الاصناف", en: "Warranties", to: "/products/warranties" },
      { ar: "متغيرات الاصناف", en: "Variants", to: "/products/variations" },
      { ar: "استيراد بيانات الاصناف", en: "Import products", to: "/products/import" },
      { ar: "استيراد كميات افتتاحية", en: "Import opening stock", to: "/products/import-opening-stock" },
      { ar: "تبادل أصناف", en: "Item exchange", to: "/exchange/items" },
    ],
  },
  {
    id: "sales",
    ar: "المبيعات",
    en: "Sales",
    icon: ShoppingCart,
    permKey: "sales",
    items: [
      { ar: "اضافة مبيعات", en: "Add sale", to: "/sales/add" },
      { ar: "كل المبيعات", en: "All sales", to: "/sales/all" },
      { ar: "سجل الكاشير", en: "POS log", to: "/sales/cashier-log" },
      { ar: "الكاشير", en: "POS", to: "/sales/cashier-session" },
      { ar: "مسودات البيع", en: "Sale drafts", to: "/sales/drafts" },
      { ar: "عروض الاسعار", en: "Quotes", to: "/sales/quotations" },
      { ar: "مرجع المبيعات", en: "Sales returns", to: "/sales/returns" },
      { ar: "مرتجع حر", en: "Standalone returns", to: "/returns/standalone" },
      { ar: "الشحن والتوصيل", en: "Shipping", to: "/sales/shipping" },
      { ar: "خصومات ترويجية", en: "Promotions", to: "/sales/promotions" },
      { ar: "استيراد بيانات المبيعات", en: "Import sales", to: "/sales/import" },
      { ar: "تقرير المبيعات مفصل", en: "Detailed sales report", to: "/sales/detailed-report" },
    ],
  },
  {
    id: "purchases",
    ar: "المشتريات",
    en: "Purchases",
    icon: Download,
    permKey: "purchases",
    items: [
      { ar: "اضافة مشتريات", en: "Add purchase", to: "/purchases/add" },
      { ar: "كل المشتريات", en: "All purchases", to: "/purchases/all" },
      { ar: "مرجع المشتريات", en: "Purchase returns", to: "/purchases/returns" },
      { ar: "تقرير المشتريات", en: "Purchase report", to: "/purchases/report" },
      { ar: "قائمة المصاريف", en: "Expenses list", to: "/expenses/all" },
      { ar: "إضافة المصاريف", en: "Add expense", to: "/expenses/add" },
      { ar: "فئات المصاريف", en: "Expense categories", to: "/expenses/categories" },
      { ar: "تقرير المصاريف", en: "Expenses report", to: "/expenses/report" },
    ],
  },
  {
    id: "users",
    ar: "المستخدمين",
    en: "Users",
    icon: Users,
    permKey: "contacts",
    items: [
      { ar: "الموردين", en: "Suppliers", to: "/users/suppliers" },
      { ar: "العملاء", en: "Customers", to: "/users/customers" },
      { ar: "مجموعات العملاء", en: "Customer groups", to: "/users/customer-groups" },
      { ar: "مندوبي المبيعات", en: "Sales reps", to: "/users/sales-reps" },
      { ar: "الموظفين", en: "Employees", to: "/users/employees" },
      { ar: "تقرير مندوبي المبيعات", en: "Sales reps report", to: "/users/sales-rep-report" },
      { ar: "تقرير مناوبة الموظفين", en: "Employee shift report", to: "/users/shift-report" },
      { ar: "العملاء والموردين - تقارير اضافية", en: "Contacts - additional reports", to: "/users/reports" },
      { ar: "استيراد العملاء والموردين", en: "Import customers/suppliers", to: "/users/import-contacts" },
    ],
  },
  {
    id: "accounts",
    ar: "ادارة الحسابات",
    en: "Accounting",
    icon: BookOpen,
    items: [
      { ar: "عرض قائمة الحسابات", en: "Chart of accounts", to: "/accounting/accounts" },
      { ar: "الدخل (الربح / الخسارة)", en: "Profit / Loss", to: "/accounting/profit-loss" },
      { ar: "تقرير المتاجرة", en: "Trading report", to: "/accounting/trading-report" },
      { ar: "ميزان المراجعة", en: "Trial balance", to: "/accounting/trial-balance" },
      { ar: "التدفق النقدي", en: "Cash flow", to: "/accounting/cash-flow" },
      { ar: "الميزانية العمومية", en: "Balance sheet", to: "/accounting/balance-sheet" },
      { ar: "سجل حركة الحسابات", en: "Account ledger", to: "/accounting/transactions" },
    ],
  },
  {
    id: "reports",
    ar: "التقارير",
    en: "Reports",
    icon: BarChart3,
    permKey: "reports",
    items: [
      { ar: "تقرير المخزون", en: "Inventory report", to: "/reports/inventory" },
      { ar: "تقرير الجرد المخزني", en: "Inventory adjustment", to: "/reports/inventory-adjustment" },
      { ar: "الاصناف الشائعة", en: "Trending items", to: "/reports/trending-items" },
      { ar: "تقرير حركة الاصناف", en: "Item movement", to: "/reports/item-movement" },
      { ar: "تقرير المدفوعات", en: "Payments report", to: "/reports/payments" },
      { ar: "تقرير المقبوضات", en: "Receipts report", to: "/reports/receipts" },
      { ar: "تقرير مجموعات العملاء", en: "Customer groups report", to: "/reports/customer-groups" },
      { ar: "تقرير وملخص الضريبة", en: "Tax report", to: "/reports/tax" },
      { ar: "تقرير صلاحية الأصناف", en: "Expiring stock", to: "/reports/expiring-stock" },
      { ar: "سجل نشاطات الموظفين", en: "Employee activity log", to: "/reports/activity-log" },
    ],
  },
  {
    id: "hr",
    ar: "الموارد البشرية",
    en: "HR",
    icon: Clock,
    items: [
      { ar: "الحضور والانصراف", en: "Attendance", to: "/hr/attendance" },
      { ar: "الرواتب الشهرية", en: "Payroll", to: "/hr/payroll" },
      { ar: "تقارير الموارد البشرية", en: "HR analytics", to: "/hr/reports" },
      { ar: "رسائل للموظفين", en: "Employee messages", to: "/hr/messages" },
    ],


  },
  // TEMP: multi-warehouse UI hidden while system is locked to a single default warehouse.
  // {
  //   id: "warehouses",
  //   ar: "المخازن",
  //   en: "Warehouses",
  //   icon: WarehouseIcon,
  //   items: [
  //     { ar: "كل المخازن", en: "All warehouses", to: "/warehouses" },
  //     { ar: "تحويلات بين المخازن", en: "Transfers", to: "/warehouses/transfers" },
  //   ],
  // },
  { id: "deleted", ar: "السجلات الممسوحة", en: "Deleted records", icon: Trash2, to: "/deleted-records" },
  { id: "settings", ar: "إعدادات", en: "Settings", icon: Settings, to: "/settings", permKey: "settings" },
];



// Compute relative luminance to detect light vs dark sidebar bg/text
function isLight(hex?: string): boolean {
  if (!hex) return false;
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return false;
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  // perceived luminance
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160;
}

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin, permissions, rawPermissions } = useAccess();
  const { settings } = useSettings();

  // Derive a contrast-aware active style:
  const sidebarBgLight = isLight(settings.sidebar_bg);
  const ACTIVE_BG = sidebarBgLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.18)";
  const ACTIVE_FG = settings.sidebar_text;
  const ACTIVE_BORDER = sidebarBgLight ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.3)";
  const HOVER_BG = sidebarBgLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.1)";

  const ADMIN_ONLY_SECTIONS = new Set(["accounts", "deleted", "warehouses"]);

  // Filter top-level sections by V1-derived permKey, then filter each
  // section's sub-items via the canonical isPathAllowed (V2-aware).
  // Hide any section that ends up with zero visible sub-items.
  const visibleSections = sections
    .filter((s) => !s.permKey || permissions[s.permKey])
    .filter((s) => isAdmin || !ADMIN_ONLY_SECTIONS.has(s.id))
    .filter((s) => !s.to || isPathAllowed(s.to, isAdmin, permissions, rawPermissions))
    .map((s) => {
      if (!s.items) return s;
      if (isAdmin) return s;
      const items = s.items.filter((i) => isPathAllowed(i.to, isAdmin, permissions, rawPermissions));
      return { ...s, items };
    })
    .filter((s) => !s.items || s.items.length > 0 || isAdmin);


  const expandedId = visibleSections
    .filter((s) => s.items?.some((i) => i.to === pathname))
    .map((s) => s.id)[0];

  const flatActive = (to?: string) => to && pathname === to;

  return (
    <div className="flex flex-col h-full" style={{ color: settings.sidebar_text, fontFamily: "Tahoma, 'Segoe UI', sans-serif" }}>
      <div className="px-3 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(0,0,0,0.12)" }}>
        <div className="text-[13px] font-semibold truncate" title={settings.business_name} style={{ color: settings.sidebar_business_name_color || settings.sidebar_text }}>
          {settings.business_name}
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        <Accordion type="single" collapsible defaultValue={expandedId} className="space-y-1">
          {visibleSections.map((s) => {
            const isParentActive =
              !!s.items?.some((i) => i.to === pathname) || flatActive(s.to);
            const Icon = s.icon;

            // Flat link (no children)
            if (!s.items) {
              return (
                <Link
                  key={s.id}
                  to={s.to!}
                  onClick={onNavigate}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors border"
                  style={
                    isParentActive
                      ? { backgroundColor: ACTIVE_BG, color: ACTIVE_FG, borderColor: ACTIVE_BORDER }
                      : { backgroundColor: "transparent", color: settings.sidebar_text, borderColor: "transparent" }
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{isAr ? s.ar : s.en}</span>
                </Link>
              );
            }

            return (
              <AccordionItem key={s.id} value={s.id} className="border-b-0">
                <AccordionTrigger
                  className="px-3 py-2.5 rounded-lg text-sm hover:no-underline border [&>svg]:h-4 [&>svg]:w-4"
                  style={
                    isParentActive
                      ? { backgroundColor: ACTIVE_BG, color: ACTIVE_FG, borderColor: ACTIVE_BORDER }
                      : { backgroundColor: "transparent", color: settings.sidebar_text, borderColor: "transparent" }
                  }
                >
                  <span className="flex items-center gap-3 flex-1">
                    <Icon className="h-4 w-4" />
                    <span>{isAr ? s.ar : s.en}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pt-1 pb-1">
                  <ul className="space-y-0.5 ps-7 pe-1">
                    {s.items.map((item, i) => {
                      const active = pathname === item.to;
                      const inactiveColor = settings.sidebar_text;
                      return (
                        <li key={i}>
                          <Link
                            to={item.to}
                            onClick={onNavigate}
                            className="block py-1.5 px-2 rounded text-[13px] transition-colors"
                            style={{
                              color: active ? ACTIVE_FG : inactiveColor,
                              opacity: active ? 1 : 0.85,
                              fontWeight: active ? 700 : 400,
                              backgroundColor: active ? ACTIVE_BG : "transparent",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = HOVER_BG)}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = active ? ACTIVE_BG : "transparent")}
                          >
                            {isAr ? item.ar : item.en}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </nav>
    </div>
  );
}
