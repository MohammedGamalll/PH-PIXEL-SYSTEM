import { useEffect, useMemo, useState } from "react";
import { type ProductUnitTree } from "@/lib/units";
import { PHARMACY_UNITS } from "@/lib/pharmacy-units";
import { useUnits, useCreateUnit } from "@/hooks/use-product-meta";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db", backgroundColor: "#ffffff",
  borderRadius: 6, height: 38, padding: "0 10px", width: "100%", fontSize: 14, outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 13, color: "#374151", marginBottom: 4, display: "block" };

export type UnitTreeValue = Required<{
  main_unit: string;
  sub_unit_1: string;
  sub_unit_1_ratio: string;
  sub_unit_2: string;
  sub_unit_2_ratio: string;
}>;

export const emptyUnitTree: UnitTreeValue = {
  main_unit: "", sub_unit_1: "", sub_unit_1_ratio: "", sub_unit_2: "", sub_unit_2_ratio: "",
};

export function unitTreeToDb(v: UnitTreeValue): ProductUnitTree {
  return {
    main_unit: v.main_unit.trim() || null,
    sub_unit_1: v.sub_unit_1.trim() || null,
    sub_unit_1_ratio: v.sub_unit_1_ratio ? Math.max(1, Math.floor(Number(v.sub_unit_1_ratio))) : null,
    sub_unit_2: v.sub_unit_2.trim() || null,
    sub_unit_2_ratio: v.sub_unit_2_ratio ? Math.max(1, Math.floor(Number(v.sub_unit_2_ratio))) : null,
  };
}

