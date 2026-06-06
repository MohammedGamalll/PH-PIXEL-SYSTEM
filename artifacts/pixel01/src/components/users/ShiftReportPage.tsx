import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { SessionDetailsModal } from "@/components/sales/cashier/SessionDetailsModal";
import { Eye } from "lucide-react";

type Row = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  user_name: string;
  email: string;
};

const cellBorder = { border: "1px solid #d1d5db" } as const;
const headStyle: React.CSSProperties = {
  backgroundColor: "#f3f4f6",
  color: "#374151",
  padding: "10px 12px",
  fontWeight: 600,
  textAlign: "right",
  fontSize: 13,
  border: "1px solid #d1d5db",
};

function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-EG");
}

export function ShiftReportPage() {
  const { user } = useAuth();
  const [inspecting, setInspecting] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["shift-report"],
    enabled: !!user,
    queryFn: async () => {
      const { data: sessions, error } = await (supabase.from("cashier_sessions") as any)
        .select("id, opened_at, closed_at, user_id, owner_id")
        .order("opened_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const userIds = Array.from(
        new Set(((sessions ?? []) as any[]).map((s) => s.user_id).filter(Boolean)),
      );
      const ownerIds = Array.from(
        new Set(((sessions ?? []) as any[]).map((s) => s.owner_id).filter(Boolean)),
      );

      const [{ data: emps }, { data: profs }] = await Promise.all([
        userIds.length > 0
          ? (supabase.from("employees") as any).select("id, name, email").in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        ownerIds.length > 0
          ? (supabase.from("profiles") as any).select("id, full_name").in("id", ownerIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const empMap = new Map<string, { name: string; email: string }>();
      ((emps ?? []) as any[]).forEach((e) => empMap.set(e.id, { name: e.name, email: e.email }));
      const profMap = new Map<string, string>();
      ((profs ?? []) as any[]).forEach((p) => profMap.set(p.id, p.full_name || ""));

      return ((sessions ?? []) as any[]).map((s) => {
        const emp = s.user_id ? empMap.get(s.user_id) : undefined;
        const fallbackName = profMap.get(s.owner_id) || "—";
        return {
          id: s.id,
          opened_at: s.opened_at,
          closed_at: s.closed_at,
          user_name: emp?.name || fallbackName,
          email: emp?.email || (user?.id === s.user_id ? user?.email || "—" : "—"),
        };
      });
    },
  });

  const headers = useMemo(
    () => ["وقت البدء", "وقت الإنتهاء", "اسم الموظف", "البريد الإلكتروني", "إجراء"],
    [],
  );

  return (
    <div className="space-y-3" dir="rtl">
      <PageHeader
        title="تقرير مناوبة الموظفين"
        subtitle="عرض جلسات المناوبات الخاصة بالموظفين على الكاشير"
      />
      <DataCard className="border border-gray-300">
        {isLoading ? (
          <div className="p-4 text-sm text-gray-500">جاري التحميل…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">لا توجد مناوبات مسجلة</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th key={h} style={headStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-2" style={cellBorder}>{fmt(r.opened_at)}</td>
                    <td className="p-2" style={cellBorder}>{fmt(r.closed_at)}</td>
                    <td className="p-2" style={cellBorder}>{r.user_name}</td>
                    <td className="p-2" style={{ ...cellBorder, direction: "ltr", textAlign: "right" }}>
                      {r.email}
                    </td>
                    <td className="p-2" style={cellBorder}>
                      <button
                        type="button"
                        onClick={() => setInspecting(r.id)}
                        className="h-8 px-3 inline-flex items-center gap-1 rounded text-white text-xs"
                        style={{ backgroundColor: "#3b82f6" }}
                      >
                        <Eye className="h-3 w-3" /> فحص
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataCard>

      {inspecting && (
        <SessionDetailsModal sessionId={inspecting} onClose={() => setInspecting(null)} />
      )}
    </div>
  );
}
