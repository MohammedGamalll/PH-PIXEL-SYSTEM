import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const safeEval = (expr: string): string => {
  try {
    const cleaned = expr.replace(/[^0-9+\-*/.() ]/g, "");
    if (!cleaned) return "0";
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${cleaned})`)();
    if (typeof result !== "number" || !isFinite(result)) return "Error";
    return String(Math.round(result * 1e10) / 1e10);
  } catch {
    return "Error";
  }
};

export function CalculatorModal({ open, onClose }: Props) {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState("0");
  const [justCalc, setJustCalc] = useState(false);

  const push = useCallback((s: string) => {
    setExpr((e) => {
      // If user just pressed = and now types a digit/dot → start fresh
      if (justCalc) {
        if (/[0-9.]/.test(s)) return s;
        // operator continues from previous result
        return (result === "Error" ? "0" : result) + s;
      }
      if (e === "" && /[+\-*/.]/.test(s)) return s;
      return e + s;
    });
    if (justCalc) setJustCalc(false);
  }, [justCalc, result]);

  const calc = useCallback(() => {
    const cleaned = (expr || "0").replace(/[+\-*/.]$/, "");
    const r = safeEval(cleaned || "0");
    setResult(r);
    if (r !== "Error") setExpr(r);
    setJustCalc(true);
  }, [expr]);
  const clear = useCallback(() => { setExpr(""); setResult("0"); setJustCalc(false); }, []);
  const backspace = useCallback(() => { setJustCalc(false); setExpr((e) => e.slice(0, -1)); }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const k = e.key;
      const stop = () => { e.preventDefault(); e.stopPropagation(); (e as any).stopImmediatePropagation?.(); };
      if (k === "Escape") { stop(); onClose(); return; }
      if (k === "Enter" || k === "=") { stop(); calc(); return; }
      if (k === "Backspace") { stop(); backspace(); return; }
      if (k.toLowerCase() === "c") { stop(); clear(); return; }
      if (/^[0-9.+\-*/()]$/.test(k)) { stop(); push(k); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, onClose, calc, backspace, clear, push]);

  useEffect(() => { if (open) { setExpr(""); setResult("0"); setJustCalc(false); } }, [open]);

  if (!open) return null;

  const btnStyle = (variant: "num" | "op" | "eq" | "clr" = "num"): React.CSSProperties => ({
    height: 52,
    fontSize: 28,
    fontWeight: 700,
    cursor: "pointer",
    borderRadius: 4,
    border: "1px solid #6b7280",
    background:
      variant === "eq" ? "linear-gradient(180deg,#34d399,#059669)" :
      variant === "clr" ? "linear-gradient(180deg,#f87171,#b91c1c)" :
      variant === "op" ? "linear-gradient(180deg,#dbeafe,#93c5fd)" :
      "linear-gradient(180deg,#ffffff,#d1d5db)",
    color: variant === "eq" || variant === "clr" ? "#fff" : "#1f2937",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.6), 0 1px 2px rgba(0,0,0,.2)",
  });

  const Btn = ({ children, onClick, variant = "num" }: { children: React.ReactNode; onClick: () => void; variant?: "num" | "op" | "eq" | "clr" }) => (
    <button type="button" onClick={onClick} style={btnStyle(variant)}>{children}</button>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "linear-gradient(180deg,#f3f4f6,#cbd5e1)",
          border: "1px solid #6b7280",
          borderRadius: 6,
          boxShadow: "0 12px 30px rgba(0,0,0,.4)",
          overflow: "hidden",
        }}
      >
        <div style={{
          background: "linear-gradient(180deg,#3b82f6,#1d4ed8)",
          color: "#fff",
          padding: "6px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 13,
          fontWeight: 700,
        }}>
          <span>🧮 الآلة الحاسبة</span>
          <button onClick={onClose} style={{ background: "transparent", color: "#fff", border: "none", cursor: "pointer" }}><X className="h-4 w-4" /></button>
        </div>
        <div style={{ padding: 10 }}>
          <div style={{
            background: "linear-gradient(180deg,#064e3b,#022c22)",
            color: "#86efac",
            fontFamily: "'Consolas','Courier New',monospace",
            padding: "8px 12px",
            textAlign: "right",
            borderRadius: 4,
            marginBottom: 8,
            border: "2px inset #6b7280",
            textShadow: "0 0 6px rgba(134,239,172,.6)",
          }}>
            <div style={{ fontSize: 24, minHeight: 28, opacity: 0.7, wordBreak: "break-all" }}>{expr || "\u00A0"}</div>
            <div style={{ fontSize: 56, fontWeight: 700, wordBreak: "break-all" }}>{result}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
            <Btn variant="clr" onClick={clear}>C</Btn>
            <Btn variant="op" onClick={backspace}>⌫</Btn>
            <Btn variant="op" onClick={() => push("(")}>(</Btn>
            <Btn variant="op" onClick={() => push(")")}>)</Btn>
            <Btn onClick={() => push("7")}>7</Btn>
            <Btn onClick={() => push("8")}>8</Btn>
            <Btn onClick={() => push("9")}>9</Btn>
            <Btn variant="op" onClick={() => push("/")}>÷</Btn>
            <Btn onClick={() => push("4")}>4</Btn>
            <Btn onClick={() => push("5")}>5</Btn>
            <Btn onClick={() => push("6")}>6</Btn>
            <Btn variant="op" onClick={() => push("*")}>×</Btn>
            <Btn onClick={() => push("1")}>1</Btn>
            <Btn onClick={() => push("2")}>2</Btn>
            <Btn onClick={() => push("3")}>3</Btn>
            <Btn variant="op" onClick={() => push("-")}>−</Btn>
            <Btn onClick={() => push("0")}>0</Btn>
            <Btn onClick={() => push(".")}>.</Btn>
            <Btn variant="op" onClick={() => push("+")}>+</Btn>
            <Btn variant="eq" onClick={calc}>=</Btn>
          </div>
          <p style={{ fontSize: 11, color: "#4b5563", marginTop: 8, textAlign: "center" }}>⌨️ اكتب بالكيبورد • Enter للحساب • Esc للإغلاق</p>
        </div>
      </div>
    </div>
  );
}
