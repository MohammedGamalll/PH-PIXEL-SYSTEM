import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { toast } from "sonner";

export type AdminMessage = {
  id: string;
  owner_id: string;
  target_employee_id: string | null;
  title: string;
  body: string | null;
  created_by: string | null;
  created_at: string;
  read_at?: string | null; // attached client-side from admin_message_reads
};

export function useAdminMessages() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // realtime invalidation
  useEffect(() => {
    if (!user) return;
    const channelName = `admin_msgs_${user.id}_${Math.random().toString(36).slice(2, 10)}`;
    const ch = supabase.channel(channelName);
    ch.on("postgres_changes" as any, { event: "*", schema: "public", table: "admin_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["admin_messages"] });
      })
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "admin_message_reads" }, () => {
        qc.invalidateQueries({ queryKey: ["admin_messages"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  return useQuery({
    queryKey: ["admin_messages", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: msgs, error } = await (supabase.from("admin_messages") as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const list = (msgs as AdminMessage[]) ?? [];
      if (!list.length) return list;
      const ids = list.map((m) => m.id);
      const { data: reads } = await (supabase.from("admin_message_reads") as any)
        .select("message_id, read_at")
        .eq("user_id", user!.id)
        .in("message_id", ids);
      const readMap = new Map<string, string>(((reads as any[]) ?? []).map((r) => [r.message_id, r.read_at]));
      return list.map((m) => ({ ...m, read_at: readMap.get(m.id) ?? null }));
    },
  });
}

export function useCreateAdminMessage() {
  const ownerId = useOwnerId();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      body?: string | null;
      target_employee_id?: string | null;
    }) => {
      if (!ownerId) throw new Error("غير مصرح");
      const { error } = await (supabase.from("admin_messages") as any).insert({
        owner_id: ownerId,
        created_by: user?.id ?? null,
        title: input.title,
        body: input.body ?? null,
        target_employee_id: input.target_employee_id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_messages"] });
      toast.success("تم إرسال الرسالة");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteAdminMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("admin_messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_messages"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useMarkAdminMessageRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) return;
      const { error } = await (supabase.from("admin_message_reads") as any).upsert(
        { message_id: id, user_id: user.id },
        { onConflict: "message_id,user_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_messages"] });
    },
  });
}

export function useMarkAllAdminMessagesRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!user || ids.length === 0) return;
      const rows = ids.map((id) => ({ message_id: id, user_id: user.id }));
      const { error } = await (supabase.from("admin_message_reads") as any).upsert(rows, {
        onConflict: "message_id,user_id",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_messages"] });
    },
  });
}
