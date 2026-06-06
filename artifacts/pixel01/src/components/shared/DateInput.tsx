import { useEffect, useRef, useState, type CSSProperties } from "react";

type Props = {
  value?: string | null; // YYYY-MM-DD
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  style?: CSSProperties;
  id?: string;
  name?: string;
  autoFocus?: boolean;
};

// Convert Arabic-Indic and Persian digits to ASCII 0-9
function normalizeDigits(s: string): string {
  if (!s) return "";
  return s.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const code = d.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    return String(code - 0x06F0);
  });
}

function onlyDigits(s: string, max: number): string {
  return normalizeDigits(s).replace(/\D/g, "").slice(0, max);
}

function parseISO(v?: string | null): { d: string; m: string; y: string } {
  if (!v) return { d: "", m: "", y: "" };
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return { d: "", m: "", y: "" };
  return { y: m[1], m: m[2], d: m[3] };
}

function isValidDate(d: number, m: number, y: number): boolean {
  if (!d || !m || !y) return false;
  if (y < 1900 || y > 2100) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

const cellStyle: CSSProperties = {
  width: 44,
  textAlign: "center",
  padding: "6px 4px",
  border: "1px solid hsl(220 20% 78%)",
  borderRadius: 4,
  background: "#fff",
  fontSize: 15,
  outline: "none",
};
const yearStyle: CSSProperties = { ...cellStyle, width: 64 };
const sepStyle: CSSProperties = { padding: "0 4px", color: "#6b7280", fontWeight: 700 };

export function DateInput({ value, onChange, disabled, className, style, id, autoFocus }: Props) {
  const init = parseISO(value);
  const [d, setD] = useState(init.d);
  const [m, setM] = useState(init.m);
  const [y, setY] = useState(init.y);
  const [error, setError] = useState<string>("");

  const dRef = useRef<HTMLInputElement>(null);
  const mRef = useRef<HTMLInputElement>(null);
  const yRef = useRef<HTMLInputElement>(null);

  // sync from outside when value changes externally
  useEffect(() => {
    const p = parseISO(value);
    setD(p.d); setM(p.m); setY(p.y);
  }, [value]);

  useEffect(() => {
    if (autoFocus) dRef.current?.focus();
  }, [autoFocus]);

  const emit = (nd: string, nm: string, ny: string) => {
    if (!nd && !nm && !ny) {
      setError("");
      onChange("");
      return;
    }
    if (nd.length && nm.length && ny.length === 4) {
      const di = Number(nd), mi = Number(nm), yi = Number(ny);
      if (isValidDate(di, mi, yi)) {
        setError("");
        const iso = `${ny}-${String(mi).padStart(2, "0")}-${String(di).padStart(2, "0")}`;
        onChange(iso);
      } else {
        setError("تاريخ غير صحيح، استخدم صيغة يوم/شهر/سنة");
      }
    } else {
      setError("");
    }
  };

  const onD = (raw: string) => {
    const v = onlyDigits(raw, 2);
    setD(v);
    if (v.length === 2) mRef.current?.focus();
    emit(v, m, y);
  };
  const onM = (raw: string) => {
    const v = onlyDigits(raw, 2);
    setM(v);
    if (v.length === 2) yRef.current?.focus();
    emit(d, v, y);
  };
  const onY = (raw: string) => {
    const v = onlyDigits(raw, 4);
    setY(v);
    emit(d, m, v);
  };

  return (
    <div className={className} style={{ display: "inline-block", ...style }}>
      <div
        dir="ltr"
        title="أدخل التاريخ يدويًا - مثال: 19 / 05 / 2026 (يدعم الأرقام العربية والإنجليزية)"
        style={{ display: "inline-flex", alignItems: "center", gap: 0 }}
      >
        <input
          ref={dRef}
          id={id}
          type="text"
          inputMode="numeric"
          placeholder="يوم"
          value={d}
          disabled={disabled}
          onChange={(e) => onD(e.target.value)}
          onBlur={() => emit(d.padStart(d ? 2 : 0, "0") && d, m, y)}
          aria-label="اليوم"
          style={cellStyle}
        />
        <span style={sepStyle}>/</span>
        <input
          ref={mRef}
          type="text"
          inputMode="numeric"
          placeholder="شهر"
          value={m}
          disabled={disabled}
          onChange={(e) => onM(e.target.value)}
          aria-label="الشهر"
          style={cellStyle}
        />
        <span style={sepStyle}>/</span>
        <input
          ref={yRef}
          type="text"
          inputMode="numeric"
          placeholder="سنة"
          value={y}
          disabled={disabled}
          onChange={(e) => onY(e.target.value)}
          aria-label="السنة"
          style={yearStyle}
        />
      </div>
      {error ? (
        <div style={{ color: "hsl(0 75% 45%)", fontSize: 12, marginTop: 2 }} dir="rtl">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export default DateInput;
