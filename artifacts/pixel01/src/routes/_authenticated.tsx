import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useAccess, isPathAllowed } from "@/lib/access";
import { useI18n } from "@/lib/i18n";
import { Logo } from "@/components/Logo";
import { AppSidebar } from "@/components/AppSidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { LogOut, Languages } from "lucide-react";
import { SettingsProvider, useSettings } from "@/contexts/SettingsContext";
import { WarehouseProvider, useWarehouseContext } from "@/contexts/WarehouseContext";
import { TopNavbar } from "@/components/layout/TopNavbar";



export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayoutWrapper,
});

function AuthenticatedLayoutWrapper() {
  return (
    <SettingsProvider>
      <WarehouseProvider>
        <AuthenticatedLayout />
      </WarehouseProvider>
    </SettingsProvider>
  );
}

function AuthenticatedLayout() {
  const { user, loading, signOut } = useAuth();
  const { t, lang, setLang, dir } = useI18n();
  const { settings } = useSettings();
  const { currentWarehouse } = useWarehouseContext();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("desktop_sidebar_open") !== "0";
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("desktop_sidebar_open", desktopSidebarOpen ? "1" : "0");
  }, [desktopSidebarOpen]);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin, permissions, rawPermissions, isLoading: accessLoading } = useAccess();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (loading || !user || accessLoading) return;
    if (!isPathAllowed(pathname, isAdmin, permissions, rawPermissions)) {
      toast.error("عفواً، ليس لديك صلاحية للوصول إلى هذه الصفحة");
      navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, user, accessLoading, isAdmin, permissions, rawPermissions, pathname, navigate]);

  if (loading || !user || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  const FooterControls = ({ onAction }: { onAction?: () => void }) => (
    <div className="p-3 border-t space-y-1" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
      <button
        onClick={() => { setLang(lang === "ar" ? "en" : "ar"); onAction?.(); }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
        style={{ color: settings.sidebar_text }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.12)")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        <Languages className="h-4 w-4" />
        {t("lang.switch")}
      </button>
      <button
        onClick={() => { handleSignOut(); onAction?.(); }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
        style={{ color: settings.sidebar_text }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.25)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
      >
        <LogOut className="h-4 w-4" />
        {lang === "ar" ? "تسجيل الخروج" : "Sign out"}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#e5e7eb" }}>
      {/* Desktop sidebar — visible only on lg+ */}
      <aside
        className={`${desktopSidebarOpen ? "lg:flex" : "lg:hidden"} hidden w-64 flex-col border-${dir === "rtl" ? "l" : "r"} border-border sticky top-0 h-screen`}
        style={{ backgroundColor: settings.sidebar_bg, color: settings.sidebar_text, fontFamily: "Tahoma, 'Segoe UI', sans-serif" }}
      >
        <div className="h-16 px-5 flex items-center border-b shrink-0" style={{ borderColor: "rgba(0,0,0,0.15)" }}>
          <Link to="/dashboard"><Logo useSettingsColor branchName={currentWarehouse?.name ?? null} /></Link>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          <AppSidebar />
        </div>
        <FooterControls />
      </aside>

      {/* Mobile/tablet drawer — same sidebar content, controlled by TopNavbar button */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side={dir === "rtl" ? "right" : "left"}
          className="p-0 w-72 flex flex-col lg:hidden border-0"
          style={{ backgroundColor: settings.sidebar_bg, color: settings.sidebar_text, fontFamily: "Tahoma, 'Segoe UI', sans-serif" }}
        >
          <div className="h-16 px-5 flex items-center border-b" style={{ borderColor: "rgba(0,0,0,0.15)" }}>
            <Logo useSettingsColor branchName={currentWarehouse?.name ?? null} />
          </div>
          <div className="flex-1 overflow-y-auto">
            <AppSidebar onNavigate={() => setMobileOpen(false)} />
          </div>
          <FooterControls onAction={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopNavbar onToggleSidebar={() => {
          if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
            setDesktopSidebarOpen((v) => !v);
          } else {
            setMobileOpen(true);
          }
        }} />

        <main
          className="flex-1 p-3 sm:p-4 lg:p-8"
          style={{
            backgroundColor: "#f1f5f9",
            borderTop: "1px solid #d1d5db",
          }}
        >
          <Outlet />
        </main>
      </div>

    </div>
  );
}
