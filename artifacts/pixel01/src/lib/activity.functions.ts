import { supabase } from "@/integrations/supabase/client";

/**
 * Logs an auth-related event (sign_in, sign_out) into employee_activity_log.
 * Works for both admins and employees.
 */
export const logAuthEvent = async ({ data }: { data: { action_type: "sign_in" | "sign_out"; user_agent?: string | null } }) => {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) return { ok: true };

  const { data: emp } = await (supabase.from("employees") as any)
    .select("admin_id, name")
    .eq("id", userId)
    .maybeSingle();

  const adminId = emp?.admin_id ?? userId;
  const ownerId = adminId;
  const employeeId = emp ? userId : null;
  const actorName = emp?.name ?? "الأدمن";

  const { error } = await (supabase.from("employee_activity_log") as any).insert({
    owner_id: ownerId,
    admin_id: adminId,
    employee_id: employeeId,
    actor_name: actorName,
    action_type: data.action_type,
    user_agent: data.user_agent ?? null,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
};
