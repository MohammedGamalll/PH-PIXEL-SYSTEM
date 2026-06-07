import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCurrentEmployee } from "@/hooks/use-current-employee";
import {
  getYearEndStatus,
  getYearEndDebtPreview,
  executeYearEndReset,
} from "@/lib/year-end.functions";
import { exportBackup, importBackup } from "@/lib/backup.functions";

export const Route = createFileRoute("/_authenticated/system")({
  component: SystemPage,
});

function SystemPage() {
  const { isEmployee } = useCurrentEmployee();
  if (isEmployee) {
    return <div className="p-6 text-red-600">هذه الصفحة للأدمن فقط</div>;
  }
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto" dir="rtl">
      <h1 className="text-2xl font-bold">إدارة النظام</h1>
      <YearEndCard />
      <BackupCard />
    </div>
  );
}

function YearEndCard() {
  const fetchStatus = getYearEndStatus;
  const fetchDebts = getYearEndDebtPreview;
  const runReset = executeYearEndReset;
  const [status, setStatus] = useState<any>(null);
  const [debts, setDebts] = useState<any[]>([]);
  const [step, setStep] = useState(0);
  const [confirmText, setConfirmText] = useState("");
  const [carryOver, setCarryOver] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStatus().then(setStatus).catch(() => {});
  }, []);

  const startWizard = async () => {
    setLoading(true);
    try {
      const r = await fetchDebts();
      setDebts(r.debts);
      setStep(1);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const execute = async () => {
    if (confirmText !== "نعم أؤكد إقفال السنة") {
      toast.error("نص التأكيد غير صحيح");
      return;
    }
    setLoading(true);
    try {
      const r = await runReset({ data: { confirmText, carryOverDebts: carryOver } } as any);
      toast.success(`تم إقفال سنة ${r.year}`);
      setStep(0);
      const s = await fetchStatus();
      setStatus(s);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-lg p-5 bg-white shadow-sm">
      <h2 className="text-lg font-bold mb-2">إقفال السنة المالية</h2>
      <p className="text-sm text-gray-600 mb-4">
        يحذف الفواتير والمصاريف وحركات الخزينة والقيود ويحتفظ بالمنتجات والعملاء والإعدادات.
      </p>
      {status && (
        <div className="text-sm mb-3">
          <div>السنة الحالية (السيرفر): <b>{status.serverYear}</b></div>
          <div>الشهر: <b>{status.serverMonth}</b></div>
          {status.alreadyClosed && (
            <div className="text-amber-600">تم إقفال هذه السنة بالفعل</div>
          )}
          {!status.canRun && !status.alreadyClosed && (
            <div className="text-amber-600">الإقفال السنوي متاح فقط في ديسمبر</div>
          )}
          {status.closures?.length > 0 && (
            <div className="mt-2 text-xs text-gray-500">
              إقفالات سابقة: {status.closures.map((c: any) => c.year).join(", ")}
            </div>
          )}
        </div>
      )}

      {step === 0 && (
        <button
          onClick={startWizard}
          disabled={!status?.canRun || loading}
          className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
        >
          بدء إقفال السنة
        </button>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <h3 className="font-semibold">المديونيات الحالية ({debts.length})</h3>
          {debts.length === 0 ? (
            <p className="text-sm text-gray-500">لا توجد مديونيات</p>
          ) : (
            <div className="max-h-60 overflow-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-right">الاسم</th>
                    <th className="p-2 text-right">النوع</th>
                    <th className="p-2 text-right">المديونية</th>
                  </tr>
                </thead>
                <tbody>
                  {debts.map((d, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{d.name}</td>
                      <td className="p-2">{d.contact_type}</td>
                      <td className="p-2">{d.due.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={carryOver}
              onChange={(e) => setCarryOver(e.target.checked)}
            />
            ترحيل المديونيات كرصيد افتتاحي للسنة الجديدة
          </label>
          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="px-4 py-2 bg-blue-600 text-white rounded">
              التالي
            </button>
            <button onClick={() => setStep(0)} className="px-4 py-2 bg-gray-200 rounded">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-red-700 font-bold">
            تحذير: هذه عملية لا يمكن التراجع عنها. سيتم حذف كل الفواتير والقيود والمصاريف.
          </p>
          <p className="text-sm">للتأكيد، اكتب: <b>نعم أؤكد إقفال السنة</b></p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full border rounded p-2 text-sm"
            placeholder="نص التأكيد"
          />
          <div className="flex gap-2">
            <button
              onClick={execute}
              disabled={loading}
              className="px-4 py-2 bg-red-700 text-white rounded disabled:opacity-50"
            >
              تنفيذ الإقفال
            </button>
            <button onClick={() => setStep(1)} className="px-4 py-2 bg-gray-200 rounded">
              رجوع
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BackupCard() {
  const doExport = exportBackup;
  const doImport = importBackup;
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");

  const handleExport = async () => {
    setBusy(true);
    try {
      const r = await doExport();
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير النسخة الاحتياطية");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (file: File) => {
    if (mode === "replace") {
      if (!confirm("سيتم حذف كل البيانات الحالية واستبدالها. هل أنت متأكد؟")) return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const r = await doImport({ data: { payload, mode } } as any);
      toast.success(`تم استيراد النسخة (${Object.keys(r.summary).length} جدول)`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="border rounded-lg p-5 bg-white shadow-sm">
      <h2 className="text-lg font-bold mb-2">النسخ الاحتياطي</h2>
      <p className="text-sm text-gray-600 mb-4">
        تصدير كل بياناتك إلى ملف JSON أو استيرادها من ملف سابق.
      </p>
      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={handleExport}
          disabled={busy}
          className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
        >
          تصدير نسخة احتياطية
        </button>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as any)}
          className="border rounded p-2 text-sm"
        >
          <option value="merge">دمج (upsert)</option>
          <option value="replace">استبدال كامل</option>
        </select>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
          }}
          disabled={busy}
          className="text-sm"
        />
      </div>
    </div>
  );
}
