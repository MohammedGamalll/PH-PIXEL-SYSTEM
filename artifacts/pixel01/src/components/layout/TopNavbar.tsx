import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useCurrentEmployee } from "@/hooks/use-current-employee";
import { useSettings } from "@/contexts/SettingsContext";
import { CalculatorModal } from "./CalculatorModal";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Calendar } from "lucide-react";


interface Props {
  onToggleSidebar?: () => void;
}

export function TopNavbar({ onToggleSidebar }: Props) {
  const { user, signOut } = useAuth();
  const { employee } = useCurrentEmployee();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [calcOpen, setCalcOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName = (() => {
    const first = employee?.first_name || (user?.user_metadata as any)?.first_name;
    const last = employee?.last_name || (user?.user_metadata as any)?.last_name;
    const composed = [first, last].filter(Boolean).join(" ").trim();
    if (composed) return composed;
    return employee?.name || (user?.user_metadata as any)?.full_name || user?.email?.split("@")[0] || "المستخدم";
  })();

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    navigate({ to: "/" });
  };

  const todayStr = new Date().toLocaleDateString("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Derive accent button colors from configured nav background.
  // We darken slightly for the base button and lighten on hover so the
  // chrome adapts to whatever color the admin picked in settings.
  const accentBg = settings.nav_bg || "#166534";
  const accentHover = shadeColor(accentBg, -10);
  const accentBase = shadeColor(accentBg, -20);

  return (
    <>
      <div className="border-b shrink-0 lg:h-15 no-print" style={{ background: `linear-gradient(to right, ${settings.nav_bg}, ${settings.nav_bg})`, color: settings.nav_text, borderColor: "rgba(0,0,0,0.15)" }}>
        <div className="px-5 py-3">
          <div className="flex items-start justify-between gap-3 lg:gap-6 lg:items-center">
            <div className="flex items-center gap-3 shrink-0">
              <button type="button" onClick={onToggleSidebar} className="inline-flex items-center justify-center text-sm font-medium transition-all duration-200 p-1.5 rounded-lg ring-1 ring-white/10" style={{ backgroundColor: accentBase, color: settings.nav_text }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = accentHover)} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = accentBase)}>
                <span className="sr-only">Sidebar Menu</span>
                <svg aria-hidden="true" className="size-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                  <path d="M4 6l16 0"></path><path d="M4 12l16 0"></path><path d="M4 18l16 0"></path>
                </svg>
              </button>
            </div>

            <div className="hidden md:flex flex-1 items-center justify-center">
              <div className="inline-flex items-center gap-2 text-sm font-medium bg-white/10 rounded-lg px-3 py-1.5 ring-1 ring-white/10" style={{ color: settings.nav_text }}>
                <Calendar className="size-4" />
                <span>{todayStr}</span>
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 lg:gap-3">
              <button type="button" onClick={() => setCalcOpen(true)} className="hidden md:inline-flex items-center justify-center text-sm font-medium transition-all duration-200 p-1.5 rounded-lg ring-1 ring-white/10" style={{ backgroundColor: accentBase, color: settings.nav_text }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = accentHover)} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = accentBase)}>
                <span className="sr-only">Calculator</span>
                <svg aria-hidden="true" className="size-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                  <path d="M4 3m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"></path>
                  <path d="M8 7m0 1a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v1a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1z"></path>
                  <path d="M8 14l0 .01"></path><path d="M12 14l0 .01"></path><path d="M16 14l0 .01"></path>
                  <path d="M8 17l0 .01"></path><path d="M12 17l0 .01"></path><path d="M16 17l0 .01"></path>
                </svg>
              </button>

              <NotificationBell />

              <Link to="/sales/cashier" className="inline-flex transition-all duration-200 gap-2 py-1.5 px-3 rounded-lg items-center justify-center text-sm font-medium ring-1 ring-white/10" style={{ backgroundColor: accentBase, color: settings.nav_text }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = accentHover)} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = accentBase)}>

                <svg aria-hidden="true" className="size-5 hidden md:block" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                  <path d="M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"></path>
                  <path d="M14 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"></path>
                  <path d="M4 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"></path>
                  <path d="M14 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z"></path>
                </svg>
                الكاشير
              </Link>

              <div ref={menuRef} className="relative inline-block text-left shrink-0">
                <button type="button" onClick={() => setMenuOpen((v) => !v)} className="m-1 inline-flex transition-all ring-1 ring-white/10 cursor-pointer duration-200 py-1.5 px-3 rounded-lg items-center justify-center text-sm font-medium gap-1" style={{ backgroundColor: accentBase, color: settings.nav_text }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = accentHover)} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = accentBase)}>
                  <span className="hidden md:block">{displayName}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                    <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"></path>
                    <path d="M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"></path>
                    <path d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855"></path>
                  </svg>
                </button>
                {menuOpen && (
                  <div className="absolute end-0 mt-1 w-48 rounded-lg shadow-lg ring-1 ring-black/5 z-50 py-1" style={{ backgroundColor: "#ffffff", color: "#374151" }}>
                    <div className="px-3 py-2 border-b text-xs truncate" style={{ color: "#6b7280", backgroundColor: "#ffffff" }}>{user?.email}</div>
                    <Link to="/users/employees" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-sm hover:bg-gray-100" style={{ color: "#374151", backgroundColor: "#ffffff" }}>الموظفين</Link>
                    <button onClick={handleSignOut} className="w-full text-start px-3 py-2 text-sm hover:bg-red-50" style={{ color: "#dc2626", backgroundColor: "#ffffff" }}>تسجيل الخروج</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <CalculatorModal open={calcOpen} onClose={() => setCalcOpen(false)} />
    </>
  );
}

// Lighten or darken a hex color by a percentage (-100 to 100).
// Used to derive button accent from the configured nav background so
// any color the admin picks gives readable, consistent chrome.
function shadeColor(hex: string, percent: number): string {
  const m = hex.replace("#", "").match(/.{1,2}/g);
  if (!m || m.length < 3) return hex;
  const [r, g, b] = m.slice(0, 3).map((h) => parseInt(h, 16));
  const adj = (c: number) => {
    const v = Math.round(c + (percent / 100) * (percent < 0 ? c : 255 - c));
    return Math.max(0, Math.min(255, v));
  };
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(adj(r))}${toHex(adj(g))}${toHex(adj(b))}`;
}
