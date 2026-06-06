import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Check, AlertTriangle, Info, AlertCircle, MessageSquare } from "lucide-react";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, type NotificationRow } from "@/hooks/use-notifications";
import {
  useAdminMessages, useMarkAdminMessageRead, useMarkAllAdminMessagesRead, type AdminMessage,
} from "@/hooks/use-admin-messages";
import { useSettings } from "@/contexts/SettingsContext";

// Derive a slightly darker shade for hover, matching TopNavbar logic.
function shade(hex: string, percent: number): string {
  try {
    const h = hex.replace("#", "");
    const num = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    let r = (num >> 16) & 0xff;
    let g = (num >> 8) & 0xff;
    let b = num & 0xff;
    r = Math.max(0, Math.min(255, Math.round(r + (percent / 100) * 255)));
    g = Math.max(0, Math.min(255, Math.round(g + (percent / 100) * 255)));
    b = Math.max(0, Math.min(255, Math.round(b + (percent / 100) * 255)));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  } catch {
    return hex;
  }
}

export function NotificationBell() {
  const { settings } = useSettings();
  const accentBg = settings.nav_bg || "#166534";
  const accentBase = shade(accentBg, -20);
  const accentHover = shade(accentBg, -10);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread" | "messages">("all");
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data: list = [] } = useNotifications();
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const { data: messages = [] } = useAdminMessages();
  const markMsg = useMarkAdminMessageRead();
  const markAllMsgs = useMarkAllAdminMessagesRead();

  const unreadMsgs = useMemo(() => messages.filter((m) => !m.read_at), [messages]);
  const unreadCount = list.filter((n) => !n.is_read).length + unreadMsgs.length;

  const prevUnreadRef = useRef<number>(unreadCount);

  // Play a soft beep whenever unreadCount increases
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current && prevUnreadRef.current >= 0) {
      try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AC) {
          const ctx = new AC();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
          gain.gain.setValueAtTime(0.001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.32);
        }
      } catch { /* ignore */ }
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  const visible = tab === "unread" ? list.filter((n) => !n.is_read) : list;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const onClickItem = (n: NotificationRow) => {
    if (!n.is_read) markOne.mutate(n.id);
    // If notification carries a product_id, prefer the product card
    const productId = n.metadata && (n.metadata as any).product_id;
    if (productId) {
      setOpen(false);
      navigate({ to: "/products/$id/card", params: { id: String(productId) } as any }).catch(() => {});
      return;
    }
    if (n.link) {
      setOpen(false);
      // Normalize legacy/short links to actual routes
      let target = n.link;
      const map: Record<string, string> = {
        "/products/all": "/products",
        "/purchases": "/purchases/all",
        "/sales": "/sales/all",
        "/expenses": "/expenses/all",
      };
      if (map[target]) target = map[target];
      navigate({ to: target as any }).catch(() => {});
    }
  };


  return (
    <div ref={ref} className="relative inline-block text-left shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center text-sm font-medium text-white transition-all duration-200 p-1.5 rounded-lg ring-1 ring-white/10"
        style={{ backgroundColor: accentBase }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = accentHover)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = accentBase)}
        aria-label="الإشعارات"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ backgroundColor: "#dc2626", color: "#fff", border: `2px solid ${accentBase}` }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed sm:absolute end-2 sm:end-0 top-14 sm:top-auto sm:mt-1 bg-white rounded-lg shadow-xl ring-1 ring-black/5 z-50 overflow-hidden"
          dir="rtl"
          style={{ color: "#374151", width: "min(360px, calc(100vw - 16px))" }}
        >
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ backgroundColor: "#f9fafb" }}>
            <span className="text-sm font-bold">الإشعارات</span>
            {tab === "messages" ? (
              unreadMsgs.length > 0 && (
                <button
                  onClick={() => markAllMsgs.mutate(unreadMsgs.map((m) => m.id))}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Check className="h-3 w-3" /> تحديد الكل كمقروء
                </button>
              )
            ) : (
              unreadCount > 0 && (
                <button onClick={() => markAll.mutate()} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Check className="h-3 w-3" /> تحديد الكل كمقروء
                </button>
              )
            )}
          </div>

          <div className="flex border-b text-sm" style={{ backgroundColor: "#fff" }}>
            <button
              onClick={() => setTab("all")}
              className="flex-1 py-2 font-semibold"
              style={{
                borderBottom: tab === "all" ? "2px solid #166534" : "2px solid transparent",
                color: tab === "all" ? "#166534" : "#6b7280",
              }}
            >
              الكل ({list.length})
            </button>
            <button
              onClick={() => setTab("unread")}
              className="flex-1 py-2 font-semibold"
              style={{
                borderBottom: tab === "unread" ? "2px solid #166534" : "2px solid transparent",
                color: tab === "unread" ? "#166534" : "#6b7280",
              }}
            >
              غير مقروء ({list.filter((n) => !n.is_read).length})
            </button>
            <button
              onClick={() => setTab("messages")}
              className="flex-1 py-2 font-semibold flex items-center justify-center gap-1"
              style={{
                borderBottom: tab === "messages" ? "2px solid #166534" : "2px solid transparent",
                color: tab === "messages" ? "#166534" : "#6b7280",
              }}
            >
              <MessageSquare className="h-3.5 w-3.5" /> رسائل ({unreadMsgs.length})
            </button>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: "60vh" }}>
            {tab === "messages" ? (
              messages.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm" style={{ color: "#9ca3af" }}>
                  لا توجد رسائل
                </div>
              ) : (
                messages.map((m) => (
                  <AdminMessageItem
                    key={m.id}
                    m={m}
                    onClick={() => { if (!m.read_at) markMsg.mutate(m.id); }}
                  />
                ))
              )
            ) : (
              visible.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm" style={{ color: "#9ca3af" }}>
                  لا توجد إشعارات
                </div>
              ) : (
                visible.map((n) => <NotificationItem key={n.id} n={n} onClick={() => onClickItem(n)} />)
              )
            )}
          </div>

        </div>
      )}
    </div>
  );
}

