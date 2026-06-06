import { useState, useRef, useEffect } from "react";
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";

export type SortDir = "asc" | "desc" | null;

interface Props {
  label: string;
  active: boolean;
  direction: SortDir;
  onChange: (dir: SortDir) => void;
  className?: string;
  align?: "right" | "left" | "center";
  /** Override dropdown labels for asc/desc, e.g. {asc:"الأقدم", desc:"الأحدث"}. */
  dirLabels?: { asc: string; desc: string };
}

/**
 * Reusable sortable table header.
 * Click → open dropdown with "تصاعدي / تنازلي / بدون ترتيب" (or custom labels).
 */
export function SortableHeader({ label, active, direction, onChange, className, align = "right", dirLabels }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    <div ref={ref} className={`relative inline-flex items-center gap-1 select-none ${className ?? ""}`} style={{ justifyContent: align === "center" ? "center" : align === "left" ? "flex-start" : "flex-end" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 cursor-pointer hover:text-primary transition-colors"
        style={{ background: "transparent", border: "none", padding: 0, font: "inherit", color: "inherit" }}
      >
        <span>{label}</span>
        <Icon size={13} className={active ? "text-primary" : "text-muted-foreground opacity-60"} />
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 min-w-[150px] rounded-md border bg-popover shadow-lg"
          style={{ top: "100%", right: align === "right" ? 0 : undefined, left: align !== "right" ? 0 : undefined }}
        >
          <button
            type="button"
            className={`flex items-center gap-2 w-full px-3 py-2 text-right text-sm hover:bg-accent ${active && direction === "asc" ? "bg-accent" : ""}`}
            onClick={() => { onChange("asc"); setOpen(false); }}
          >
            <ArrowUp size={14} /> {dirLabels?.asc ?? "تصاعدي"}
          </button>
          <button
            type="button"
            className={`flex items-center gap-2 w-full px-3 py-2 text-right text-sm hover:bg-accent ${active && direction === "desc" ? "bg-accent" : ""}`}
            onClick={() => { onChange("desc"); setOpen(false); }}
          >
            <ArrowDown size={14} /> {dirLabels?.desc ?? "تنازلي"}
          </button>
          {active && (
            <button
              type="button"
              className="flex items-center gap-2 w-full px-3 py-2 text-right text-sm hover:bg-accent border-t"
              onClick={() => { onChange(null); setOpen(false); }}
            >
              <ChevronsUpDown size={14} /> إلغاء الترتيب
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Helper to build a sort comparator from current sort state.
 */
export function applySort<T>(rows: T[], key: keyof T | ((row: T) => any) | null, dir: SortDir): T[] {
  if (!key || !dir) return rows;
  const getVal = typeof key === "function" ? key : (r: T) => r[key];
  const sorted = [...rows].sort((a, b) => {
    const va = getVal(a);
    const vb = getVal(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return va - vb;
    return String(va).localeCompare(String(vb), "ar");
  });
  return dir === "asc" ? sorted : sorted.reverse();
}
