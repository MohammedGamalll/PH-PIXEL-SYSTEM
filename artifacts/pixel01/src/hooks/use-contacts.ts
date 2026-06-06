import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { requireOwnerId } from "@/lib/db-errors";
import { toast } from "sonner";

export type ContactType = "customer" | "supplier" | "both";

const PREFIX_MAP: Record<ContactType, string> = {
  customer: "C",
  supplier: "S",
  both: "CS",
};

export function useContacts(type: ContactType, opts?: { includeInactive?: boolean }) {
  const { user } = useAuth();
  const includeInactive = opts?.includeInactive ?? false;
  return useQuery({
    queryKey: ["contacts", type, includeInactive],
    enabled: !!user,
    queryFn: async () => {
      const filter = type === "both" ? ["customer", "supplier", "both"] : [type, "both"];
      let q = supabase
        .from("contacts")
        .select("*")
        .in("type", filter)
        .order("created_at", { ascending: false });
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useContact(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["contact", id],
    enabled: !!user && !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, any> }) => {
      const { error } = await (supabase.from("contacts") as any).update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["contact", v.id] });
      toast.success("تم التعديل");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleContactActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase.from("contacts") as any).update({ is_active }).eq("id", id);
      if (error) throw error;
      return is_active;
    },
    onSuccess: (is_active) => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(is_active ? "تم تفعيل جهة الاتصال" : "تم تعطيل جهة الاتصال");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}


export function useCreateContact() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, any>) => {
      const t = (values.type as ContactType) || "customer";
      const prefix = PREFIX_MAP[t] || "C";
      const { count } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("type", t);
      const next = String((count ?? 0) + 1).padStart(4, "0");
      const contact_id = values.contact_id || `${prefix}${next}`;
      const { error } = await (supabase.from("contacts") as any)
        .insert({ ...values, contact_id, owner_id: requireOwnerId(ownerId) });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("تم الحفظ");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteContact(_type?: ContactType) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const ownerId = useOwnerId();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await (supabase.from("contacts") as any).select("*").eq("id", id).maybeSingle();
      if (row && ownerId) {
        const label = [row.first_name, row.last_name].filter(Boolean).join(" ") || row.business_name || row.contact_id || null;
        await (supabase.from("soft_deletes") as any).insert({
          owner_id: ownerId,
          entity_type: "contact",
          entity_id: id,
          entity_label: label,
          snapshot: row,
          deleted_by: user?.id ?? null,
        });
      }
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useImportContacts() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, any>[]) => {
      if (rows.length === 0) return 0;
      const effectiveOwnerId = requireOwnerId(ownerId);
      // Get current count per type for contact_id generation
      const counts: Record<string, number> = { customer: 0, supplier: 0, both: 0 };
      for (const t of ["customer", "supplier", "both"]) {
        const { count } = await supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .eq("type", t);
        counts[t] = count ?? 0;
      }
      const payload = rows.map((r) => {
        const t = (r.type as ContactType) || "customer";
        counts[t] += 1;
        const prefix = PREFIX_MAP[t] || "C";
        const contact_id =
          r.contact_id || `${prefix}${String(counts[t]).padStart(4, "0")}`;
        return { ...r, contact_id, owner_id: effectiveOwnerId };
      });
      const { error } = await (supabase.from("contacts") as any).insert(payload);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(`تم استيراد ${n} سجل`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