function NotificationItem({ n, onClick }: { n: NotificationRow; onClick: () => void }) {
  const iconColor =
    n.severity === "danger" ? "#dc2626" : n.severity === "warning" ? "#d97706" : n.severity === "success" ? "#15803d" : "#2563eb";
  const Icon = n.severity === "danger" ? AlertCircle : n.severity === "warning" ? AlertTriangle : Info;
  const when = new Date(n.created_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
  return (
    <button
      onClick={onClick}
      className="w-full text-start px-4 py-3 border-b hover:bg-gray-50 transition-colors block"
      style={{ backgroundColor: n.is_read ? "#fff" : "#eff6ff" }}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <Icon className="h-5 w-5" style={{ color: iconColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-bold" style={{ color: "#111827" }}>
              {n.title}
            </span>
            {!n.is_read && <span className="shrink-0 h-2 w-2 rounded-full mt-1.5" style={{ backgroundColor: "#3b82f6" }} />}
          </div>
          {n.body && <p className="text-xs mt-1" style={{ color: "#6b7280" }}>{n.body}</p>}
          <span className="text-[10px] mt-1 block" style={{ color: "#9ca3af" }}>{when}</span>
        </div>
      </div>
    </button>
  );
}

function AdminMessageItem({ m, onClick }: { m: AdminMessage; onClick: () => void }) {
  const isUnread = !m.read_at;
  const when = new Date(m.created_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
  return (
    <button
      onClick={onClick}
      className="w-full text-start px-4 py-3 border-b hover:bg-gray-50 transition-colors block"
      style={{ backgroundColor: isUnread ? "#fef3c7" : "#fff" }}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <MessageSquare className="h-5 w-5" style={{ color: "#d97706" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-bold" style={{ color: "#111827" }}>{m.title}</span>
            {isUnread && <span className="shrink-0 h-2 w-2 rounded-full mt-1.5" style={{ backgroundColor: "#d97706" }} />}
          </div>
          {m.body && <p className="text-xs mt-1 whitespace-pre-wrap" style={{ color: "#374151" }}>{m.body}</p>}
          <span className="text-[10px] mt-1 block" style={{ color: "#9ca3af" }}>{when}</span>
        </div>
      </div>
    </button>
  );
}

