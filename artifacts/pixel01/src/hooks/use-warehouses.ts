import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { toast } from "sonner";

export type Warehouse = {
  id: string;
  owner_id: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function useWarehouses() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  return useQuery({
    queryKey: ["warehouses", ownerId],
    enabled: !!user && !!ownerId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("warehouses")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Warehouse[];
    },
  });
}

export function useCreateWarehouse() {
  const qc = useQueryClient();
  const ownerId = useOwnerId();
  return useMutation({
    mutationFn: async (input: Partial<Warehouse>) => {
      if (!ownerId) throw new Error("no owner");
      const { data, error } = await (supabase as any)
        .from("warehouses")
        .insert({
          owner_id: ownerId,
          name: input.name,
          code: input.code ?? null,
          address: input.address ?? null,
          phone: input.phone ?? null,
          is_default: input.is_default ?? false,
          is_active: input.is_active ?? true,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Warehouse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("تم إضافة المخزن");
    },
    onError: (e: any) => toast.error(e.message || "تعذر الإضافة"),
  });
}

export function useUpdateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Warehouse> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from("warehouses")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Warehouse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("تم الحفظ");
    },
    onError: (e: any) => toast.error(e.message || "تعذر الحفظ"),
  });
}

export function useDeleteWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Defense-in-depth: refuse to delete the last remaining warehouse.
      const { data: existing, error: eList } = await (supabase as any)
        .from("warehouses")
        .select("id");
      if (eList) throw eList;
      if (((existing ?? []) as any[]).length <= 1) {
        throw new Error("لا يمكن حذف آخر مخزن — يجب الإبقاء على مخزن واحد على الأقل");
      }
      const { error } = await (supabase as any).from("warehouses").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("تم الحذف");
    },
    onError: (e: any) => toast.error(e.message || "تعذر الحذف"),
  });
}
