import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/products/PageHeader";
import { DataCard } from "@/components/products/DataCard";
import { useBrands, useCategories, useWarranties } from "@/hooks/use-product-meta";
import { useSettings } from "@/contexts/SettingsContext";
import { UnitTreeFields, emptyUnitTree, unitTreeToDb, type UnitTreeValue } from "@/components/products/UnitTreeFields";
import { toast } from "sonner";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import { useUnsavedChangesPrompt } from "@/hooks/use-unsaved-prompt";

const productEditSchema = z.object({
  name: z.string().trim().min(1, "اسم المنتج مطلوب").max(200),
  sku: z.string().trim().max(50).regex(/^[a-zA-Z0-9_-]*$/, "SKU يقبل حروف وأرقام وشرطة فقط").optional().or(z.literal("")),
  price: z.number().min(0, "السعر لا يمكن أن يكون سالباً"),
  cost: z.number().min(0, "التكلفة لا يمكن أن تكون سالبة"),
});

export const Route = createFileRoute("/_authenticated/products/$id/edit")({ component: EditProductPage });

const BLUE = "#3b82f6";
const RED = "#ef4444";
const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db", backgroundColor: "#ffffff",
  borderRadius: 6, height: 38, padding: "0 10px", width: "100%", fontSize: 14, outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 13, color: "#374151", marginBottom: 4, display: "block" };

