import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { playDing } from "@/lib/ding";

export type NotificationRow = {
  id: string;
  owner_id: string;
  type: string;
  severity: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  metadata: any;
  created_at: string;
};

export function useNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const lastIdRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ["notifications"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as NotificationRow[]) ?? [];
    },
  });

  useEffect(() => {
    if (!user) return;
    const channelName = `notifications-rt-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase.channel(channelName);
    channel
      .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "notifications" }, (payload: any) => {
        const row = payload.new as NotificationRow;
        if (lastIdRef.current !== row.id) {
          lastIdRef.current = row.id;
          playDing();
        }
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .on("postgres_changes" as any, { event: "UPDATE", schema: "public", table: "notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  return query;
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
