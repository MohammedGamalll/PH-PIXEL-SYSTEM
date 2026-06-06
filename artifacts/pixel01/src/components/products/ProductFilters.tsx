import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Filter } from "lucide-react";
import { useBrands, useCategories, useUnits } from "@/hooks/use-product-meta";
import { useI18n } from "@/lib/i18n";

export type ProductFiltersState = {
  itemType: string; categoryId: string; unitId: string; tax: string;
  brandId: string; branch: string; notForSale: boolean;
};

export const emptyFilters: ProductFiltersState = {
  itemType: "", categoryId: "", unitId: "", tax: "", brandId: "", branch: "", notForSale: false,
};

const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db", backgroundColor: "#ffffff",
  borderRadius: 6, height: 36, padding: "0 8px", width: "100%", fontSize: 13, outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 12, color: "#374151", marginBottom: 4, display: "block" };

export function ProductFilters({
  value, onChange,
}: { value: ProductFiltersState; onChange: (v: ProductFiltersState) => void }) {
  const { t, dir } = useI18n();
  const { data: brands = [] } = useBrands();
  const { data: cats = [] } = useCategories();
  const { data: units = [] } = useUnits();
  const set = (k: keyof ProductFiltersState, v: any) => onChange({ ...value, [k]: v });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-2 text-sm" style={{ color: "#374151" }}>
          <span>{t("toolbar.filter")}</span>
          <Filter className="h-4 w-4" style={{ color: "#6b7280" }} />
        </button>
      </PopoverTrigger>
      <PopoverContent dir={dir} className="w-[640px] p-4" style={{ backgroundColor: "#ffffff" }} align="end">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label style={labelStyle}>{t("products.filters.item_type")}</label>
            <select style={inputStyle} value={value.itemType} onChange={(e) => set("itemType", e.target.value)}>
              <option value="">{t("products.filters.all")}</option>
              <option value="single">{t("products.filters.single")}</option>
              <option value="variant">{t("products.filters.variant")}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t("products.filters.category")}</label>
            <select style={inputStyle} value={value.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">{t("products.filters.all")}</option>
              {cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t("products.filters.unit")}</label>
            <select style={inputStyle} value={value.unitId} onChange={(e) => set("unitId", e.target.value)}>
              <option value="">{t("products.filters.all")}</option>
              {units.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t("products.filters.tax")}</label>
            <select style={inputStyle} value={value.tax} onChange={(e) => set("tax", e.target.value)}>
              <option value="">{t("products.filters.all")}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t("products.filters.brand")}</label>
            <select style={inputStyle} value={value.brandId} onChange={(e) => set("brandId", e.target.value)}>
              <option value="">{t("products.filters.all")}</option>
              {brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm self-end" style={{ color: "#374151" }}>
            <input type="checkbox" checked={value.notForSale} onChange={(e) => set("notForSale", e.target.checked)} />
            {t("products.filters.not_for_sale")}
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}
