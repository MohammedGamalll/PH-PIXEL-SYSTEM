import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export type BusinessSettings = {
  id?: string;
  owner_id?: string;
  business_name: string;
  tax_number: string | null;
  currency_code: string;
  currency_symbol: string;
  currency_placement: "before" | "after";
  enable_expiry_dates: boolean;
  nav_bg: string;
  nav_text: string;
  sidebar_bg: string;
  sidebar_text: string;
  sidebar_business_name_color: string;
};

const LOCKED_BUSINESS_NAME = "​";

const DEFAULTS: BusinessSettings = {
  business_name: LOCKED_BUSINESS_NAME,
  tax_number: null,
  currency_code: "EGP",
  currency_symbol: "ج.م",
  currency_placement: "before",
  enable_expiry_dates: false,
  nav_bg: "#166534",
  nav_text: "#ffffff",
  sidebar_bg: "#166534",
  sidebar_text: "#ffffff",
  sidebar_business_name_color: "#ffffff",
};

type SettingsCtx = {
  settings: BusinessSettings;
  loading: boolean;
  refresh: () => Promise<void>;
  save: (patch: Partial<BusinessSettings>) => Promise<void>;
};

const Ctx = createContext<SettingsCtx | null>(null);

/**
 * Resolve the effective owner id for the current user.
 * - Employee → admin_id (from employees table)
 * - Admin → user.id
 */
async function resolveOwnerId(userId: string): Promise<string> {
  const { data } = await (supabase.from("employees") as any)
    .select("admin_id")
    .eq("id", userId)
    .maybeSingle();
  return (data as any)?.admin_id ?? userId;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [isEmployee, setIsEmployee] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setSettings(DEFAULTS);
      setOwnerId(null);
      setIsEmployee(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const resolved = await resolveOwnerId(user.id);
    setOwnerId(resolved);
    setIsEmployee(resolved !== user.id);

    const { data } = await supabase
      .from("business_settings")
      .select("*")
      .eq("owner_id", resolved)
      .maybeSingle();
    const merge = (d: any): BusinessSettings => ({
      ...DEFAULTS,
      ...d,
      business_name: LOCKED_BUSINESS_NAME,
      currency_placement: (d.currency_placement === "after" ? "after" : "before"),
      nav_bg: d.nav_bg || DEFAULTS.nav_bg,
      nav_text: d.nav_text || DEFAULTS.nav_text,
      sidebar_bg: d.sidebar_bg || DEFAULTS.sidebar_bg,
      sidebar_text: d.sidebar_text || DEFAULTS.sidebar_text,
      sidebar_business_name_color: d.sidebar_business_name_color || d.sidebar_text || DEFAULTS.sidebar_business_name_color,
    });
    if (data) {
      setSettings(merge(data));
    } else if (resolved === user.id) {
      // Only the admin can create the initial settings row.
      const { data: inserted } = await supabase
        .from("business_settings")
        .insert({ ...DEFAULTS, owner_id: resolved })
        .select()
        .maybeSingle();
      if (inserted) setSettings(merge(inserted));
    } else {
      // Employee with no settings row yet — show defaults read-only.
      setSettings(DEFAULTS);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (patch: Partial<BusinessSettings>) => {
    if (!user || !ownerId) return;
    if (isEmployee) {
      toast.error("لا تملك صلاحية تعديل إعدادات النشاط");
      return;
    }
    const next = { ...settings, ...patch, business_name: LOCKED_BUSINESS_NAME };
    const { error } = await supabase
      .from("business_settings")
      .upsert(
        {
          owner_id: ownerId,
          business_name: LOCKED_BUSINESS_NAME,
          tax_number: next.tax_number,
          currency_code: next.currency_code,
          currency_symbol: next.currency_symbol,
          currency_placement: next.currency_placement,
          enable_expiry_dates: next.enable_expiry_dates,
          nav_bg: next.nav_bg,
          nav_text: next.nav_text,
          sidebar_bg: next.sidebar_bg,
          sidebar_text: next.sidebar_text,
          sidebar_business_name_color: next.sidebar_business_name_color,
        } as any,
        { onConflict: "owner_id" }
      );
    if (error) throw error;
    setSettings(next);
  }, [user, ownerId, isEmployee, settings]);

  return (
    <Ctx.Provider value={{ settings, loading, refresh: load, save }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Allow components to use defaults outside the provider (e.g. public routes)
    return {
      settings: DEFAULTS,
      loading: false,
      refresh: async () => {},
      save: async () => {},
    } as SettingsCtx;
  }
  return ctx;
}