function EditProductPage() {
  const { t, dir } = useI18n();
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: categories = [] } = useCategories();
  const { data: brands = [] } = useBrands();
  
  const { data: warranties = [] } = useWarranties();
  const { settings } = useSettings();

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    enabled: !!user && !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [warrantyId, setWarrantyId] = useState("");
  const [hasExpiry, setHasExpiry] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState("10");
  const [unitTree, setUnitTree] = useState<UnitTreeValue>(emptyUnitTree);

  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [removeImage, setRemoveImage] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const savedOnceRef = useRef(false);
  useUnsavedChangesPrompt(() => isDirty && !savedOnceRef.current && !savedOnce);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!imageFile) { setImagePreview(""); return; }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!product) return;
    const p: any = product;
    setName(p.name ?? "");
    setNameEn(p.name_en ?? "");
    setSku(p.sku ?? "");
    setCategoryId(p.category_id ?? "");
    setBrandId(p.brand_id ?? "");
    setUnitId(p.unit_id ?? "");
    setCost(p.cost != null ? String(p.cost) : "");
    setPrice(p.price != null ? String(p.price) : "");
    setWarrantyId(p.warranty_id ?? "");
    setHasExpiry(!!p.has_expiry);
    setLowStockThreshold(p.low_stock_threshold != null ? String(p.low_stock_threshold) : "10");
    setUnitTree({
      main_unit: p.main_unit ?? "",
      sub_unit_1: p.sub_unit_1 ?? "",
      sub_unit_1_ratio: p.sub_unit_1_ratio != null ? String(p.sub_unit_1_ratio) : "",
      sub_unit_2: p.sub_unit_2 ?? "",
      sub_unit_2_ratio: p.sub_unit_2_ratio != null ? String(p.sub_unit_2_ratio) : "",
    });
    setExistingImageUrl(p.image_url ?? null);
    setImageFile(null);
    setRemoveImage(false);
    setIsDirty(false);
  }, [product]);

  // Mark dirty whenever any tracked field changes
  useEffect(() => {
    if (product) setIsDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, nameEn, sku, categoryId, brandId, unitId, cost, price, warrantyId, hasExpiry, lowStockThreshold, unitTree, imageFile, removeImage]);

  const save = useMutation({
    mutationFn: async () => {
      const check = productEditSchema.safeParse({
        name, sku,
        price: price === "" ? 0 : Number(price),
        cost: cost === "" ? 0 : Number(cost),
      });
      if (!check.success) throw new Error(check.error.issues[0]?.message || t("products.form.name_required_short"));
      const trimmedSku = sku.trim();
      if (trimmedSku) {
        const { data: dup } = await (supabase.from("products") as any)
          .select("id").eq("sku", trimmedSku).neq("id", id).limit(1);
        if (dup && dup.length > 0) throw new Error("الكود (الباركود) مستخدم بالفعل في صنف آخر");
      }
      const tree = unitTreeToDb(unitTree);

      // Image handling
      let nextImageUrl: string | null | undefined = undefined; // undefined = don't change
      if (imageFile && user) {
        const ext = imageFile.name.split(".").pop() || "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("product-images").upload(path, imageFile, { upsert: false });
        if (upErr) throw upErr;
        nextImageUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      } else if (removeImage) {
        nextImageUrl = null;
      }

      const patch: any = {
        name: name.trim(),
        name_en: nameEn.trim() || null,
        sku: trimmedSku || null,
        category_id: categoryId || null,
        brand_id: brandId || null,
        cost: cost === "" ? 0 : Number(cost),
        price: price === "" ? 0 : Number(price),
        warranty_id: warrantyId || null,
        has_expiry: hasExpiry,
        low_stock_threshold: Number(lowStockThreshold) || 10,
        ...tree,
      };
      if (nextImageUrl !== undefined) patch.image_url = nextImageUrl;
      const { error } = await (supabase.from("products") as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product", id] });
      savedOnceRef.current = true;
      setSavedOnce(true);
      setIsDirty(false);
      toast.success(t("products.toast.saved"));
      navigate({ to: "/products" });
    },
    onError: (e: any) => toast.error(e.message || t("products.toast.save_failed")),
  });

  if (isLoading) {
    return <div dir={dir} className="p-6 text-sm" style={{ color: "#6b7280" }}>{t("products.form.loading")}</div>;
  }
  if (!product) {
    return <div dir={dir} className="p-6 text-sm" style={{ color: RED }}>{t("products.form.not_found")}</div>;
  }

  return (
    <div className="space-y-3" dir={dir}>
      <PageHeader title={t("products.edit_title")} />

      <DataCard>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label style={labelStyle}>{t("products.form.name")}<span style={{ color: RED }}>*</span></label>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>{t("products.form.name_en")}</label>
            <input style={inputStyle} dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>{t("products.form.sku")}</label>
            <input style={inputStyle} value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>{t("products.form.low_stock_threshold") || "حد تنبيه المخزون"}</label>
            <input style={inputStyle} type="number" min="0" value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)}
              placeholder="10" />
            <div className="text-xs mt-1" style={{ color: "#6b7280" }}>لما يقل المخزون عن هذا الرقم هيظهر تنبيه</div>
          </div>
          <div>
            <label style={labelStyle}>{t("products.form.category")}</label>
            <select style={inputStyle} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">—</option>
              {(categories as any[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t("products.form.brand")}</label>
            <select style={inputStyle} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">—</option>
              {(brands as any[]).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t("products.form.cost")}</label>
            <input style={inputStyle} type="number" step="any" value={cost} onChange={(e) => setCost(e.target.value)} />
            {(product as any)?.previous_cost != null && (
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                {t("products.col.previous_cost")}: {Number((product as any).previous_cost).toFixed(2)}
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>{t("products.form.price")}</label>
            <input style={inputStyle} type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
            {(product as any)?.previous_price != null && (
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                {t("products.col.previous_price")}: {Number((product as any).previous_price).toFixed(2)}
              </div>
            )}
          </div>
        </div>
      </DataCard>

      <DataCard>
        <UnitTreeFields value={unitTree} onChange={setUnitTree} />
      </DataCard>

      <DataCard>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label style={labelStyle}>{t("products.form.warranty")}</label>
            <select style={inputStyle} value={warrantyId} onChange={(e) => setWarrantyId(e.target.value)}>
              <option value="">{t("products.form.warranty_none")}</option>
              {(warranties as any[]).map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.duration} {t(`products.warranties.unit.${w.duration_unit}`)})</option>
              ))}
            </select>
          </div>
          {settings?.enable_expiry_dates && (
            <div className="flex items-start gap-2 pt-6">
              <input id="has-expiry-edit" type="checkbox" checked={hasExpiry} onChange={(e) => setHasExpiry(e.target.checked)} className="mt-1" />
              <label htmlFor="has-expiry-edit" style={labelStyle}>
                {t("products.form.has_expiry")}
                <div className="text-xs" style={{ color: "#6b7280", fontWeight: 400 }}>{t("products.form.has_expiry_hint")}</div>
              </label>
            </div>
          )}
        </div>
      </DataCard>

      <DataCard>
        <label style={labelStyle}>{t("products.form.image") || "صورة الصنف"}</label>
        <div className="rounded-md p-4 flex flex-col items-start gap-3"
          style={{ border: "2px dashed #d1d5db", backgroundColor: "#fafafa" }}>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0] ?? null; setImageFile(f); if (f) setRemoveImage(false); }} />
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="h-9 px-4 rounded-md text-white text-sm" style={{ backgroundColor: BLUE }}>
              {imageFile || (existingImageUrl && !removeImage) ? "تغيير الصورة" : (t("products.form.browse") || "اختر صورة")}
            </button>
            {(imageFile || (existingImageUrl && !removeImage)) && (
              <button type="button"
                onClick={() => {
                  setImageFile(null);
                  setRemoveImage(true);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-xs underline" style={{ color: RED }}>
                {t("products.form.remove") || "حذف الصورة"}
              </button>
            )}
          </div>
          {imagePreview ? (
            <div className="w-full flex justify-center">
              <img src={imagePreview} alt="preview" className="object-contain" style={{ maxHeight: 200, maxWidth: "100%" }} />
            </div>
          ) : existingImageUrl && !removeImage ? (
            <div className="w-full flex justify-center">
              <img src={existingImageUrl} alt="current" className="object-contain" style={{ maxHeight: 200, maxWidth: "100%" }} />
            </div>
          ) : (
            <p className="text-xs" style={{ color: "#6b7280" }}>لا توجد صورة</p>
          )}
        </div>
      </DataCard>


      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => navigate({ to: "/products" })}
          className="h-10 px-4 rounded-md text-sm"
          style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151" }}>
          {t("products.form.cancel")}
        </button>
        <button type="button" onClick={() => save.mutate()} disabled={save.isPending}
          className="h-10 px-6 rounded-md text-white text-sm"
          style={{ backgroundColor: BLUE }}>
          {save.isPending ? t("products.form.saving") : t("products.form.save_edits")}
        </button>
      </div>
    </div>
  );
}
