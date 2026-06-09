import { Router, type IRouter, type Request, type Response } from "express";
import { getSupabaseAdmin, verifyJwt } from "../lib/supabase-admin.js";

const router: IRouter = Router();

function defaultEmployeePermissions() {
  return {
    pos: { view: true, create: true, edit: false, delete: false, print: false },
    sales_invoices: { view: true, create: false, edit: false, delete: false, print: false },
    customers: { view: true, create: false, edit: false, delete: false, print: false },
    products: { view: true, create: false, edit: false, delete: false, print: false },
  };
}

function isObj(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function mergePermissions(existing: any, incoming: any) {
  const base = isObj(existing) ? existing : {};
  const next = isObj(incoming) ? incoming : {};
  const out: Record<string, any> = { ...base };
  for (const [k, v] of Object.entries(next)) {
    if (isObj(v) && isObj(out[k])) out[k] = { ...(out[k] as Record<string, any>), ...v };
    else out[k] = v;
  }
  return out;
}

async function insertActivityLog(admin: any, payload: {
  owner_id: string;
  admin_id: string;
  employee_id?: string | null;
  actor_name: string;
  action_type: string;
  subject_type?: string | null;
  subject_id?: string | null;
  subject_label?: string | null;
  details?: any;
}) {
  await (admin.from("employee_activity_log") as any).insert({
    owner_id: payload.owner_id,
    admin_id: payload.admin_id,
    employee_id: payload.employee_id ?? null,
    actor_name: payload.actor_name,
    action_type: payload.action_type,
    subject_type: payload.subject_type ?? null,
    subject_id: payload.subject_id ?? null,
    subject_label: payload.subject_label ?? null,
    details: payload.details ?? null,
  });
}

/** Extract bearer token from Authorization header */
function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

/** Middleware: authenticate admin caller and inject userId */
async function requireAdmin(req: Request, res: Response, next: Function) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  try {
    const userId = await verifyJwt(token);
    // Check that the caller is NOT an employee (only admins may use these routes)
    const admin = getSupabaseAdmin();
    const { data: empRow } = await (admin.from("employees") as any)
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (empRow) {
      res.status(403).json({ error: "الموظفون لا يستطيعون إدارة الحسابات" });
      return;
    }
    (req as any).adminId = userId;
    next();
  } catch (err: any) {
    res.status(401).json({ error: err.message || "Unauthorized" });
  }
}

