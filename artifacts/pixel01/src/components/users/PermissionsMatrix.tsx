import { Fragment, useState } from "react";
import { ChevronDown, ChevronLeft, Minus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import {
  PERMISSION_GROUPS,
  STANDARD_ACTIONS,
  ACTION_LABELS,
  availableActions,
  type ActionKey,
  type EmployeePermissionsV2,
  type ModuleDef,
  type ModulePermissions,
} from "@/lib/permissions";

type Props = {
  value: EmployeePermissionsV2;
  onChange: (next: EmployeePermissionsV2) => void;
};

function getModule(value: EmployeePermissionsV2, key: string): Partial<ModulePermissions> {
  return (value[key] as Partial<ModulePermissions>) ?? {};
}

function setModule(
  value: EmployeePermissionsV2,
  key: string,
  patch: Partial<ModulePermissions>,
): EmployeePermissionsV2 {
  const prev = getModule(value, key);
  return { ...value, [key]: { ...prev, ...patch } };
}

export function PermissionsMatrix({ value, onChange }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const handleAction = (mod: ModuleDef, action: ActionKey, checked: boolean) => {
    const cur = getModule(value, mod.key);
    let patch: Partial<ModulePermissions>;
    if (action === "view" && !checked) {
      patch = { view: false, create: false, edit: false, delete: false, print: false };
      if (mod.special) {
        for (const s of mod.special) (patch as any)[s.key] = false;
      }
    } else if (action !== "view" && checked && !cur.view) {
      patch = { [action]: checked, view: true } as Partial<ModulePermissions>;
    } else {
      patch = { [action]: checked } as Partial<ModulePermissions>;
    }
    onChange(setModule(value, mod.key, patch));
  };

  const handleSpecial = (mod: ModuleDef, specialKey: string, checked: boolean) => {
    const cur = getModule(value, mod.key);
    const patch: any = { [specialKey]: checked };
    if (checked && !cur.view) patch.view = true;
    onChange(setModule(value, mod.key, patch));
    // Auto-expand so the user sees what just changed when triggered programmatically.
    if (checked) setExpanded((s) => ({ ...s, [mod.key]: true }));
  };

  // Row Select-All toggles ONLY main (non-disabled) actions. Specials get their own toggle.
  const handleRowSelectAll = (mod: ModuleDef, checkAll: boolean) => {
    const cur = getModule(value, mod.key);
    const actions = availableActions(mod);
    const patch: Partial<ModulePermissions> = { ...cur };
    for (const a of actions) (patch as any)[a] = checkAll;
    onChange({ ...value, [mod.key]: patch });
  };

  const rowSelectAllState = (mod: ModuleDef): boolean | "indeterminate" => {
    const cur = getModule(value, mod.key);
    const actions = availableActions(mod);
    if (actions.length === 0) return false;
    const on = actions.filter((k) => !!(cur as any)[k]).length;
    if (on === 0) return false;
    if (on === actions.length) return true;
    return "indeterminate";
  };

  const specialsAllState = (mod: ModuleDef): boolean | "indeterminate" => {
    if (!mod.special || mod.special.length === 0) return false;
    const cur = getModule(value, mod.key);
    const on = mod.special.filter((s) => !!(cur as any)[s.key]).length;
    if (on === 0) return false;
    if (on === mod.special.length) return true;
    return "indeterminate";
  };

  const handleSpecialsAll = (mod: ModuleDef, checkAll: boolean) => {
    if (!mod.special) return;
    const cur = getModule(value, mod.key);
    const patch: any = { ...cur };
    for (const s of mod.special) patch[s.key] = checkAll;
    if (checkAll && !cur.view) patch.view = true;
    onChange({ ...value, [mod.key]: patch });
  };

  const hasAnySpecialOn = (mod: ModuleDef): boolean => {
    if (!mod.special) return false;
    const cur = getModule(value, mod.key);
    return mod.special.some((s) => !!(cur as any)[s.key]);
  };

  const applyToGroup = (
    groupKey: string,
    checkAll: boolean,
    includeSpecials: boolean,
  ) => {
    const group = PERMISSION_GROUPS.find((g) => g.key === groupKey);
    if (!group) return;
    const next: EmployeePermissionsV2 = { ...value };
    for (const mod of group.modules) {
      const cur = (next[mod.key] as Partial<ModulePermissions>) ?? {};
      const patch: any = { ...cur };
      for (const a of availableActions(mod)) patch[a] = checkAll;
      if (includeSpecials && mod.special) {
        for (const s of mod.special) patch[s.key] = checkAll;
      }
      next[mod.key] = patch;
    }
    onChange(next);
  };

  const applyToAll = (checkAll: boolean) => {
    const next: EmployeePermissionsV2 = { ...value };
    for (const group of PERMISSION_GROUPS) {
      for (const mod of group.modules) {
        const cur = (next[mod.key] as Partial<ModulePermissions>) ?? {};
        const patch: any = { ...cur };
        for (const a of availableActions(mod)) patch[a] = checkAll;
        if (mod.special) {
          for (const s of mod.special) patch[s.key] = checkAll;
        }
        next[mod.key] = patch;
      }
    }
    onChange(next);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-end gap-2 p-3 border-b bg-muted/40 flex-wrap">
        <button
          type="button"
          onClick={() => applyToAll(true)}
          className="text-xs px-3 py-1.5 rounded border border-border bg-background hover:bg-accent transition"
        >
          منح كل الصلاحيات
        </button>
        <button
          type="button"
          onClick={() => applyToAll(false)}
          className="text-xs px-3 py-1.5 rounded border border-border bg-background hover:bg-accent transition"
        >
          مسح كل الصلاحيات
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/60">
              <th className="text-start p-3 font-semibold w-[28%]">الوحدة</th>
              {STANDARD_ACTIONS.map((a) => (
                <th key={a} className="p-3 font-semibold text-center w-[10%]">
                  {ACTION_LABELS[a]}
                </th>
              ))}
              <th className="p-3 font-semibold text-center w-[12%]">تحديد الكل</th>
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((group) => (
              <GroupRows
                key={group.key}
                group={group}
                value={value}
                expanded={expanded}
                setExpanded={setExpanded}
                onAction={handleAction}
                onSpecial={handleSpecial}
                onRowSelectAll={(m, c) => {
                  handleRowSelectAll(m, c);
                  if (c && m.special && m.special.length > 0) {
                    setExpanded((s) => ({ ...s, [m.key]: true }));
                  }
                }}
                rowSelectAllState={rowSelectAllState}
                specialsAllState={specialsAllState}
                onSpecialsAll={handleSpecialsAll}
                hasAnySpecialOn={hasAnySpecialOn}
                onGroupSelectAll={(checkAll) => applyToGroup(group.key, checkAll, true)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function GroupRows({
  group,
  value,
  expanded,
  setExpanded,
  onAction,
  onSpecial,
  onRowSelectAll,
  rowSelectAllState,
  specialsAllState,
  onSpecialsAll,
  hasAnySpecialOn,
  onGroupSelectAll,
}: {
  group: (typeof PERMISSION_GROUPS)[number];
  value: EmployeePermissionsV2;
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onAction: (m: ModuleDef, a: ActionKey, c: boolean) => void;
  onSpecial: (m: ModuleDef, k: string, c: boolean) => void;
  onRowSelectAll: (m: ModuleDef, c: boolean) => void;
  rowSelectAllState: (m: ModuleDef) => boolean | "indeterminate";
  specialsAllState: (m: ModuleDef) => boolean | "indeterminate";
  onSpecialsAll: (m: ModuleDef, c: boolean) => void;
  hasAnySpecialOn: (m: ModuleDef) => boolean;
  onGroupSelectAll: (checkAll: boolean) => void;
}) {
  return (
    <>
      <tr role="rowheader">
        <td colSpan={7} className={`p-2.5 font-bold border-y ${group.headerClass}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span>{group.name_ar}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onGroupSelectAll(true)}
                className="text-[11px] px-2 py-0.5 rounded border border-current/30 hover:bg-background/40 transition"
              >
                تحديد الكل
              </button>
              <button
                type="button"
                onClick={() => onGroupSelectAll(false)}
                className="text-[11px] px-2 py-0.5 rounded border border-current/30 hover:bg-background/40 transition"
              >
                مسح
              </button>
            </div>
          </div>
        </td>
      </tr>
      {group.modules.map((mod) => {
        const cur = getModule(value, mod.key);
        const disabled = new Set(mod.disabledActions ?? []);
        const viewOff = !cur.view;
        const isExpanded = !!expanded[mod.key];
        const specialOn = hasAnySpecialOn(mod);
        return (
          <Fragment key={mod.key}>
            <tr className="border-b hover:bg-muted/20">
              <td className="p-3 min-h-[44px]">
                <div className="flex items-center gap-2">
                  {mod.special && mod.special.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((s) => ({ ...s, [mod.key]: !s[mod.key] }))
                      }
                      className="relative text-muted-foreground hover:text-foreground"
                      aria-label={isExpanded ? "طي الصلاحيات الخاصة" : "توسيع الصلاحيات الخاصة"}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronLeft className="h-4 w-4" />
                      )}
                      {!isExpanded && specialOn && (
                        <span
                          className="absolute -top-0.5 -end-0.5 h-2 w-2 rounded-full bg-[var(--badge-info-dot)]"
                          aria-label="توجد صلاحيات خاصة مفعّلة"
                        />
                      )}
                    </button>
                  )}
                  <span className="font-medium">{mod.name_ar}</span>
                </div>
              </td>
              {STANDARD_ACTIONS.map((a) => {
                const isDisabled = disabled.has(a);
                const isViewCol = a === "view";
                const greyed = !isViewCol && viewOff;
                return (
                  <td key={a} className="p-3 text-center min-h-[44px]">
                    {isDisabled ? (
                      <Minus
                        className="h-4 w-4 inline text-muted-foreground/60"
                        aria-label="غير متاح"
                      />
                    ) : (
                      <label className="inline-flex items-center justify-center w-full h-full cursor-pointer">
                        <Checkbox
                          checked={!!(cur as any)[a]}
                          disabled={greyed}
                          onCheckedChange={(c) => onAction(mod, a, !!c)}
                          aria-label={`${mod.name_ar} — ${ACTION_LABELS[a]}`}
                          className={greyed ? "opacity-40" : ""}
                        />
                      </label>
                    )}
                  </td>
                );
              })}
              <td className="p-3 text-center min-h-[44px]">
                <label className="inline-flex items-center justify-center w-full h-full cursor-pointer">
                  <Checkbox
                    checked={rowSelectAllState(mod)}
                    onCheckedChange={(c) => onRowSelectAll(mod, !!c)}
                    aria-label={`تحديد كل صلاحيات ${mod.name_ar}`}
                  />
                </label>
              </td>
            </tr>
            {mod.special && isExpanded && (
              <tr key={`${mod.key}-special`} className="bg-[var(--special-row-bg)] border-b">
                <td colSpan={7} className="p-3 ps-10">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="text-xs text-muted-foreground font-medium">
                      صلاحيات خاصة
                    </div>
                    <label
                      className={`flex items-center gap-2 text-xs cursor-pointer ${
                        viewOff ? "opacity-40 pointer-events-none" : ""
                      }`}
                    >
                      <Checkbox
                        checked={specialsAllState(mod)}
                        disabled={viewOff}
                        onCheckedChange={(c) => onSpecialsAll(mod, !!c)}
                        aria-label={`تحديد كل الصلاحيات الخاصة لـ ${mod.name_ar}`}
                      />
                      <span>تحديد كل الصلاحيات الخاصة</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-x-8 gap-y-3">
                    {mod.special.map((s) => (
                      <label
                        key={s.key}
                        className={`flex items-center gap-2 cursor-pointer ${
                          viewOff ? "opacity-40 pointer-events-none" : ""
                        }`}
                      >
                        <Checkbox
                          checked={!!(cur as any)[s.key]}
                          disabled={viewOff}
                          onCheckedChange={(c) => onSpecial(mod, s.key, !!c)}
                          aria-label={`${mod.name_ar} — ${s.label}`}
                        />
                        <span className="text-sm">{s.label}</span>
                      </label>
                    ))}
                  </div>
                </td>
              </tr>
            )}
          </Fragment>
        );
      })}
    </>
  );
}
