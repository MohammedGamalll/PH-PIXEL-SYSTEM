import { useEffect, useMemo, useRef, useState } from "react";
import { Win7Modal } from "./Win7Modal";
import { useProductBatches } from "@/hooks/use-product-batches";
import { formatBaseQuantity } from "@/lib/units";

type Props = {
  product: any;
  onClose: () => void;
  onSelect: (expiry: string) => void;
};

const inputStyle: React.CSSProperties = {
  border: "1px solid #9aa0a6",
  background: "#fff",
  padding: "4px 6px",
  fontSize: 13,
  borderRadius: 2,
};

const btn: React.CSSProperties = {
  padding: "6px 12px",
  border: "1px solid #9aa0a6",
  background: "#e5e7eb",
  cursor: "pointer",
  fontSize: 13,
  borderRadius: 2,
};

export function SelectExpiryDateModal({ product, onClose, onSelect }: Props) {
  const { data: batches = [], isLoading } = useProductBatches(product?.id);
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Build options: first = FEFO (earliest) shortcut, then each batch
  const options = useMemo(() => {
    const earliest = batches[0];
    const arr: Array<{ key: string; label: string; expiry: string; remainingLabel?: string; fefo?: boolean }> = [];
    if (earliest) {
      arr.push({
        key: `fefo-${earliest.expiry_date}`,
        label: `⚡ بيع من الأقرب (FEFO)`,
        expiry: earliest.expiry_date,
        fefo: true,
      });
    }
    for (const b of batches) {
      arr.push({
        key: b.expiry_date,
        label: fmt(b.expiry_date),
        expiry: b.expiry_date,
        remainingLabel: formatBaseQuantity(b.remaining, product),
      });
    }
    return arr;
  }, [batches, product]);

  useEffect(() => { setActiveIdx(0); }, [batches.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (options.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(options.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const o = options[activeIdx];
        if (o) onSelect(o.expiry);
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, activeIdx, onSelect, onClose]);

  // scroll active into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  return (
    <Win7Modal title={`اختر تاريخ الصلاحية — ${product?.name || ""}`} onClose={onClose} width={460}>
      <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>
        استخدم الأسهم ↑ ↓ ثم Enter لتحديد الدُفعة. Esc للإلغاء.
      </div>

      <div ref={listRef} style={{ maxHeight: 280, overflowY: "auto", border: "1px solid #9aa0a6", background: "#fff" }}>
        {isLoading && <div style={{ padding: 10, fontSize: 12 }}>جاري التحميل...</div>}
        {!isLoading && options.length === 0 && (
          <div style={{ padding: 10, fontSize: 12, color: "#6b7280" }}>
            لا توجد دُفعات صالحة لهذا المنتج. أدخل التاريخ يدويًا بالأسفل.
          </div>
        )}
        {options.map((o, idx) => {
          const active = idx === activeIdx;
          return (
            <button
              key={o.key}
              data-idx={idx}
              onClick={() => onSelect(o.expiry)}
              onMouseEnter={() => setActiveIdx(idx)}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 10px",
                border: "none",
                borderBottom: "1px solid #e5e7eb",
                background: active ? (o.fefo ? "#15803d" : "#3b82f6") : (o.fefo ? "#16a34a" : "#fff"),
                color: active || o.fefo ? "#fff" : "#111",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: o.fefo ? 700 : 500,
                outline: active ? "2px solid #1e40af" : "none",
              }}
            >
              <span>{o.label}</span>
              {o.remainingLabel && (
                <span style={{ fontSize: 11, fontWeight: 600 }}>
                  المتبقي: {o.remainingLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: "#374151" }}>أو أدخل تاريخ يدوي:</div>
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <input
          type="date"
          value={manual}
          onChange={(e) => { setManual(e.target.value); setManualError(null); }}
          style={{ ...inputStyle, flex: 1 }}
        />
        {manualError && (
          <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 4 }}>{manualError}</div>
        )}
        <button
          onClick={() => {
            if (!manual) return;
            const today = new Date().toISOString().slice(0, 10);
            if (manual < today) {
              setManualError("تاريخ الصلاحية منتهٍ — لا يمكن بيع هذه الدفعة.");
              return;
            }
            const batch = batches.find((b) => b.expiry_date === manual);
            if (!batch || batch.remaining <= 0) {
              setManualError("لا يوجد رصيد لهذه الدفعة — اختر تاريخاً من القائمة.");
              return;
            }
            onSelect(manual);
          }}
          disabled={!manual}
          style={{ ...btn, background: manual ? "#2563eb" : "#9ca3af", color: "#fff" }}
        >
          استخدام
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button onClick={onClose} style={btn}>إلغاء</button>
      </div>
    </Win7Modal>
  );
}

function fmt(d: string) {
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return d;
  }
}
