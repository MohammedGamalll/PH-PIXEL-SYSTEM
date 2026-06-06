import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useEmployees, useUpdateEmployeePermissions } from "@/hooks/use-employees";
import { useUpdateEmployeeSalary } from "@/hooks/use-payroll";
import type { EmployeePermissions, CashierPermissions } from "@/hooks/use-current-employee";
import { createEmployeeAccount, updateEmployeeAccount, deleteEmployeeAccount } from "@/lib/employees.functions";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/users/employees")({
  component: EmployeesPage,
});

function EmployeesPage() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: employeesData, isLoading } = useEmployees();
  const employees = employeesData?.rows ?? [];
  const count = employeesData?.count ?? 0;
  const limitReached = count >= 10;
  const updatePerms = useUpdateEmployeePermissions();
  const createFn = createEmployeeAccount;
  const updateFn = updateEmployeeAccount;
  const deleteFn = deleteEmployeeAccount;

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [editingInfo, setEditingInfo] = useState<any | null>(null);
  

  const adminPrefix = (user?.email ?? "user").split("@")[0];
  const defaultEmail = `${adminPrefix}_emp@gmail.com`;
  const [name, setName] = useState(t("users.emp.default_name"));
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("Emp@2026");

  const th: React.CSSProperties = {
    backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px",
    fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb",
  };
  const td: React.CSSProperties = {
    borderBottom: "1px solid #f3f4f6", padding: "10px 12px", color: "#374151", textAlign: dir === "rtl" ? "right" : "left",
  };

  const handleCreate = async () => {
    if (limitReached) {
      toast.error(t("users.emp.limit_reached"));
      return;
    }
    setCreating(true);
    try {
      await createFn({ data: { name, email, password, first_name: firstName || undefined, last_name: lastName || undefined, phone: phone || undefined } });
      toast.success(t("users.emp.created"));
      qc.invalidateQueries({ queryKey: ["employees"] });
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("EMPLOYEE_LIMIT_REACHED")) {
        toast.error(t("users.emp.limit_reached"));
      } else {
        toast.error(msg || t("users.emp.create_failed"));
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3" dir={dir}>
      <div className="flex items-center gap-3">
        <PageHeader title={t("users.page.employees_title")} />
        <span
          className={`border px-2 py-0.5 text-xs ${
            limitReached
              ? "text-red-600 border-red-400 bg-red-50"
              : "border-gray-300 bg-[#e9e9e9] text-gray-700"
          }`}
        >
          {t("users.emp.count", { count })}
        </span>
      </div>

      {!isLoading && !limitReached && (
        <DataCard>
          <div className="space-y-3 text-start">
            <h3 className="text-base font-semibold" style={{ color: "#111827" }}>{t("users.emp.create_title")}</h3>
            <p className="text-sm" style={{ color: "#6b7280" }}>
              {t("users.emp.remaining", { n: 10 - count })}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>{t("users.emp.name")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>الاسم الأول</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <Label>اسم العائلة</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div>
                <Label>رقم الهاتف</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <Label>{t("users.emp.email")}</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label>{t("users.emp.password")}</Label>
                <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
            <Button
              onClick={handleCreate}
              disabled={creating || limitReached}
              style={{
                cursor: limitReached ? "not-allowed" : undefined,
                opacity: limitReached ? 0.5 : undefined,
              }}
              title={limitReached ? t("users.emp.limit_title") : undefined}
            >
              {creating ? t("users.emp.creating") : t("users.emp.create_btn")}
            </Button>
          </div>
        </DataCard>
      )}

      <DataCard>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>{t("users.emp.name")}</th>
                <th style={th}>{t("users.emp.email")}</th>
                <th style={th}>رقم الهاتف</th>
                <th style={th}>{t("users.table.status")}</th>
                <th style={th}>{t("users.emp.col_opt")}</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e: any) => (
                <tr key={e.id}>
                  <td style={td}>{[e.first_name, e.last_name].filter(Boolean).join(" ") || e.name}</td>
                  <td style={td}>{e.email}</td>
                  <td style={td}>{e.phone || "—"}</td>
                  <td style={td}>{e.status}</td>
                  <td style={td}>
                    <div className="flex gap-2 flex-wrap">
                      <Link to="/employees/$id/permissions" params={{ id: e.id }}>
                        <Button size="sm" variant="outline">
                          تعديل الصلاحيات
                        </Button>
                      </Link>
                      <Button size="sm" variant="outline" onClick={() => setEditingInfo(e)}>
                        تعديل
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                          if (!confirm(`سيتم حذف الموظف "${e.name}" نهائياً. متابعة؟`)) return;
                          try {
                            await deleteFn({ data: { id: e.id } });
                            toast.success("تم حذف الموظف");
                            qc.invalidateQueries({ queryKey: ["employees"] });
                            qc.invalidateQueries({ queryKey: ["employees-map"] });
                            qc.invalidateQueries({ queryKey: ["soft-deletes"] });
                          } catch (err: any) {
                            toast.error(err?.message || "فشل الحذف");
                          }
                        }}
                      >
                        حذف
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td style={td} colSpan={5} className="text-center" >
                    {t("users.emp.none_yet")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DataCard>

      <PermissionsDialog
        employee={editing}
        onClose={() => setEditing(null)}
        onSubmit={(permissions) => {
          if (!editing) return;
          updatePerms.mutate(
            { id: editing.id, permissions },
            { onSuccess: () => setEditing(null) }
          );
        }}
      />

      <EditEmployeeDialog
        employee={editingInfo}
        onClose={() => setEditingInfo(null)}
        onSubmit={async (payload) => {
          try {
            await updateFn({ data: payload });
            toast.success("تم تحديث الموظف");
            qc.invalidateQueries({ queryKey: ["employees"] });
            setEditingInfo(null);
          } catch (e: any) {
            toast.error(e?.message || "فشل التحديث");
          }
        }}
      />

    </div>
  );
}

