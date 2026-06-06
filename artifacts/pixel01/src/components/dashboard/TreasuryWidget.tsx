import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Banknote, ChevronDown } from "lucide-react";

export function TreasuryWidget() {
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["treasury-accounts-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, account_type, sub_account_type, is_default_cash, opening_balance, account_balances(total_debit, total_credit)")
        .eq("account_type", "Asset")
        .eq("is_closed", false)
        .order("is_default_cash", { ascending: false });
      if (error) throw error;
      
      const PAYMENT_ASSET_SUBTYPES = [
        "الأصول المتداولة", "Current Assets", "نقدية", "بنوك", "نقدية وبنوك", "Cash", "Bank", "Cash & Bank", "Cash and Bank"
      ];

      return (data ?? [])
        .filter((a: any) => {
          const sub = (a.sub_account_type || "").trim();
          return !sub || PAYMENT_ASSET_SUBTYPES.includes(sub);
        })
        .map((acc: any) => {
          const bal = Array.isArray(acc.account_balances) ? acc.account_balances[0] : acc.account_balances;
          const d = Number(bal?.total_debit) || 0;
          const c = Number(bal?.total_credit) || 0;
          const isDebit = acc.account_type === "Asset" || acc.account_type === "Expense";
          const balance = isDebit
            ? (acc.opening_balance || 0) + d - c
            : (acc.opening_balance || 0) + c - d;
          return { ...acc, balance };
        });
    },
    refetchInterval: 30000,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const list = accounts as any[];
  const defaultAcc = list.find((a) => a.is_default_cash) ?? list[0] ?? null;
  const selectedAcc = list.find((a) => a.id === selectedId) ?? defaultAcc;

  if (isLoading) {
    return (
      <div style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #0f2540 100%)", borderRadius: 16, padding: "20px 24px", marginBottom: 24, color: "#fff", display: "flex", alignItems: "center", gap: 12 }}>
        <Banknote size={24} style={{ opacity: 0.6 }} />
        <span style={{ opacity: 0.6, fontSize: 14 }}>جارٍ تحميل أرصدة الخزينة...</span>
      </div>
    );
  }

  if (list.length === 0) return null;

  return (
    <div style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #0f2540 100%)", borderRadius: 16, padding: "20px 24px", marginBottom: 24, color: "#fff", boxShadow: "0 4px 24px rgba(0,0,0,0.18)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        {/* Left: main balance display */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: 10, display: "flex" }}>
            <Banknote size={26} color="#4ade80" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>رصيد الخزينة</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>
              {selectedAcc ? Number(selectedAcc.balance).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
              <span style={{ fontSize: 14, fontWeight: 400, marginInlineStart: 6, opacity: 0.7 }}>ج.م</span>
            </div>
          </div>
        </div>

        {/* Right: account selector dropdown */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px 14px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, minWidth: 160 }}
          >
            <span style={{ flex: 1, textAlign: "right" }}>{selectedAcc?.name ?? "اختر حساب"}</span>
            <ChevronDown size={15} style={{ transform: dropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
          </button>
          {dropdownOpen && (
            <div
              style={{ position: "absolute", top: "calc(100% + 6px)", insetInlineEnd: 0, background: "#1e293b", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, minWidth: 220, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 100, overflow: "hidden" }}
              onMouseLeave={() => setDropdownOpen(false)}
            >
              {list.map((acc: any) => (
                <button
                  key={acc.id}
                  onClick={() => { setSelectedId(acc.id); setDropdownOpen(false); }}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    width: "100%", padding: "10px 14px", background: selectedAcc?.id === acc.id ? "rgba(74,222,128,0.12)" : "transparent",
                    border: 0, color: selectedAcc?.id === acc.id ? "#4ade80" : "#e2e8f0",
                    cursor: "pointer", fontSize: 13, transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = selectedAcc?.id === acc.id ? "rgba(74,222,128,0.12)" : "transparent")}
                >
                  <span>{acc.name}{acc.is_default_cash ? " ★" : ""}</span>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>
                    {Number(acc.balance).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mini bar: all accounts summary */}
      {list.length > 1 && (
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          {list.map((acc: any) => (
            <button
              key={acc.id}
              onClick={() => setSelectedId(acc.id)}
              style={{
                background: selectedAcc?.id === acc.id ? "rgba(74,222,128,0.18)" : "rgba(255,255,255,0.06)",
                border: selectedAcc?.id === acc.id ? "1px solid rgba(74,222,128,0.5)" : "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, padding: "6px 12px", color: "#fff", cursor: "pointer", fontSize: 11,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 90,
              }}
            >
              <span style={{ opacity: 0.65, whiteSpace: "nowrap" }}>{acc.name}</span>
              <span style={{ fontWeight: 700, color: acc.balance >= 0 ? "#4ade80" : "#f87171", fontSize: 12 }}>
                {Number(acc.balance).toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
