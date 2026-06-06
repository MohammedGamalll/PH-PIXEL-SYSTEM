import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { EntityDialog, type FieldDef } from "@/components/products/EntityDialog";
import {
  useBrands, useCategories, usePriceGroups, useWarranties,
  useCreateBrand, useCreateCategory,
} from "@/hooks/use-product-meta";
import { useSettings } from "@/contexts/SettingsContext";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UnitTreeFields, emptyUnitTree, unitTreeToDb, type UnitTreeValue } from "@/components/products/UnitTreeFields";
import { useI18n } from "@/lib/i18n";
import { useUnsavedChangesPrompt } from "@/hooks/use-unsaved-prompt";


const productSchema = z.object({
  name: z.string().trim().min(1, "اسم المنتج مطلوب").max(200, "الاسم أطول من 200 حرف"),
  name_en: z.string().trim().max(200).optional().or(z.literal("")),
  sku: z.string().trim().max(50, "SKU أطول من 50 حرف").regex(/^[a-zA-Z0-9_-]*$/, "SKU يقبل حروف وأرقام وشرطة فقط").optional().or(z.literal("")),
  price: z.number().min(0, "السعر لا يمكن أن يكون سالباً"),
  cost: z.number().min(0, "التكلفة لا يمكن أن تكون سالبة"),
});

export const Route = createFileRoute("/_authenticated/products/add")({ component: AddProductPage });

const BLUE = "#3b82f6";
const PINK = "#db2777";
const INDIGO = "#6366f1";
const RED = "#ef4444";
const GREEN = "#22c55e";
const DARK = "#111827";

const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db", backgroundColor: "#ffffff",
  borderRadius: 6, height: 38, padding: "0 10px", width: "100%", fontSize: 14, outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 13, color: "#374151", marginBottom: 4, display: "block" };

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}{required && <span style={{ color: RED }}>*</span>}</label>
      {children}
    </div>
  );
}


