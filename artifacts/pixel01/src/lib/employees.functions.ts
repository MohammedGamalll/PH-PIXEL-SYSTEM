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

  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();
  if (!contentType.includes("application/json")) {
    throw new Error(
      raw.trim().startsWith("<")
        ? "خادم API غير متاح — تحقق من نشر الخادم على Vercel"
        : (raw.trim() || `فشل الطلب (${res.status})`),
    );
  }

  let json: any;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("استجابة غير صالحة من خادم API");
  }

  if (!res.ok) throw new Error(json.error || `فشل الطلب (${res.status})`);
  return json;
}

async function callAdminApiGet(path: string): Promise<any> {
  const token = await getAuthToken();
  const res = await fetch(`/api${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();
  if (!contentType.includes("application/json")) {
    throw new Error(raw.trim() || `فشل الطلب (${res.status})`);
  }
  const json = raw ? JSON.parse(raw) : {};
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
    permissions?: Record<string, any>;
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
    basic_salary?: number | null;
    working_hours?: number | null;
  }
}) => {
  return callAdminApi("/employees/update", data);
};

export const deleteEmployeeAccount = async ({ data }: { data: { id: string } }) => {
  return callAdminApi("/employees/delete", data);
};

export const updateEmployeePermissions = async ({ data }: {
  data: {
    id: string;
    permissions: Record<string, any>;
  }
}) => {
  return callAdminApi("/employees/permissions/update", data);
};

export const listEmployeesSummary = async () => {
  return callAdminApiGet("/employees/list");
};

export const restoreEmployeeAccount = async ({ data }: { data: { softDeleteId: string } }) => {
  return callAdminApi("/employees/restore", data);
};
