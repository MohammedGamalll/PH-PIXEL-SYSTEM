import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSettings } from "@/contexts/SettingsContext";
import { useI18n } from "@/lib/i18n";

import { wipeAllAdminData } from "@/lib/admin-data.functions";
import { useCurrentEmployee } from "@/hooks/use-current-employee";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});


function SettingsPage() {
  const { t, dir } = useI18n();
  const { settings, loading, save } = useSettings();
  const { isEmployee } = useCurrentEmployee();
  const [taxNumber, setTaxNumber] = useState("");
  const [currencySymbol, setCurrencySymbol] = useState("ج.م");
  const [currencyPlacement, setCurrencyPlacement] = useState<"before" | "after">("before");
  const [enableExpiry, setEnableExpiry] = useState(false);
  const [navBg, setNavBg] = useState("#166534");
  const [navText, setNavText] = useState("#ffffff");
  const [sidebarBg, setSidebarBg] = useState("#166534");
  const [sidebarText, setSidebarText] = useState("#ffffff");
  const [sidebarBizColor, setSidebarBizColor] = useState("#ffffff");
  const [saving, setSaving] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState("");
  const [wiping, setWiping] = useState(false);

  useEffect(() => {
    setTaxNumber(settings.tax_number || "");
    setCurrencySymbol(settings.currency_symbol || "ج.م");
    setCurrencyPlacement(settings.currency_placement);
    setEnableExpiry(settings.enable_expiry_dates);
    setNavBg(settings.nav_bg);
    setNavText(settings.nav_text);
    setSidebarBg(settings.sidebar_bg);
    setSidebarText(settings.sidebar_text);
    setSidebarBizColor(settings.sidebar_business_name_color || settings.sidebar_text);
  }, [settings]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await save({
        tax_number: taxNumber.trim() || null,
        currency_symbol: currencySymbol.trim() || "ج.م",
        currency_placement: currencyPlacement,
        enable_expiry_dates: enableExpiry,
        nav_bg: navBg,
        nav_text: navText,
        sidebar_bg: sidebarBg,
        sidebar_text: sidebarText,
        sidebar_business_name_color: sidebarBizColor,
      });
      toast.success(t("settings.save_success"));
    } catch (err: any) {
      toast.error(err?.message || t("settings.save_error"));
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full border border-gray-400 bg-white px-2 py-1.5 text-sm rounded-sm focus:outline-none focus:border-blue-500";

  return (
    <div dir={dir} className="min-h-full" style={{ backgroundColor: "#e9e9e9" }}>
      <div className="max-w-2xl mx-auto">
        {!isEmployee && (
          <div className="border border-gray-300 bg-white shadow-sm mb-3">
            <div className="border-b border-gray-300 bg-[#f0f0f0] px-4 py-2 text-sm font-semibold text-gray-800">
              إدارة النظام
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-700 mb-3">
                إعادة حساب المخزون، إقفال السنة المالية، النسخ الاحتياطي والاستعادة.
              </p>
              <a
                href="/system"
                className="inline-block px-4 py-2 rounded text-white text-sm"
                style={{ backgroundColor: "#3b82f6" }}
              >
                فتح إدارة النظام
              </a>
            </div>
          </div>
        )}
        <div className="border border-gray-300 bg-white shadow-sm">
          <div className="border-b border-gray-300 bg-[#f0f0f0] px-4 py-2 text-sm font-semibold text-gray-800">
            {t("settings.page.title")}
          </div>


          {loading ? (
            <div className="p-6 text-center text-sm text-gray-500">{t("settings.loading")}</div>
          ) : (
            <form onSubmit={onSubmit} className="p-5 space-y-5">
              <div>
                <label className="block text-sm text-gray-700 mb-1">{t("settings.business_name")}</label>
                <div className="border border-gray-300 bg-gray-100 px-2 py-1.5 text-sm rounded-sm text-gray-700">
                  {settings.business_name}
                </div>
                <p className="text-xs text-gray-500 mt-1">{t("settings.business_name_locked")}</p>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">{t("settings.tax_number")}</label>
                <input
                  type="text"
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                  className={inputCls}
                  placeholder={t("settings.tax_number_placeholder")}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{t("settings.currency_symbol")}</label>
                  <input
                    type="text"
                    value={currencySymbol}
                    onChange={(e) => setCurrencySymbol(e.target.value)}
                    className={inputCls}
                    placeholder="ج.م"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">{t("settings.currency_placement")}</label>
                  <div className="flex items-center gap-4 pt-1.5">
                    <label className="flex items-center gap-1.5 text-sm">
                      <input
                        type="radio"
                        name="placement"
                        checked={currencyPlacement === "before"}
                        onChange={() => setCurrencyPlacement("before")}
                      />
                      {t("settings.placement.before")}
                    </label>
                    <label className="flex items-center gap-1.5 text-sm">
                      <input
                        type="radio"
                        name="placement"
                        checked={currencyPlacement === "after"}
                        onChange={() => setCurrencyPlacement("after")}
                      />
                      {t("settings.placement.after")}
                    </label>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableExpiry}
                    onChange={(e) => setEnableExpiry(e.target.checked)}
                  />
                  {t("settings.enable_expiry")}
                </label>
              </div>

              {/* ألوان الواجهة */}
              <div className="border-t border-gray-200 pt-4">
                <div className="text-sm font-semibold text-gray-800 mb-3">ألوان الواجهة</div>
                <div className="grid grid-cols-2 gap-3">
                  <ColorRow label="خلفية شريط القوائم العلوي" value={navBg} onChange={setNavBg} />
                  <ColorRow label="لون النص في الشريط العلوي" value={navText} onChange={setNavText} />
                  <ColorRow label="خلفية القائمة الجانبية" value={sidebarBg} onChange={setSidebarBg} />
                  <ColorRow label="لون النص في القائمة الجانبية" value={sidebarText} onChange={setSidebarText} />
                  <ColorRow label="لون اسم الصيدلية في القائمة الجانبية" value={sidebarBizColor} onChange={setSidebarBizColor} />
                </div>
                <div className="mt-3 rounded-sm overflow-hidden border border-gray-300">
                  <div className="px-3 py-2 text-sm font-semibold" style={{ backgroundColor: navBg, color: navText }}>
                    معاينة الشريط العلوي
                  </div>
                  <div className="flex">
                    <div className="w-40 p-3 text-sm" style={{ backgroundColor: sidebarBg, color: sidebarText, fontFamily: "Tahoma, 'Segoe UI', sans-serif" }}>
                      <div>الرئيسية</div>
                      <div className="mt-1 opacity-80">المبيعات</div>
                      <div className="mt-1 opacity-80">المشتريات</div>
                    </div>
                    <div className="flex-1 bg-white p-3 text-xs text-gray-500">محتوى الصفحة</div>
                  </div>
                </div>
              </div>



              <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 text-sm border border-gray-400 bg-gradient-to-b from-[#f8f8f8] to-[#dcdcdc] hover:from-[#fff] hover:to-[#e8e8e8] active:from-[#dcdcdc] active:to-[#f8f8f8] rounded-sm disabled:opacity-60"
                >
                  {saving ? t("settings.saving") : t("settings.save")}
                </button>
              </div>
            </form>
          )}
        </div>

        {!isEmployee && (
          <div className="border border-red-300 bg-white shadow-sm mt-6">
            <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
              منطقة الخطر
            </div>
            <div className="p-5 flex items-start justify-between gap-4">
              <div className="text-sm text-gray-700">
                <div className="font-semibold text-gray-900 mb-1">مسح جميع البيانات</div>
                <div className="text-xs text-gray-600 leading-relaxed">
                  يحذف جميع بيانات النشاط (المبيعات، المشتريات، المنتجات، العملاء، الموردين،
                  المصاريف، الحسابات، القيود، الموظفين). الإعدادات وحسابك الشخصي لن تُمسح.
                  <br />
                  <span className="text-red-600 font-semibold">هذا الإجراء لا يمكن التراجع عنه.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setWipeConfirm(""); setWipeOpen(true); }}
                className="shrink-0 px-4 py-1.5 text-sm border border-red-600 bg-gradient-to-b from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white rounded-sm"
              >
                مسح جميع البيانات
              </button>
            </div>
          </div>
        )}
      </div>

      {wipeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir={dir}>
          <div className="bg-white border border-gray-400 shadow-xl w-full max-w-md rounded-sm">
            <div className="border-b border-gray-300 bg-[#f0f0f0] px-4 py-2 text-sm font-semibold text-red-700">
              تأكيد المسح الكامل
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-800 leading-relaxed">
                سيتم حذف كل بيانات النشاط نهائياً (مبيعات، مشتريات، منتجات، عملاء، موردين، مصاريف،
                حسابات مالية، قيود، موظفين). هذا الإجراء لا يمكن التراجع عنه.
              </p>
              <p className="text-sm text-gray-700">
                للتأكيد، اكتب كلمة <span className="font-mono font-bold text-red-700">مسح</span> في الحقل أدناه:
              </p>
              <input
                type="text"
                value={wipeConfirm}
                onChange={(e) => setWipeConfirm(e.target.value)}
                disabled={wiping}
                className="w-full border border-gray-400 bg-white px-2 py-1.5 text-sm rounded-sm focus:outline-none focus:border-red-500"
                placeholder="اكتب: مسح"
                autoFocus
              />
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
                <button
                  type="button"
                  disabled={wiping}
                  onClick={() => setWipeOpen(false)}
                  className="px-4 py-1.5 text-sm border border-gray-400 bg-gradient-to-b from-[#f8f8f8] to-[#dcdcdc] hover:from-[#fff] hover:to-[#e8e8e8] rounded-sm disabled:opacity-60"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={wiping || wipeConfirm.trim() !== "مسح"}
                  onClick={async () => {
                    setWiping(true);
                    try {
                      const res = await wipeAllAdminData();
                      toast.success(`تم مسح جميع البيانات${res.deletedEmployees ? ` (وحذف ${res.deletedEmployees} موظف)` : ""}`);
                      setWipeOpen(false);
                      setTimeout(() => window.location.reload(), 600);
                    } catch (err: any) {
                      toast.error(err?.message || "فشل مسح البيانات");
                      setWiping(false);
                    }
                  }}
                  className="px-4 py-1.5 text-sm border border-red-600 bg-gradient-to-b from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white rounded-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {wiping ? "جارٍ المسح..." : "تأكيد المسح"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded-sm border border-gray-400 bg-white p-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 border border-gray-400 bg-white px-2 py-1 text-xs font-mono rounded-sm focus:outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
}