function AddProductPage() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const { t, dir } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const categoryFields: FieldDef[] = [
    { type: "text", key: "name", label: t("products.categories.name"), required: true },
    { type: "text", key: "code", label: t("products.categories.code") },
    { type: "textarea", key: "description", label: t("products.categories.desc") },
    { type: "checkbox", key: "has_sub_category", label: t("products.categories.has_sub") },
  ];
  const brandFields: FieldDef[] = [
    { type: "text", key: "name", label: t("products.brands.name"), required: true },
    { type: "text", key: "description", label: t("products.brands.desc") },
    { type: "checkbox", key: "use_for_repair", label: t("products.brands.use_for_repair") },
  ];

  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [sku, setSku] = useState("");
  const [barcodeType, setBarcodeType] = useState("Code 128 (C128)");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [warrantyId, setWarrantyId] = useState("");
  const [hasExpiry, setHasExpiry] = useState(false);
  const [manageStock, setManageStock] = useState(true);
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("0");
  const [unitTree, setUnitTree] = useState<UnitTreeValue>(emptyUnitTree);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!imageFile) { setImageUrl(""); return; }
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const { data: categories = [] } = useCategories();
  const { data: brands = [] } = useBrands();
  const { data: priceGroups = [] } = usePriceGroups();
  const { data: warranties = [] } = useWarranties();
  const { settings } = useSettings();
  const createCategory = useCreateCategory();
  const createBrand = useCreateBrand();


  const [catDlg, setCatDlg] = useState(false);
  const [brandDlg, setBrandDlg] = useState(false);
  const [pgDlg, setPgDlg] = useState(false);
  const [pgPrices, setPgPrices] = useState<Record<string, string>>({});

  // Unsaved-changes guard
  const submittedRef = useRef(false);
  const baselineRef = useRef<string>(JSON.stringify({
    name: "", nameEn: "", sku: "", barcodeType: "Code 128 (C128)",
    categoryId: "", brandId: "", warrantyId: "", hasExpiry: false,
    manageStock: true, cost: "", price: "", lowStockThreshold: "0",
    unitTree: emptyUnitTree, pgPrices: {}, hasImage: false,
  }));
  const dirtySnap = JSON.stringify({
    name, nameEn, sku, barcodeType,
    categoryId, brandId, warrantyId, hasExpiry,
    manageStock, cost, price, lowStockThreshold,
    unitTree, pgPrices, hasImage: !!imageFile,
  });
  useUnsavedChangesPrompt(() => !submittedRef.current && dirtySnap !== baselineRef.current);

  const create = useMutation({
    mutationFn: async () => {
      if (!ownerId) throw new Error("جاري تجهيز الحساب، حاول مرة أخرى بعد ثانية");
      const trimmedSku = sku.trim().slice(0, 50);
      const effectiveOwnerId = ownerId;
      if (trimmedSku) {
        const { data: dup } = await (supabase.from("products") as any)
          .select("id,name").eq("owner_id", effectiveOwnerId).ilike("sku", trimmedSku).maybeSingle();
        if (dup) throw new Error(`الكود "${trimmedSku}" مستخدم بالفعل في الصنف: ${dup.name}`);
      }
      const tree = unitTreeToDb(unitTree);
      let uploadedUrl: string | null = null;
      if (imageFile && user) {
        const ext = imageFile.name.split(".").pop() || "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("product-images").upload(path, imageFile, { upsert: false });
        if (upErr) throw upErr;
        uploadedUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      }
      const selectedWh: Array<[string, { qty: string }]> = [];
      const totalBaseStock = 0;
      const { data: inserted, error } = await (supabase.from("products") as any).insert({
        name: name.trim().slice(0, 100),
        name_en: nameEn.trim().slice(0, 100) || null,
        sku: trimmedSku || null,
        price: Number(price || 0),
        cost: Number(cost || 0),
        stock: totalBaseStock,
        unit: tree.main_unit || "pcs",
        category_id: categoryId || null,
        brand_id: brandId || null,
        warranty_id: warrantyId || null,
        has_expiry: hasExpiry,
        low_stock_threshold: Number(lowStockThreshold) || 0,
        image_url: uploadedUrl,
        owner_id: effectiveOwnerId,
        ...tree,
      }).select("id").single();
      if (error) {
        if ((error as any).code === "23505") {
          throw new Error(`الكود "${trimmedSku}" مستخدم بالفعل في صنف آخر`);
        }
        throw error;
      }
      void selectedWh;
      const newProductId = (inserted as any)?.id;
      void newProductId;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = () => {
    setName(""); setNameEn(""); setSku(""); setCost(""); setPrice("");
    setImageFile(null); setPgPrices({}); setUnitTree(emptyUnitTree);
    setWarrantyId(""); setHasExpiry(false); setLowStockThreshold("0");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };


  const handle = async (mode: "save" | "another" | "qty") => {
    const check = productSchema.safeParse({
      name, name_en: nameEn, sku,
      price: Number(price || 0),
      cost: Number(cost || 0),
    });
    if (!check.success) { toast.error(check.error.issues[0]?.message || "بيانات غير صالحة"); return; }
    if (Number(price || 0) > 0 && Number(cost || 0) > 0 && Number(price || 0) < Number(cost || 0)) {
      toast.warning("تنبيه: سعر البيع أقل من التكلفة");
    }
    await create.mutateAsync();
    submittedRef.current = true;
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["product_warehouse_stock"] });
    qc.invalidateQueries({ queryKey: ["pws-by-warehouse"] });
    toast.success(t("products.toast.saved"));
    if (mode === "save") navigate({ to: "/products" });
    else {
      reset();
      // Reset baseline so the cleared form isn't considered dirty
      setTimeout(() => {
        submittedRef.current = false;
        baselineRef.current = JSON.stringify({
          name: "", nameEn: "", sku: "", barcodeType: "Code 128 (C128)",
          categoryId: "", brandId: "", warrantyId: "", hasExpiry: false,
          manageStock: true, cost: "", price: "", lowStockThreshold: "0",
          unitTree: emptyUnitTree, pgPrices: {}, hasImage: false,
        });
      }, 0);
      if (mode === "qty") toast.info(t("products.toast.use_opening_stock"));
    }
  };

  const plusBtn: React.CSSProperties = {
    width: 38, height: 38, borderRadius: 6, backgroundColor: BLUE, color: "#ffffff",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  };

  return (
    <div className="space-y-3 form-strong" dir={dir}>

      <PageHeader title={t("products.new_title")} />

      <DataCard>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label={t("products.form.name")} required>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("products.form.name_placeholder")} />
          </Field>
          <Field label={t("products.form.name_en")}>
            <input style={{ ...inputStyle, direction: "ltr", textAlign: "left" }} value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder={t("products.form.name_en_placeholder")} />
          </Field>
          <Field label={t("products.form.sku")}>
            <input style={inputStyle} value={sku} onChange={(e) => setSku(e.target.value)} placeholder={t("products.form.sku_placeholder")} />
          </Field>
          <Field label={t("products.form.barcode_type")} required>
            <select style={inputStyle} value={barcodeType} onChange={(e) => setBarcodeType(e.target.value)}>
              <option>Code 128 (C128)</option><option>Code 39 (C39)</option>
              <option>EAN-13</option><option>EAN-8</option><option>UPC-A</option>
            </select>
          </Field>
          <Field label={t("products.form.category")}>
            <div className="flex gap-2">
              <select style={inputStyle} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">{t("products.form.select_placeholder")}</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" onClick={() => setCatDlg(true)} style={plusBtn} aria-label="add category"><Plus className="h-4 w-4" /></button>
            </div>
          </Field>
          <Field label={t("products.form.brand")}>
            <div className="flex gap-2">
              <select style={inputStyle} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                <option value="">{t("products.form.select_placeholder")}</option>
                {brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button type="button" onClick={() => setBrandDlg(true)} style={plusBtn} aria-label="add brand"><Plus className="h-4 w-4" /></button>
            </div>
          </Field>
          <Field label={t("products.form.warranty")}>
            <select style={inputStyle} value={warrantyId} onChange={(e) => setWarrantyId(e.target.value)}>
              <option value="">{t("products.form.warranty_none")}</option>
              {(warranties as any[]).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.duration} {w.duration_unit})
                </option>
              ))}
            </select>
          </Field>
          <Field label={"حد تنبيه المخزون"}>
            <input style={inputStyle} type="number" min="0" value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)} placeholder="0" />
            <div className="text-xs mt-1" style={{ color: "#6b7280" }}>
              لما يقل المخزون عن هذا الرقم هيظهر تنبيه في لوحة المتابعة وكرت الصنف
            </div>
          </Field>
          {settings.enable_expiry_dates && (
            <div className="md:col-span-2 flex items-start gap-2">
              <input id="has-expiry" type="checkbox" checked={hasExpiry}
                onChange={(e) => setHasExpiry(e.target.checked)} style={{ marginTop: 4 }} />
              <label htmlFor="has-expiry" className="text-sm" style={{ color: "#374151" }}>
                {t("products.form.has_expiry")}
                <span className="block text-xs" style={{ color: "#6b7280" }}>
                  {t("products.form.has_expiry_hint")}
                </span>
              </label>
            </div>
          )}



          <div className="md:col-span-2">
            <label style={labelStyle}>{t("products.form.image")}</label>
            <div className="rounded-md p-4 flex flex-col items-start gap-2"
              style={{ border: "2px dashed #d1d5db", backgroundColor: "#fafafa" }}>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="h-9 px-4 rounded-md text-white text-sm" style={{ backgroundColor: BLUE }}>{t("products.form.browse")}</button>
                {imageFile && (
                  <button type="button" onClick={() => setImageFile(null)}
                    className="text-xs underline" style={{ color: RED }}>{t("products.form.remove")}</button>
                )}
              </div>
              {imageUrl && (
                <div className="w-full flex justify-center">
                  <img src={imageUrl} alt="product preview" className="object-contain"
                    style={{ maxHeight: 180, maxWidth: "100%" }} />
                </div>
              )}
              <p className="text-xs" style={{ color: RED }}>{t("products.form.image_size_hint")}</p>
              <p className="text-xs" style={{ color: "#6b7280" }}>{t("products.form.image_ratio_hint")}</p>
            </div>
          </div>

          <div className="md:col-span-2 flex items-start gap-2">
            <input id="manage-stock" type="checkbox" checked={manageStock}
              onChange={(e) => setManageStock(e.target.checked)} style={{ marginTop: 4 }} />
            <label htmlFor="manage-stock" className="text-sm" style={{ color: "#374151" }}>
              {t("products.form.manage_stock")}
              <span className="block text-xs" style={{ color: "#6b7280" }}>
                {t("products.form.manage_stock_hint")}
              </span>
            </label>
          </div>
        </div>

        <div className="mt-6">
          <UnitTreeFields value={unitTree} onChange={setUnitTree} />
        </div>


        <div className="mt-6">
          <div className="text-white text-center text-sm font-semibold py-2 rounded-t-md" style={{ backgroundColor: GREEN }}>
            {t("products.form.default_prices")}
          </div>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ backgroundColor: GREEN, color: "#ffffff", padding: "8px 12px", fontSize: 13 }}>{t("products.form.cost")}</th>
                <th style={{ backgroundColor: GREEN, color: "#ffffff", padding: "8px 12px", fontSize: 13 }}>{t("products.form.price")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: 8, border: "1px solid #e5e7eb" }}>
                  <input style={inputStyle} type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={t("products.form.price_placeholder")} />
                </td>
                <td style={{ padding: 8, border: "1px solid #e5e7eb" }}>
                  <input style={inputStyle} type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={t("products.form.price_placeholder")} />
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mt-3 text-end">
            <button type="button" onClick={() => setPgDlg(true)}
              className="h-9 px-4 rounded-md text-white text-sm inline-flex items-center gap-2"
              style={{ backgroundColor: INDIGO }}>
              <Plus className="h-4 w-4" /> {t("products.form.set_group_prices")}
            </button>
            {Object.values(pgPrices).some((v) => v) && (
              <span className="text-xs ms-2" style={{ color: "#6b7280" }}>
                ({Object.values(pgPrices).filter(Boolean).length} {t("products.form.groups_selected")})
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3 mt-6">
          <button type="button" disabled={create.isPending || !ownerId} onClick={() => handle("save")}
            className="h-10 px-6 rounded-md text-white text-sm disabled:opacity-50" style={{ backgroundColor: BLUE }}>{t("products.form.save")}</button>
          <button type="button" disabled={create.isPending || !ownerId} onClick={() => handle("another")}
            className="h-10 px-6 rounded-md text-white text-sm disabled:opacity-50" style={{ backgroundColor: PINK }}>{t("products.form.save_and_add")}</button>
          <button type="button" disabled={create.isPending || !ownerId} onClick={() => handle("qty")}
            className="h-10 px-6 rounded-md text-white text-sm disabled:opacity-50" style={{ backgroundColor: INDIGO }}>{t("products.form.save_and_qty")}</button>
        </div>
      </DataCard>

      <EntityDialog open={catDlg} onOpenChange={setCatDlg} title={t("products.categories.add_title")} fields={categoryFields}
        initial={{ has_sub_category: false }}
        onSubmit={async (v) => {
          await createCategory.mutateAsync({ name: v.name?.trim(), code: v.code?.trim() || null,
            description: v.description?.trim() || null, has_sub_category: !!v.has_sub_category });
          setCatDlg(false);
        }} submitting={createCategory.isPending} />
      <EntityDialog open={brandDlg} onOpenChange={setBrandDlg} title={t("products.brands.add_title")} fields={brandFields}
        initial={{ use_for_repair: false }}
        onSubmit={async (v) => {
          await createBrand.mutateAsync({ name: v.name?.trim(), description: v.description?.trim() || null,
            use_for_repair: !!v.use_for_repair });
          setBrandDlg(false);
        }} submitting={createBrand.isPending} />

      <Dialog open={pgDlg} onOpenChange={setPgDlg}>
        <DialogContent dir={dir} className="max-w-md" style={{ backgroundColor: "#ffffff" }}>
          <DialogHeader><DialogTitle className="text-start" style={{ color: DARK }}>{t("products.form.set_group_prices")}</DialogTitle></DialogHeader>
          {priceGroups.length === 0 ? (
            <p className="text-sm text-start" style={{ color: "#6b7280" }}>{t("products.price_groups.no_groups")}</p>
          ) : (
            <div className="space-y-2">
              {priceGroups.map((g: any) => (
                <div key={g.id} className="grid grid-cols-2 gap-2 items-center">
                  <label className="text-sm text-start" style={{ color: "#374151" }}>{g.name}</label>
                  <input type="number" step="0.01" style={inputStyle}
                    value={pgPrices[g.id] ?? ""} onChange={(e) => setPgPrices((s) => ({ ...s, [g.id]: e.target.value }))}
                    placeholder={t("products.form.price_placeholder")} />
                </div>
              ))}
            </div>
          )}
          <DialogFooter className="flex-row-reverse sm:flex-row-reverse gap-2">
            <button type="button" onClick={() => { setPgDlg(false); toast.success(t("products.toast.price_groups_saved")); }}
              className="h-10 px-5 rounded-md text-white text-sm" style={{ backgroundColor: BLUE }}>{t("products.form.save")}</button>
            <button type="button" onClick={() => setPgDlg(false)}
              className="h-10 px-5 rounded-md text-white text-sm" style={{ backgroundColor: DARK }}>{t("products.form.close")}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
