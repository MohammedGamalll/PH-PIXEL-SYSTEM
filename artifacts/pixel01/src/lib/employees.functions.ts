import { supabase } from "@/integrations/supabase/client";

/**
 * Employee auth lifecycle operations go through the API server (/api/employees/*)
 * which uses the Supabase service-role key to manage auth users server-side.
 * Vite proxies /api → localhost:8080 in dev; in production the same path is used.
 */

async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("غير مصرح — يرجى تسجيل الدخول أولاً");
  return token;
}

async function callAdminApi(path: string, body: Record<string, any>): Promise<any> {
  const token = await getAuthToken();
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `فشل الطلب (${res.status})`);
  return json;
}

export const createEmployeeAccount = async ({ data }: {
  data: {
    name: string;
    email: string;
    password: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
  }
}) => {
  return callAdminApi("/employees/create", data);
};

export const updateEmployeeAccount = async ({ data }: {
  data: {
    id: string;
    name: string;
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    password?: string;
  }
}) => {
  return callAdminApi("/employees/update", data);
};

export const deleteEmployeeAccount = async ({ data }: { data: { id: string } }) => {
  return callAdminApi("/employees/delete", data);
};

export const restoreEmployeeAccount = async ({ data }: { data: { softDeleteId: string } }) => {
  return callAdminApi("/employees/restore", data);
};
