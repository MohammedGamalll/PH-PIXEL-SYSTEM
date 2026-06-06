import { Warehouse as WarehouseIcon } from "lucide-react";
import { useWarehouseContext } from "@/contexts/WarehouseContext";
import { useSettings } from "@/contexts/SettingsContext";

function shade(hex: string, percent: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const num = parseInt(h, 16);
  let r = (num >> 16) + Math.round((percent / 100) * 255);
  let g = ((num >> 8) & 0xff) + Math.round((percent / 100) * 255);
  let b = (num & 0xff) + Math.round((percent / 100) * 255);
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function WarehouseSelector() {
  const { warehouses, currentWarehouseId, setCurrentWarehouseId } = useWarehouseContext();
  const { settings } = useSettings();

  if (!warehouses.length) return null;

  const bg = shade(settings.nav_bg || "#166534", -20);

  return (
    <div
      className="hidden md:inline-flex items-center gap-2 text-sm font-medium rounded-lg ring-1 ring-white/10 px-2 py-1"
      style={{ backgroundColor: bg, color: settings.nav_text }}
      title="المخزن الحالي"
    >
      <WarehouseIcon className="size-4" />
      <select
        value={currentWarehouseId ?? ""}
        onChange={(e) => setCurrentWarehouseId(e.target.value || null)}
        className="bg-transparent text-sm outline-none cursor-pointer"
        style={{ minWidth: 90, color: settings.nav_text }}
      >
        {warehouses.map((w) => (
          <option key={w.id} value={w.id} className="text-black">
            {w.name}
          </option>
        ))}
      </select>
    </div>
  );
}
