import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  Receipt, FileText, Tag, Users,
  ShoppingBag, Truck, Wallet,
  Package, Store, Barcode,
  Settings, UserCog, ListChecks, ShieldCheck, TrendingUp,
  RotateCcw, Lock, ChevronDown, Banknote,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ReturnLookupModal } from "@/components/sales/ReturnLookupModal";
import { ReturnFormModal } from "@/components/sales/ReturnFormModal";
import { PurchaseReturnLookupModal } from "@/components/purchases/PurchaseReturnLookupModal";
import { PurchaseReturnModal } from "@/components/purchases/PurchaseReturnModal";
import { useContacts } from "@/hooks/use-contacts";
import { useAccess, isPathAllowed } from "@/lib/access";




export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Tile = { to?: string; action?: "return" | "purchase_return"; icon: LucideIcon; labelKey: string; size?: "lg" | "sm" };
type Group = {
  titleKey: string;
  bg: string;
  bgHover: string;
  badgeBg: string;
  badgeFg: string;
  badgeBorder: string;
  tiles: Tile[];
};

const groups: Group[] = [
  {
    titleKey: "dashboard.group.admin",
    bg: "#3b82f6",
    bgHover: "#2563eb",
    badgeBg: "#eff6ff",
    badgeFg: "#1d4ed8",
    badgeBorder: "#bfdbfe",
    tiles: [
      { to: "/settings", icon: Settings, labelKey: "dashboard.tile.settings", size: "lg" },
      { to: "/users/employees", icon: UserCog, labelKey: "dashboard.tile.users" },
      { to: "/reports/activity-log", icon: ListChecks, labelKey: "dashboard.tile.activity_log" },
      { to: "/users/shift-report", icon: ShieldCheck, labelKey: "dashboard.tile.shift_report" },
      { to: "/accounting/profit-loss", icon: TrendingUp, labelKey: "dashboard.tile.profit_loss" },
    ],
  },
  {
    titleKey: "dashboard.group.inventory",
    bg: "#14b8a6",
    bgHover: "#0d9488",
    badgeBg: "#f0fdfa",
    badgeFg: "#0f766e",
    badgeBorder: "#99f6e4",
    tiles: [
      { to: "/products/add", icon: Package, labelKey: "dashboard.tile.add_product", size: "lg" },
      { to: "/products", icon: Store, labelKey: "dashboard.tile.products", size: "lg" },
      { to: "/products/print-labels", icon: Barcode, labelKey: "dashboard.tile.barcode_label", size: "lg" },
    ],
  },
  {
    titleKey: "dashboard.group.purchases",
    bg: "#ca8a04",
    bgHover: "#a16207",
    badgeBg: "#fefce8",
    badgeFg: "#854d0e",
    badgeBorder: "#fef08a",
    tiles: [
      { to: "/purchases/add", icon: ShoppingBag, labelKey: "dashboard.tile.add_purchase", size: "lg" },
      { to: "/users/suppliers", icon: Truck, labelKey: "dashboard.tile.suppliers" },
      { action: "purchase_return", icon: RotateCcw, labelKey: "dashboard.tile.purchase_ref" },
      { to: "/expenses/all", icon: Wallet, labelKey: "dashboard.tile.expenses", size: "lg" },
    ],
  },
  {
    titleKey: "dashboard.group.sales",
    bg: "#0e7490",
    bgHover: "#155e75",
    badgeBg: "#ecfeff",
    badgeFg: "#155e75",
    badgeBorder: "#a5f3fc",
    tiles: [
      { to: "/sales/cashier", icon: Receipt, labelKey: "dashboard.tile.pos", size: "lg" },
      { to: "/sales/detailed-report", icon: FileText, labelKey: "dashboard.tile.sales_report" },
      { to: "/sales/quotations", icon: Tag, labelKey: "dashboard.tile.price_quotes" },
      { action: "return", icon: RotateCcw, labelKey: "dashboard.tile.return" },
      { to: "/users/customers", icon: Users, labelKey: "dashboard.tile.customers" },
    ],
  },
];

