import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { PermissionsMatrix } from "@/components/users/PermissionsMatrix";
import {
  defaultEmployeePermissions,
  mergeEmployeePermissions,
  type EmployeePermissionsV2,
} from "@/lib/permissions";

type EmployeeCreatePayload = {
  name: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  permissions: EmployeePermissionsV2;
};

type Props = {
  creating?: boolean;
  defaultEmail?: string;
  onSubmit: (payload: EmployeeCreatePayload) => Promise<void> | void;
};

export function EmployeeCreateWizard({ creating = false, defaultEmail = "", onSubmit }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("موظف جديد");
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("Emp@2026");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [permissions, setPermissions] = useState<EmployeePermissionsV2>(defaultEmployeePermissions());

  const canContinue =
    name.trim().length > 1 &&
    email.trim().length > 3 &&
    password.trim().length >= 6;

  const resetWizard = () => {
    setStep(1);
    setName("موظف جديد");
    setEmail(defaultEmail);
    setPassword("Emp@2026");
    setFirstName("");
    setLastName("");
    setPhone("");
    setPermissions(defaultEmployeePermissions());
  };

  const submit = async () => {
    const safeDefaults = defaultEmployeePermissions();
    await onSubmit({
      name: name.trim(),
      email: email.trim(),
      password,
      first_name: firstName.trim() || undefined,
      last_name: lastName.trim() || undefined,
      phone: phone.trim() || undefined,
      permissions: mergeEmployeePermissions(safeDefaults, permissions),
    });
    resetWizard();
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">إضافة موظف جديد</h3>
        <span className="text-xs text-muted-foreground">
          {step === 1 ? "الخطوة 1/2: بيانات الموظف" : "الخطوة 2/2: الصلاحيات"}
        </span>
      </div>

      {step === 1 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>الاسم</Label>
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
            <Label>البريد الإلكتروني</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>كلمة المرور</Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <PermissionsMatrix value={permissions} onChange={setPermissions} />
      )}

      <div className="flex items-center justify-end gap-2">
        {step === 2 && (
          <Button variant="outline" onClick={() => setStep(1)} disabled={creating}>
            رجوع
          </Button>
        )}
        {step === 1 ? (
          <Button onClick={() => setStep(2)} disabled={!canContinue || creating}>
            التالي: الصلاحيات
          </Button>
        ) : (
          <Button onClick={submit} disabled={creating}>
            {creating ? "جارٍ الإنشاء..." : "إنشاء الموظف"}
          </Button>
        )}
      </div>
    </Card>
  );
}
