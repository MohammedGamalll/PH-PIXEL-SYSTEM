import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useBrands, useCategories } from "@/hooks/use-product-meta";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { DateInput } from "@/components/shared/DateInput";
import type { Promotion } from "@/hooks/use-promotions";

export type { Promotion };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Promotion | null;
  onSave: (p: Omit<Promotion, "owner_id"> & { id?: string }) => void;
};

const empty = (): Omit<Promotion, "owner_id" | "id"> => ({
  name: "", product_ids: [], brand_id: null, category_id: null,
  discount_type: "fixed", amount: 0, priority: 1, starts_at: null, ends_at: null, is_active: true,
});

export function PromotionFormModal({ open, onOpenChange, initial, onSave }: Props) {
  const { user } = useAuth();
  const { t, dir } = useI18n();
  const { data: brands = [] } = useBrands();
  const { data: categories = [] } = useCategories();
  const [v, setV] = useState<any>(empty());
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["products-lite"],
    enabled: !!user && open,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id,name,sku").limit(1000);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; sku: string | null }[];
    },
  });

  useEffect(() => {
    setV(initial ? { ...initial } : empty());
  }, [initial, open]);

  const set = (k: string, val: any) => setV((s: any) => ({ ...s, [k]: val }));
  const toggleProduct = (id: string) => set("product_ids",
    v.product_ids.includes(id) ? v.product_ids.filter((x: string) => x !== id) : [...v.product_ids, id]);

  const selectedProducts = useMemo(
    () => (products as any[]).filter((p) => v.product_ids.includes(p.id)),
    [products, v.product_ids],
  );

  const toIsoOrNull = (s: string) => (s ? new Date(s).toISOString() : null);
  const fromIso = (s: string | null) => (s ? s.slice(0, 16) : "");
  const dateOf = (s: string | null) => {
    if (!s) return "";
    const dt = new Date(s);
    if (isNaN(dt.getTime())) return "";
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };
  const timeOf = (s: string | null) => {
    if (!s) return "00:00";
    const dt = new Date(s);
    if (isNaN(dt.getTime())) return "00:00";
    return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  };
  const combine = (date: string, time: string): string | null => {
    if (!date) return null;
    return toIsoOrNull(`${date}T${time || "00:00"}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-xl form-strong">
        <DialogHeader><DialogTitle>{initial ? t("sales.promo.edit_title") : t("sales.promo.add_title")}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">

          <div className="col-span-2 space-y-1">
            <Label>{t("sales.promo.name_label")}</Label>
            <Input value={v.name} onChange={(e) => set("name", e.target.value)} placeholder={t("sales.promo.col.name")} />
          </div>

          <div className="col-span-2 space-y-1">
            <Label>{t("sales.promo.products_label")}</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <button type="button" className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white flex items-center justify-between text-sm text-start">
                  <span className="text-muted-foreground">
                    {v.product_ids.length ? t("sales.promo.picker_count").replace("{n}", String(v.product_ids.length)) : t("sales.promo.picker_placeholder")}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent dir={dir} className="w-[420px] p-0">
                <Command>
                  <CommandInput placeholder={t("sales.promo.search_item")} />
                  <CommandList>
                    <CommandEmpty>{t("sales.promo.no_results")}</CommandEmpty>
                    <CommandGroup>
                      {(products as any[]).map((p) => {
                        const checked = v.product_ids.includes(p.id);
                        return (
                          <CommandItem key={p.id} onSelect={() => toggleProduct(p.id)}>
                            <Check className={cn("ms-2 h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                            <span>{p.name}</span>
                            {p.sku && <span className="ms-2 text-xs text-muted-foreground">[{p.sku}]</span>}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedProducts.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedProducts.map((p: any) => (
                  <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-100 border border-gray-300">
                    {p.name}
                    <button onClick={() => toggleProduct(p.id)}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>{t("sales.promo.brand")}</Label>
            <Select value={v.brand_id || "__none__"} onValueChange={(x) => set("brand_id", x === "__none__" ? null : x)}>
              <SelectTrigger><SelectValue placeholder={t("sales.form.please_select")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("sales.promo.all_dash")}</SelectItem>
                {(brands as any[]).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("sales.promo.category")}</Label>
            <Select value={v.category_id || "__none__"} onValueChange={(x) => set("category_id", x === "__none__" ? null : x)}>
              <SelectTrigger><SelectValue placeholder={t("sales.form.please_select")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("sales.promo.all_dash")}</SelectItem>
                {(categories as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("sales.promo.priority")}</Label>
            <Input type="number" value={v.priority} onChange={(e) => set("priority", Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label>{t("sales.promo.type")}</Label>
            <Select value={v.discount_type} onValueChange={(x) => set("discount_type", x)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">{t("sales.promo.type_fixed")}</SelectItem>
                <SelectItem value="percent">{t("sales.promo.type_percent")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("sales.promo.amount")}</Label>
            <Input type="number" value={v.amount} onChange={(e) => set("amount", Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label>{t("sales.promo.starts")}</Label>
            <div className="flex items-center gap-2">
              <DateInput value={dateOf(v.starts_at)} onChange={(d) => set("starts_at", combine(d, timeOf(v.starts_at)))} />
              <Input type="time" className="w-28" value={timeOf(v.starts_at)} onChange={(e) => set("starts_at", combine(dateOf(v.starts_at), e.target.value))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t("sales.promo.ends")}</Label>
            <div className="flex items-center gap-2">
              <DateInput value={dateOf(v.ends_at)} onChange={(d) => set("ends_at", combine(d, timeOf(v.ends_at)))} />
              <Input type="time" className="w-28" value={timeOf(v.ends_at)} onChange={(e) => set("ends_at", combine(dateOf(v.ends_at), e.target.value))} />
            </div>
          </div>
          <div className="col-span-2 flex items-center gap-2 mt-1">
            <Checkbox id="is_active" checked={v.is_active} onCheckedChange={(c) => set("is_active", !!c)} />
            <Label htmlFor="is_active">{t("sales.promo.active")}</Label>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t("sales.actions.close")}</Button>
          <Button onClick={() => { onSave({ ...v }); onOpenChange(false); }} disabled={!v.name}>{t("sales.actions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