function UnitCombobox({
  value, onChange, placeholder, disabled,
}: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  const { t, dir } = useI18n();
  const { data: units = [] } = useUnits();
  const createUnit = useCreateUnit();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const options = useMemo(() => {
    const dbNames = (units as any[]).map((u) => String(u.name || "").trim()).filter(Boolean);
    const all = [...PHARMACY_UNITS, ...dbNames];
    if (value && !all.includes(value)) all.push(value);
    return Array.from(new Set(all));
  }, [units, value]);

  const confirmAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    if (!options.includes(name)) {
      try {
        await createUnit.mutateAsync({ name, short_name: name, allow_fractions: "no", has_sub_units: false });
      } catch {
        // toast handled in hook
        return;
      }
    }
    onChange(name);
    setNewName("");
    setAdding(false);
    setOpen(false);
  };

  return (
    <div className="flex gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="flex-1 inline-flex items-center justify-between rounded-md text-sm"
            style={{ ...inputStyle, opacity: disabled ? 0.5 : 1 }}
          >
            <span className={cn("truncate text-start", !value && "text-muted-foreground")}>
              {value || placeholder || t("products.unit_tree.choose_unit")}
            </span>
            <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent dir={dir} align="start" sideOffset={4} className="p-0 w-[--radix-popover-trigger-width]">
          <Command>
            <CommandInput placeholder={t("products.unit_tree.search_unit")} />
            <CommandList>
              <CommandEmpty>{t("products.unit_tree.no_results")}</CommandEmpty>
              <CommandGroup>
                {options.map((name) => (
                  <CommandItem
                    key={name}
                    value={name}
                    onSelect={() => { onChange(name); setOpen(false); }}
                    className="text-start"
                  >
                    <Check className={cn("ms-2 h-4 w-4", value === name ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1">{name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            {adding ? (
              <div className="p-2 border-t flex gap-1" style={{ borderColor: "#e5e7eb" }}>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmAdd(); } }}
                  placeholder={t("products.unit_tree.new_unit_name")}
                  style={{ ...inputStyle, height: 32 }}
                />
                <button type="button" onClick={confirmAdd}
                  className="h-8 px-3 rounded-md text-white text-xs"
                  style={{ backgroundColor: "#3b82f6" }}>{t("products.unit_tree.add_btn")}</button>
              </div>
            ) : null}
          </Command>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        disabled={disabled}
        title={t("products.unit_tree.add_unit")}
        onClick={() => { setAdding(true); setOpen(true); }}
        className="h-[38px] w-[38px] rounded-md inline-flex items-center justify-center"
        style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#3b82f6", opacity: disabled ? 0.5 : 1 }}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export function UnitTreeFields({ value, onChange }: { value: UnitTreeValue; onChange: (v: UnitTreeValue) => void }) {
  const { t } = useI18n();
  const initialEnable = !!(value.sub_unit_1 || value.sub_unit_1_ratio || value.sub_unit_2 || value.sub_unit_2_ratio);
  const [enableSub, setEnableSub] = useState(initialEnable);

  // Re-sync when value props change later (e.g., async data load on edit page)
  useEffect(() => {
    if (value.sub_unit_1 || value.sub_unit_1_ratio || value.sub_unit_2 || value.sub_unit_2_ratio) {
      setEnableSub(true);
    }
  }, [value.sub_unit_1, value.sub_unit_1_ratio, value.sub_unit_2, value.sub_unit_2_ratio]);

  const mainReady = !!value.main_unit.trim();
  const sub1Enabled = enableSub && mainReady;
  const sub1Ratio = Number(value.sub_unit_1_ratio) || 0;
  const sub2Enabled = sub1Enabled && !!value.sub_unit_1.trim() && sub1Ratio >= 1;
  const sub2Hint = !sub2Enabled ? t("products.unit_tree.fill_sub1_first") : undefined;

  const set = (patch: Partial<UnitTreeValue>) => onChange({ ...value, ...patch });

  const toggleEnable = (on: boolean) => {
    setEnableSub(on);
    if (!on) onChange({ ...value, sub_unit_1: "", sub_unit_1_ratio: "", sub_unit_2: "", sub_unit_2_ratio: "" });
  };

  return (
    <div className="rounded-md p-4 space-y-3" style={{ border: "1px solid #e5e7eb", backgroundColor: "#fafafa" }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: "#111827" }}>{t("products.unit_tree.title")}</h3>
        <span className="text-xs" style={{ color: "#6b7280" }}>{t("products.unit_tree.hint")}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <label style={labelStyle}>{t("products.unit_tree.main")}</label>
          <UnitCombobox value={value.main_unit} onChange={(v) => set({ main_unit: v })} placeholder={t("products.unit_tree.main_placeholder")} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm pt-1" style={{ color: "#374151" }}>
        <input type="checkbox" checked={enableSub} onChange={(e) => toggleEnable(e.target.checked)} />
        {t("products.unit_tree.enable_sub")}
      </label>

      {enableSub && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label style={labelStyle}>{t("products.unit_tree.sub1")}</label>
              <UnitCombobox value={value.sub_unit_1} onChange={(v) => set({ sub_unit_1: v })} placeholder={t("products.unit_tree.sub1_placeholder")} disabled={!sub1Enabled} />
            </div>
            <div>
              <label style={labelStyle}>{t("products.unit_tree.how_many")} {value.sub_unit_1 || t("products.unit_tree.sub_default")} {t("products.unit_tree.in")} {value.main_unit || t("products.unit_tree.main_default")}؟</label>
              <input style={inputStyle} disabled={!sub1Enabled} type="number" min={1} step={1}
                value={value.sub_unit_1_ratio}
                onChange={(e) => set({ sub_unit_1_ratio: e.target.value.replace(/\D/g, "") })}
                placeholder="3" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3" title={sub2Hint}>
            <div>
              <label style={labelStyle}>{t("products.unit_tree.sub2")}</label>
              <UnitCombobox value={value.sub_unit_2} onChange={(v) => set({ sub_unit_2: v })} placeholder={t("products.unit_tree.sub2_placeholder")} disabled={!sub2Enabled} />
            </div>
            <div>
              <label style={labelStyle}>{t("products.unit_tree.how_many")} {value.sub_unit_2 || t("products.unit_tree.sub2_default")} {t("products.unit_tree.in")} {value.sub_unit_1 || t("products.unit_tree.sub1_default")}؟</label>
              <input style={inputStyle} disabled={!sub2Enabled} type="number" min={1} step={1}
                value={value.sub_unit_2_ratio}
                onChange={(e) => set({ sub_unit_2_ratio: e.target.value.replace(/\D/g, "") })}
                placeholder="10" />
            </div>
            {sub2Hint && (
              <div className="md:col-span-1 flex items-end">
                <span className="text-xs" style={{ color: "#9ca3af" }}>{sub2Hint}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}