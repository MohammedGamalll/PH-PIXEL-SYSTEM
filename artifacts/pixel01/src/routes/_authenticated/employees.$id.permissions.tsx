import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUpdateEmployeePermissions } from "@/hooks/use-employees";
import { PermissionsMatrix } from "@/components/users/PermissionsMatrix";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/products/PageHeader";
import { ArrowRight, Save, RotateCcw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import type { EmployeePermissionsV2 } from "@/lib/permissions";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/_authenticated/employees/$id/permissions")({
  parseParams: ({ id }) => {
    if (!UUID_RE.test(id)) {
      throw new Error("معرّف الموظف غير صالح");
    }
    return { id };
  },
  component: EmployeePermissionsPage,
  errorComponent: ({ error }) => (
    <Card className="p-8 text-center text-destructive">
      {error?.message ?? "حدث خطأ أثناء تحميل الصفحة"}
    </Card>
  ),
  notFoundComponent: () => (
    <Card className="p-8 text-center text-muted-foreground">
      الموظف غير موجود
    </Card>
  ),
});

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

function EmployeePermissionsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { dir } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const updatePerms = useUpdateEmployeePermissions();

  const { data: employee, isLoading } = useQuery({
    queryKey: ["employee", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees" as any)
        .select("*")
        .eq("id", id)
        .eq("admin_id", user!.id) // tenant-scope; RLS is the backstop
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const initial = useMemo<EmployeePermissionsV2>(() => {
    return (employee?.permissions ?? {}) as EmployeePermissionsV2;
  }, [employee]);

  const [perms, setPerms] = useState<EmployeePermissionsV2>(initial);
  // Tracks the snapshot the user is editing against — only changes on save or initial load.
  const baselineRef = useRef<EmployeePermissionsV2>(initial);
  const hydratedRef = useRef(false);

  // Hydrate once when data first arrives; never overwrite unsaved local edits
  // on background refetches.
  useEffect(() => {
    if (!employee) return;
    if (!hydratedRef.current) {
      setPerms(initial);
      baselineRef.current = initial;
      hydratedRef.current = true;
    }
  }, [employee, initial]);

  const isDirty = !deepEqual(perms, baselineRef.current);

  // Warn on browser tab close with unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const employeeName =
    [employee?.first_name, employee?.last_name].filter(Boolean).join(" ") ||
    employee?.name ||
    employee?.email ||
    "موظف";

  const handleSave = () => {
    // Preserve any legacy/unknown keys present on the server record by merging
    // the matrix output on top of the original payload.
    const merged = {
      ...(employee?.permissions ?? {}),
      ...perms,
    } as EmployeePermissionsV2;

    updatePerms.mutate(
      { id, permissions: merged as any },
      {
        onSuccess: () => {
          baselineRef.current = perms;
          qc.invalidateQueries({ queryKey: ["employee", id] });
          toast.success("تم حفظ الصلاحيات");
        },
      },
    );
  };

  const handleReset = () => {
    setPerms(baselineRef.current);
  };

  return (
    <div className="space-y-4" dir={dir}>
      <div className="flex items-center justify-between gap-3 flex-wrap pb-3 sm:pb-4 border-b" style={{ borderColor: "#e5e7eb" }}>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (
                isDirty &&
                !window.confirm("لديك تغييرات غير محفوظة. هل تريد المغادرة؟")
              ) {
                return;
              }
              navigate({ to: "/users/employees" });
            }}
          >
            <ArrowRight className="h-4 w-4 ms-1" />
            رجوع
          </Button>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold truncate" style={{ color: "#111827" }}>
            {`صلاحيات الموظف: ${employeeName}`}
          </h1>
          {isDirty && (
            <span className="text-xs px-2 py-1 rounded bg-[var(--badge-warning-bg)] text-[var(--badge-warning-fg)] border border-[var(--badge-warning-border)]">
              غير محفوظ
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!isDirty || updatePerms.isPending}
          >
            <RotateCcw className="h-4 w-4 ms-1" />
            إعادة تعيين
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || updatePerms.isPending}
          >
            <Save className="h-4 w-4 ms-1" />
            {updatePerms.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center text-muted-foreground">جاري التحميل...</Card>
      ) : !employee ? (
        <Card className="p-8 text-center text-destructive">
          الموظف غير موجود أو ليس لديك صلاحية الوصول إليه
        </Card>
      ) : (
        <PermissionsMatrix value={perms} onChange={setPerms} />
      )}
    </div>
  );
}
