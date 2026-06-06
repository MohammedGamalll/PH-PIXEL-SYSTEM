import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { requireOwnerId } from "@/lib/db-errors";
import { toast } from "sonner";

type Table = "brands" | "units" | "categories" | "price_groups" | "warranties" | "variations";

function useEntity<T = any>(table: Table) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [table],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from(table as any).select("*").order("name");
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

function useCreate(table: Table) {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const { error } = await (supabase.from(table as any) as any).insert({ ...values, owner_id: requireOwnerId(ownerId) });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("تم الحفظ بنجاح");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function useUpdate(table: Table) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, any> }) => {
      const { error } = await (supabase.from(table as any) as any).update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("تم التعديل");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

const USAGE_CHECKS: Record<Table, { table: string; col: string; label: string }[]> = {
  brands: [
    { table: "products", col: "brand_id", label: "صنف" },
    { table: "promotional_discounts", col: "brand_id", label: "عرض ترويجي" },
  ],
  categories: [
    { table: "products", col: "category_id", label: "صنف" },
    { table: "categories", col: "parent_id", label: "فئة فرعية" },
    { table: "promotional_discounts", col: "category_id", label: "عرض ترويجي" },
  ],
  units: [{ table: "products", col: "unit_id", label: "صنف" }],
  warranties: [{ table: "products", col: "warranty_id", label: "صنف" }],
  price_groups: [{ table: "customer_groups", col: "price_group_id", label: "مجموعة عملاء" }],
  variations: [],
};

const ENTITY_LABEL: Record<Table, string> = {
  brands: "الماركة",
  categories: "الفئة",
  units: "الوحدة",
  warranties: "الضمان",
  price_groups: "مجموعة الأسعار",
  variations: "المتغير",
};

const SOFT_DELETE_TYPE: Partial<Record<Table, string>> = {
  brands: "brand",
  categories: "category",
};

function useDelete(table: Table) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const ownerId = useOwnerId();
  return useMutation({
    mutationFn: async (id: string) => {
      for (const check of USAGE_CHECKS[table] ?? []) {
        const { count, error: cErr } = await (supabase.from(check.table as any) as any)
          .select("id", { count: "exact", head: true })
          .eq(check.col, id);
        if (cErr) throw cErr;
        if ((count ?? 0) > 0) {
          throw new Error(`لا يمكن حذف ${ENTITY_LABEL[table]} لأنها مستخدمة في ${count} ${check.label}`);
        }
      }
      const sdType = SOFT_DELETE_TYPE[table];
      if (sdType && ownerId) {
        const { data: row } = await (supabase.from(table as any) as any).select("*").eq("id", id).maybeSingle();
        if (row) {
          await (supabase.from("soft_deletes") as any).insert({
            owner_id: ownerId,
            entity_type: sdType,
            entity_id: id,
            entity_label: (row as any).name ?? null,
            snapshot: row,
            deleted_by: user?.id ?? null,
          });
        }
      }
      const { error } = await supabase.from(table as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}


export const useBrands = () => useEntity("brands");
export const useUnits = () => useEntity("units");
export const useCategories = () => useEntity("categories");
export const usePriceGroups = () => useEntity("price_groups");
export const useWarranties = () => useEntity("warranties");
export const useVariations = () => useEntity("variations");

export const useCreateBrand = () => useCreate("brands");
export const useCreateUnit = () => useCreate("units");
export const useCreateCategory = () => useCreate("categories");
export const useCreatePriceGroup = () => useCreate("price_groups");
export const useCreateWarranty = () => useCreate("warranties");
export const useCreateVariation = () => useCreate("variations");

export const useUpdateBrand = () => useUpdate("brands");
export const useUpdateUnit = () => useUpdate("units");
export const useUpdateCategory = () => useUpdate("categories");
export const useUpdatePriceGroup = () => useUpdate("price_groups");
export const useUpdateWarranty = () => useUpdate("warranties");
export const useUpdateVariation = () => useUpdate("variations");

export const useDeleteBrand = () => useDelete("brands");
export const useDeleteUnit = () => useDelete("units");
export const useDeleteCategory = () => useDelete("categories");
export const useDeletePriceGroup = () => useDelete("price_groups");
export const useDeleteWarranty = () => useDelete("warranties");
export const useDeleteVariation = () => useDelete("variations");