function Dashboard() {
  const { user } = useAuth();
  const { t, dir } = useI18n();

  const { data: profile } = useQuery({
    queryKey: ["dashboard-name", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Try profiles (admin) first
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, company_name")
        .eq("id", user!.id)
        .maybeSingle();
      if (p?.full_name) return p;
      // Employee → read employees row
      const { data: e } = await (supabase.from("employees") as any)
        .select("name, first_name, last_name")
        .eq("id", user!.id)
        .maybeSingle();
      if (e) {
        const full = [e.first_name, e.last_name].filter(Boolean).join(" ") || e.name;
        return { full_name: full, company_name: null };
      }
      return p;
    },
  });

  const name = profile?.full_name || user?.email?.split("@")[0] || "";
  const navigate = useNavigate();
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnInvoice, setReturnInvoice] = useState<any | null>(null);
  const [purchaseReturnOpen, setPurchaseReturnOpen] = useState(false);
  const [returnPurchase, setReturnPurchase] = useState<any | null>(null);
  const { data: suppliers = [] } = useContacts("supplier");
  const { isAdmin, permissions, rawPermissions } = useAccess();

  const tileAllowed = (tile: Tile): boolean => {
    if (isAdmin) return true;
    if (tile.to) return isPathAllowed(tile.to, isAdmin, permissions, rawPermissions);
    if (tile.action === "return") return !!(rawPermissions as any)?.sales_returns?.create;
    if (tile.action === "purchase_return") return !!(rawPermissions as any)?.purchase_returns?.create;
    return true;
  };

  const handleLockedClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toast.error("ليس لديك صلاحية للوصول لهذه الصفحة");
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto" dir={dir}>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: "#111827" }}>
          {t("dashboard.welcome", { name })} <span className="inline-block">👋</span>
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {groups.map((g) => (
          <div key={g.titleKey} className="space-y-3">
            <div className="flex justify-center">
              <span
                className="px-4 py-1.5 rounded-md text-sm font-semibold border"
                style={{ backgroundColor: g.badgeBg, color: g.badgeFg, borderColor: g.badgeBorder }}
              >
                {t(g.titleKey)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {g.tiles.map((tile, idx) => {
                const allowed = tileAllowed(tile);
                const span = tile.size === "lg" ? "col-span-2" : "col-span-1";
                const className = `${span} rounded-xl p-5 shadow-soft transition-smooth flex flex-col items-center justify-center gap-2 min-h-[110px] text-center relative`;
                const style: React.CSSProperties = {
                  backgroundColor: g.bg,
                  color: "#ffffff",
                  opacity: allowed ? 1 : 0.55,
                  cursor: allowed ? "pointer" : "not-allowed",
                };
                const inner = (
                  <>
                    {!allowed && (
                      <Lock
                        size={12}
                        style={{
                          position: "absolute",
                          top: 8,
                          insetInlineEnd: 8,
                          opacity: 0.85,
                        }}
                      />
                    )}
                    <tile.icon className="h-7 w-7 opacity-90" />
                    <span className="text-sm font-semibold">{t(tile.labelKey)}</span>
                  </>
                );
                if (tile.action === "return" || tile.action === "purchase_return") {
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={
                        allowed
                          ? () => tile.action === "return" ? setReturnOpen(true) : setPurchaseReturnOpen(true)
                          : handleLockedClick
                      }
                      className={className}
                      style={style}
                      onMouseEnter={(e) => { if (allowed) e.currentTarget.style.backgroundColor = g.bgHover; }}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = g.bg)}
                    >{inner}</button>
                  );
                }
                return (
                  <Link
                    key={idx}
                    to={tile.to!}
                    className={className}
                    style={style}
                    onClick={allowed ? undefined : handleLockedClick}
                    onMouseEnter={(e) => { if (allowed) e.currentTarget.style.backgroundColor = g.bgHover; }}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = g.bg)}
                  >{inner}</Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <ReturnLookupModal
        open={returnOpen}
        onOpenChange={setReturnOpen}
        onFound={(inv) => {
          setReturnOpen(false);
          setReturnInvoice(inv);
        }}
      />
      {returnInvoice && (
        <ReturnFormModal
          open={!!returnInvoice}
          onOpenChange={(v) => !v && setReturnInvoice(null)}
          original={returnInvoice}
        />
      )}
      <PurchaseReturnLookupModal
        open={purchaseReturnOpen}
        onOpenChange={setPurchaseReturnOpen}
        onFound={(p) => {
          setPurchaseReturnOpen(false);
          setReturnPurchase(p);
        }}
      />
      {returnPurchase && (
        <PurchaseReturnModal
          open={!!returnPurchase}
          onOpenChange={(v) => !v && setReturnPurchase(null)}
          purchase={returnPurchase}
          supplierName={(() => {
            const s = (suppliers as any[]).find((x) => x.id === returnPurchase.supplier_id);
            return s ? [s.first_name, s.last_name].filter(Boolean).join(" ") || s.business_name || "" : "";
          })()}
        />
      )}
    </div>
  );
}