/** POST /api/employees/create */
router.post("/employees/create", requireAdmin, async (req: Request, res: Response) => {
  const { name, email, password, first_name, last_name, phone, permissions } = req.body;
  const adminId: string = (req as any).adminId;
  const admin = getSupabaseAdmin();

  try {
    // Enforce 10-employee cap
    const { count, error: countErr } = await (admin.from("employees") as any)
      .select("id", { count: "exact", head: true })
      .eq("admin_id", adminId);
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) >= 10) throw new Error("EMPLOYEE_LIMIT_REACHED: Maximum of 10 employees allowed per admin.");

    // Check duplicate email
    const { data: existing } = await (admin.from("employees") as any)
      .select("id").eq("admin_id", adminId).eq("email", email).maybeSingle();
    if (existing) throw new Error("هذا البريد مسجل بالفعل كموظف");

    // Create auth user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (createErr || !created.user) throw new Error(createErr?.message || "فشل إنشاء حساب المستخدم");

    const empId = created.user.id;

    // Insert employees row
    const { error: insErr } = await (admin.from("employees") as any).insert({
      id: empId,
      admin_id: adminId,
      name,
      email,
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      phone: phone ?? null,
      permissions: mergePermissions(defaultEmployeePermissions(), permissions ?? {}),
    });
    if (insErr) {
      await admin.auth.admin.deleteUser(empId).catch(() => {});
      throw new Error(insErr.message);
    }

    await insertActivityLog(admin, {
      owner_id: adminId,
      admin_id: adminId,
      employee_id: empId,
      actor_name: "الأدمن",
      action_type: "employee_created",
      subject_type: "employee",
      subject_id: empId,
      subject_label: String(name || email),
      details: { email, phone: phone ?? null },
    });

    res.json({ id: empId, email });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** POST /api/employees/update */
router.post("/employees/update", requireAdmin, async (req: Request, res: Response) => {
  const { id, name, email, first_name, last_name, phone, password, basic_salary, working_hours } = req.body;
  const adminId: string = (req as any).adminId;
  const admin = getSupabaseAdmin();

  try {
    // Verify ownership
    const { data: emp } = await (admin.from("employees") as any)
      .select("id, admin_id, name, email").eq("id", id).maybeSingle();
    if (!emp || (emp as any).admin_id !== adminId) throw new Error("لا تملك صلاحية على هذا الموظف");

    const authUpdate: any = { email, user_metadata: { full_name: name } };
    if (password) authUpdate.password = password;

    const { error: authErr } = await admin.auth.admin.updateUserById(id, authUpdate);
    if (authErr) throw new Error(authErr.message);

    const { error: updErr } = await (admin.from("employees") as any)
      .update({
        name,
        email,
        first_name: first_name ?? null,
        last_name: last_name ?? null,
        phone: phone ?? null,
        basic_salary: basic_salary ?? undefined,
        working_hours: working_hours ?? undefined,
      })
      .eq("id", id);
    if (updErr) throw new Error(updErr.message);

    await insertActivityLog(admin, {
      owner_id: adminId,
      admin_id: adminId,
      employee_id: id,
      actor_name: "الأدمن",
      action_type: "employee_updated",
      subject_type: "employee",
      subject_id: id,
      subject_label: String(name || email),
      details: {
        before: { name: (emp as any).name, email: (emp as any).email },
        after: { name, email, first_name: first_name ?? null, last_name: last_name ?? null, phone: phone ?? null },
        password_changed: !!password,
      },
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** POST /api/employees/delete */
router.post("/employees/delete", requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.body;
  const adminId: string = (req as any).adminId;
  const admin = getSupabaseAdmin();

  try {
    const { data: empRow } = await (admin.from("employees") as any)
      .select("*").eq("id", id).eq("admin_id", adminId).maybeSingle();
    if (!empRow) throw new Error("الموظف غير موجود أو لا تملك صلاحية عليه");

    const empName = (empRow as any).name
      || [(empRow as any).first_name, (empRow as any).last_name].filter(Boolean).join(" ").trim()
      || (empRow as any).email || "موظف محذوف";

    // Snapshot name on transaction tables
    const snapshotTables = ["invoices", "purchases", "purchase_returns", "expenses", "damaged_stock", "stock_adjustments", "contact_payments"];
    for (const tbl of snapshotTables) {
      await (admin.from(tbl as any) as any)
        .update({ created_by_name_snapshot: empName })
        .eq("created_by", id);
    }

    // Soft-delete record
    await (admin.from("soft_deletes") as any).insert({
      owner_id: adminId, entity_type: "employee", entity_id: id,
      entity_label: empName, snapshot: empRow, deleted_by: adminId,
    });

    // Delete employees row
    const { error: delRowErr } = await (admin.from("employees") as any).delete().eq("id", id);
    if (delRowErr) throw new Error(delRowErr.message);

    // Delete auth user (best effort)
    const { error: delAuthErr } = await admin.auth.admin.deleteUser(id);
    if (delAuthErr) console.warn(`[employees/delete] auth user delete failed for ${id}:`, delAuthErr.message);

    await insertActivityLog(admin, {
      owner_id: adminId,
      admin_id: adminId,
      employee_id: id,
      actor_name: "الأدمن",
      action_type: "employee_deleted",
      subject_type: "employee",
      subject_id: id,
      subject_label: empName,
      details: { auth_deleted: !delAuthErr },
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/employees/permissions/update", requireAdmin, async (req: Request, res: Response) => {
  const { id, permissions } = req.body as { id?: string; permissions?: Record<string, any> };
  const adminId: string = (req as any).adminId;
  const admin = getSupabaseAdmin();

  try {
    if (!id || !permissions || !isObj(permissions)) throw new Error("بيانات الصلاحيات غير مكتملة");
    const { data: emp } = await (admin.from("employees") as any)
      .select("id, admin_id, name, email, permissions")
      .eq("id", id)
      .maybeSingle();
    if (!emp || (emp as any).admin_id !== adminId) throw new Error("لا تملك صلاحية على هذا الموظف");

    const merged = mergePermissions((emp as any).permissions ?? {}, permissions);
    const { error } = await (admin.from("employees") as any)
      .update({ permissions: merged })
      .eq("id", id)
      .eq("admin_id", adminId);
    if (error) throw new Error(error.message);

    await insertActivityLog(admin, {
      owner_id: adminId,
      admin_id: adminId,
      employee_id: id,
      actor_name: "الأدمن",
      action_type: "permissions_updated",
      subject_type: "employee",
      subject_id: id,
      subject_label: String((emp as any).name || (emp as any).email || "موظف"),
      details: { updated_modules: Object.keys(permissions) },
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/employees/list", requireAdmin, async (req: Request, res: Response) => {
  const adminId: string = (req as any).adminId;
  const admin = getSupabaseAdmin();

  try {
    const [{ data: employees, count, error }, { data: logs }, { data: profile }] = await Promise.all([
      (admin.from("employees") as any)
        .select("*", { count: "exact" })
        .eq("admin_id", adminId)
        .order("created_at", { ascending: false }),
      (admin.from("employee_activity_log") as any)
        .select("employee_id, created_at")
        .eq("admin_id", adminId)
        .not("employee_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(5000),
      (admin.from("profiles") as any)
        .select("company_name, full_name")
        .eq("id", adminId)
        .maybeSingle(),
    ]);
    if (error) throw new Error(error.message);

    const stats = new Map<string, { operations_count: number; last_activity_at: string | null }>();
    for (const l of (logs ?? []) as any[]) {
      const empId = String(l.employee_id || "");
      if (!empId) continue;
      const prev = stats.get(empId) ?? { operations_count: 0, last_activity_at: null };
      prev.operations_count += 1;
      if (!prev.last_activity_at) prev.last_activity_at = l.created_at || null;
      stats.set(empId, prev);
    }

    const rows = ((employees ?? []) as any[]).map((e) => ({
      ...e,
      operations_count: stats.get(e.id)?.operations_count ?? 0,
      last_activity_at: stats.get(e.id)?.last_activity_at ?? null,
    }));

    res.json({
      rows,
      count: count ?? rows.length,
      branchName: (profile as any)?.company_name || (profile as any)?.full_name || "الفرع الحالي",
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** POST /api/employees/restore */
router.post("/employees/restore", requireAdmin, async (req: Request, res: Response) => {
  const { softDeleteId } = req.body;
  const adminId: string = (req as any).adminId;
  const admin = getSupabaseAdmin();

  try {
    const { data: rec } = await (admin.from("soft_deletes") as any)
      .select("*").eq("id", softDeleteId).eq("entity_type", "employee").is("restored_at", null).maybeSingle();
    if (!rec) throw new Error("سجل الموظف المحذوف غير موجود");
    if ((rec as any).owner_id !== adminId) throw new Error("لا تملك صلاحية استرجاع هذا الموظف");

    const snap = { ...((rec as any).snapshot ?? {}) };
    const empId = snap.id || (rec as any).entity_id;
    const empName = snap.name || [snap.first_name, snap.last_name].filter(Boolean).join(" ").trim()
      || (rec as any).entity_label || snap.email || "موظف";
    if (!empId || !snap.email) throw new Error("بيانات الموظف المحفوظة غير مكتملة");

    // Re-create auth user if gone
    const { data: existingAuth } = await admin.auth.admin.getUserById(empId);
    if (!existingAuth?.user) {
      const { error: authErr } = await admin.auth.admin.createUser({
        id: empId, email: snap.email,
        password: `Restored@${crypto.randomUUID()}`,
        email_confirm: true, user_metadata: { full_name: empName },
      });
      if (authErr) throw new Error(authErr.message);
    }

    const employeeRow = { ...snap, id: empId, admin_id: snap.admin_id ?? adminId, name: empName, email: snap.email };
    const { error: upsertErr } = await (admin.from("employees") as any).upsert(employeeRow, { onConflict: "id" });
    if (upsertErr) throw new Error(upsertErr.message);

    await (admin.from("soft_deletes") as any)
      .update({ restored_at: new Date().toISOString(), restored_by: adminId })
      .eq("id", softDeleteId);

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