function EditEmployeeDialog({
  employee, onClose, onSubmit,
}: {
  employee: any | null;
  onClose: () => void;
  onSubmit: (data: {
    id: string; name: string; email: string;
    first_name?: string | null; last_name?: string | null; phone?: string | null;
    password?: string;
  }) => void | Promise<void>;
}) {
  const { dir } = useI18n();
  const updateSalary = useUpdateEmployeeSalary();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [basicSalary, setBasicSalary] = useState(0);
  const [workingHours, setWorkingHours] = useState(8);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (employee) {
      setName(employee.name || "");
      setEmail(employee.email || "");
      setFirstName(employee.first_name || "");
      setLastName(employee.last_name || "");
      setPhone(employee.phone || "");
      setBasicSalary(Number(employee.basic_salary || 0));
      setWorkingHours(Number(employee.working_hours || 8));
      setPassword("");
    }
  }, [employee]);

  const open = !!employee;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir={dir}>
        <DialogHeader>
          <DialogTitle>تعديل بيانات الموظف</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>الاسم</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>الاسم الأول</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label>اسم العائلة</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>رقم الهاتف</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label>البريد</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>الراتب الأساسي</Label>
              <Input type="number" value={basicSalary} onChange={(e) => setBasicSalary(Number(e.target.value || 0))} />
            </div>
            <div>
              <Label>ساعات العمل اليومية</Label>
              <Input type="number" value={workingHours} onChange={(e) => setWorkingHours(Number(e.target.value || 8))} />
            </div>
          </div>
          <div>
            <Label>كلمة المرور (اتركها فارغة لعدم التغيير)</Label>
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            disabled={saving}
            onClick={async () => {
              if (!employee) return;
              setSaving(true);
              try {
                await onSubmit({
                  id: employee.id,
                  name, email,
                  first_name: firstName || null,
                  last_name: lastName || null,
                  phone: phone || null,
                  password: password || undefined,
                });
                await updateSalary.mutateAsync({ id: employee.id, basic_salary: basicSalary, working_hours: workingHours });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "جارٍ الحفظ..." : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermissionsDialog({
  employee, onClose, onSubmit,
}: {
  employee: any | null;
  onClose: () => void;
  onSubmit: (p: EmployeePermissions) => void;
}) {
  const { t, dir } = useI18n();
  const PERM_LABELS: { key: keyof EmployeePermissions; label: string }[] = [
    { key: "products", label: t("users.emp.perm.products") },
    { key: "sales", label: t("users.emp.perm.sales") },
    { key: "purchases", label: t("users.emp.perm.purchases") },
    { key: "contacts", label: t("users.emp.perm.contacts") },
    { key: "reports", label: t("users.emp.perm.reports") },
    { key: "settings", label: t("users.emp.perm.settings") },
  ];

  const CASHIER_LABELS: { key: keyof CashierPermissions; label: string }[] = [
    { key: "view_sales", label: "عرض مبيعات الكاشير" },
    { key: "add_sales", label: "إضافة مبيعات الكاشير" },
    { key: "edit_sales", label: "تعديل مبيعات الكاشير" },
    { key: "delete_sales", label: "حذف مبيعات الكاشير" },
    { key: "invoice_discount", label: "خصم على الفاتورة" },
    { key: "edit_item_price", label: "تعديل سعر الصنف من شاشة POS" },
    { key: "edit_item_discount", label: "تعديل خصم الصنف من شاشة POS" },
    { key: "delete_invoice", label: "حذف/إلغاء فاتورة بعد الحفظ" },
    { key: "manage_shift", label: "فتح/قفل الوردية" },
  ];

  const DEFAULT_CASHIER: CashierPermissions = {
    view_sales: true, add_sales: true, edit_sales: false, delete_sales: false,
    invoice_discount: true, edit_item_price: false, edit_item_discount: true,
    delete_invoice: false, manage_shift: true, sell_on_credit: false,
  };

  const [perms, setPerms] = useState<EmployeePermissions>({
    products: true, sales: true, purchases: true, contacts: true, reports: false, settings: false,
    cashier: DEFAULT_CASHIER,
  });

  useEffect(() => {
    if (employee) {
      const raw = employee.permissions ?? {};
      setPerms({
        products: raw.products ?? true,
        sales: raw.sales ?? true,
        purchases: raw.purchases ?? true,
        contacts: raw.contacts ?? true,
        reports: raw.reports ?? false,
        settings: raw.settings ?? false,
        cashier: { ...DEFAULT_CASHIER, ...(raw.cashier ?? {}) },
      });
    }
  }, [employee]);

  const open = !!employee;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir={dir} className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("users.emp.perm_title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 py-2">
          {PERM_LABELS.map(({ key, label }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4 py-2 border-b last:border-0"
            >
              <Label htmlFor={`perm-${key}`} className="text-sm font-medium">
                {label}
              </Label>
              <Switch
                id={`perm-${key}`}
                checked={!!perms[key as keyof Omit<EmployeePermissions, "cashier">]}
                onCheckedChange={(v) => setPerms((p) => ({ ...p, [key]: v }))}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 border rounded p-3 bg-muted/30">
          <h4 className="text-sm font-bold mb-2">صلاحيات شاشة الكاشير (POS)</h4>
          <div className="space-y-1">
            {CASHIER_LABELS.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between gap-4 py-1.5 border-b last:border-0">
                <Label htmlFor={`cperm-${key}`} className="text-sm">{label}</Label>
                <Switch
                  id={`cperm-${key}`}
                  checked={!!perms.cashier[key]}
                  onCheckedChange={(v) => setPerms((p) => ({ ...p, cashier: { ...p.cashier, [key]: v } }))}
                />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("users.actions.cancel")}</Button>
          <Button onClick={() => onSubmit(perms)}>{t("users.actions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
