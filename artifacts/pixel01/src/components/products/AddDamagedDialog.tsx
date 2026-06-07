import { useState, useMemo, useEffect } from "react";
import { useAutoRef } from "@/hooks/use-auto-ref";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataCard } from "@/components/products/DataCard";
import { Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import { toBase, unitOptions, type UnitLevel } from "@/lib/units";
import { normalizeArabicText } from "@/lib/arabic";
import { useWarehouseContext } from "@/contexts/WarehouseContext";

const damagedHeaderSchema = z.object({
  damage_date: z.string().min(1, "التاريخ مطلوب"),
  damage_type: z.enum(["normal", "abnormal"], { message: "نوع التلف غير صالح" }),
  reason: z.string().max(500, "السبب أطول من 500 حرف").optional().or(z.literal("")),
});

const damagedItemSchema = z.object({
  product_id: z.string().min(1, "اختر المنتج"),
  quantity: z.number().gt(0, "الكمية يجب أن تكون أكبر من صفر"),
  unit_price: z.number().min(0, "السعر لا يمكن أن يكون سالباً"),
});

const BLUE = "#3b82f6";
const RED = "#ef4444";
const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db", backgroundColor: "#ffffff",
  borderRadius: 6, height: 38, padding: "0 10px", width: "100%", fontSize: 14, outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 13, color: "#374151", marginBottom: 4, display: "block" };
const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 12px" };

type Item = { product_id: string | null; description: string; quantity: number; unit_price: number; unit_level: UnitLevel; unit_name: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddDamagedDialog({ open, onOpenChange }: Props) {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const { currentWarehouseId } = useWarehouseContext();
  const qc = useQueryClient();
  const headStyle: React.CSSProperties = {
    backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px",
    fontWeight: 600, textAlign: dir === "rtl" ? "right" : "left", fontSize: 13, borderBottom: "1px solid #e5e7eb",
  };
  const [refNumber, setRefNumber] = useState("");
  const [autoRef] = useAutoRef("damaged_stock", "ref_number", "DMG", open);
  useEffect(() => { if (open && autoRef && !refNumber) setRefNumber(autoRef); }, [open, autoRef]);
  const [branch, setBranch] = useState("");
  const [damageType, setDamageType] = useState("normal");
  const localNow = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [damageDate, setDamageDate] = useState(() => localNow());
  const [recovered, setRecovered] = useState("0");
  const [reason, setReason] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");

  const reset = () => {
    setRefNumber(""); setBranch(""); setDamageType("normal");
    setDamageDate(localNow());
    setRecovered("0"); setReason(""); setItems([]); setSearch("");
  };

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    enabled: !!user && open,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*");
      if (error) throw error;
      return data;
    },
  });

  const matches = useMemo(() => {
    if (!search.trim()) return [];
    const q = normalizeArabicText(search);
    return products.filter((p: any) => {
      const hay = normalizeArabicText(`${p.name || ""} ${p.name_en || ""} ${p.sku ?? ""} ${p.barcode ?? ""}`);
      return hay.includes(q);
    }).slice(0, 5);
  }, [search, products]);

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const addItem = (p: any) => {
    const opts = unitOptions(p);
    const def = opts[0] ?? { level: "main" as UnitLevel, name: p.main_unit || p.unit || "" };
    setItems((s) => [...s, {
      product_id: p.id, description: p.name, quantity: 1, unit_price: Number(p.cost ?? 0),
      unit_level: def.level, unit_name: def.name,
    }]);
    setSearch("");
  };

  void branch; void setBranch;

  const save = useMutation({
    mutationFn: async () => {
      if (items.length === 0) throw new Error(t("products.toast.add_one_item"));

      const hc = damagedHeaderSchema.safeParse({
        damage_date: damageDate, damage_type: damageType, reason,
      });
      if (!hc.success) throw new Error(hc.error.issues[0]?.message || "بيانات غير صالحة");

      // Per-item validation + stock guard (in base units)
      const stockMap = new Map((products as any[]).map((p) => [p.id, p]));
      const requestedBase = new Map<string, number>();
      const baseByIndex: number[] = [];
      for (const it of items) {
        const ic = damagedItemSchema.safeParse({
          product_id: it.product_id ?? "",
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
        });
        if (!ic.success) throw new Error(`${it.description || "صنف"}: ${ic.error.issues[0]?.message}`);
        const p: any = it.product_id ? stockMap.get(it.product_id) : null;
        const baseQty = p ? toBase(Number(it.quantity), it.unit_level, p) : Math.round(Number(it.quantity));
        baseByIndex.push(baseQty);
        if (it.product_id) {
          requestedBase.set(it.product_id, (requestedBase.get(it.product_id) || 0) + baseQty);
        }
      }
      for (const [pid, qty] of requestedBase) {
        const p: any = stockMap.get(pid);
        const available = Number(p?.stock ?? 0);
        if (qty > available) {
          throw new Error(`الكمية المطلوبة من "${p?.name ?? "الصنف"}" (${qty}) أكبر من المتاح في المخزون (${available})`);
        }
      }

      const { data: head, error: e1 } = await (supabase.from("damaged_stock") as any).insert({
        owner_id: ownerId, created_by: user!.id, ref_number: refNumber || null, branch: branch || null,
        damage_type: damageType, damage_date: new Date(damageDate).toISOString(), total,
        recovered_total: Number(recovered || 0), reason: reason || null,
        warehouse_id: currentWarehouseId ?? null,
      }).select("id").single();
      if (e1) throw e1;
      const { error: e2 } = await (supabase.from("damaged_stock_items") as any).insert(
        items.map((i, idx) => ({
          damaged_stock_id: (head as any).id,
          product_id: i.product_id,
          description: i.description,
          quantity: Math.round(i.quantity),
          base_quantity: baseByIndex[idx],
          unit_name: i.unit_name || null,
          unit_price: i.unit_price,
          total: Math.round(i.quantity) * i.unit_price,
        }))
      );
      if (e2) throw e2;
      // Decrement per-warehouse stock for damaged items
      if (currentWarehouseId) {
        for (let idx = 0; idx < items.length; idx++) {
          const it = items[idx];
          if (!it.product_id) continue;
          const baseQty = baseByIndex[idx];
          if (!baseQty) continue;
          await (supabase as any).rpc("adjust_warehouse_stock", {
            _owner: ownerId,
            _product: it.product_id,
            _warehouse: currentWarehouseId,
            _delta: -baseQty,
          });
        }
      }
    },
    onSuccess: () => {
      toast.success(t("products.toast.saved"));
      qc.invalidateQueries({ queryKey: ["damaged_stock"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" dir={dir}>
        <DialogHeader>
          <DialogTitle className="text-start">{t("products.damaged.add_title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <DataCard>
            <div className="grid md:grid-cols-3 gap-4">
              <div><label style={labelStyle}>{t("products.damaged.ref")}</label>
                <input style={inputStyle} value={refNumber} onChange={(e) => setRefNumber(e.target.value)} /></div>
              <div><label style={labelStyle}>{t("products.damaged.date")}<span style={{ color: RED }}>*</span></label>
                <input type="datetime-local" style={inputStyle} value={damageDate} onChange={(e) => setDamageDate(e.target.value)} /></div>
              <div><label style={labelStyle}>{t("products.damaged.type_label")}<span style={{ color: RED }}>*</span></label>
                <select style={inputStyle} value={damageType} onChange={(e) => setDamageType(e.target.value)}>
                  <option value="normal">{t("products.damaged.type.normal")}</option><option value="abnormal">{t("products.damaged.type.abnormal")}</option>
                </select></div>
            </div>
          </DataCard>

          <DataCard>
            <div className="relative mb-3">
              <Search className="h-4 w-4 absolute top-1/2 -translate-y-1/2" style={{ insetInlineEnd: "0.5rem", color: "#9ca3af" }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("products.damaged.search_items")}
                className="h-10 rounded-md w-full px-3 pe-8 text-sm outline-none"
                style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff" }} />
              {matches.length > 0 && (
                <div className="absolute z-10 start-0 end-0 mt-1 rounded-md" style={{ border: "1px solid #e5e7eb", backgroundColor: "#ffffff" }}>
                  {matches.map((p: any) => (
                    <button key={p.id} type="button" onClick={() => addItem(p)}
                      className="block w-full text-start px-3 py-2 text-sm hover:bg-gray-50">
                      {p.name} {p.sku ? `(${p.sku})` : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={headStyle}>{t("products.damaged.col.item")}</th>
                <th style={headStyle}>{t("products.damaged.col.qty")}<span style={{ color: RED }}>*</span></th>
                <th style={headStyle}>{t("products.damaged.col.unit") || "الوحدة"}</th>
                <th style={headStyle}>{t("products.damaged.col.unit_price")}</th>
                <th style={headStyle}>{t("products.damaged.col.sum")}</th>
                <th style={headStyle}></th>
              </tr></thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={6} style={{ ...cellStyle, textAlign: "center", color: "#6b7280" }}>{t("products.damaged.grand_total")} 0.00</td></tr>
                ) : items.map((i, idx) => {
                  const p: any = i.product_id ? (products as any[]).find((x) => x.id === i.product_id) : null;
                  const opts = p ? unitOptions(p) : [];
                  return (
                  <tr key={idx}>
                    <td style={cellStyle}>{i.description}</td>
                    <td style={cellStyle}>
                      <input type="number" min="0" step="0.01" value={i.quantity} style={{ ...inputStyle, height: 32 }}
                        onChange={(e) => setItems((s) => s.map((x, k) => k === idx ? { ...x, quantity: Number(e.target.value) } : x))} />
                    </td>
                    <td style={cellStyle}>
                      {opts.length > 1 ? (
                        <select style={{ ...inputStyle, height: 32 }} value={i.unit_level}
                          onChange={(e) => {
                            const lvl = e.target.value as UnitLevel;
                            const name = opts.find((o) => o.level === lvl)?.name || "";
                            setItems((s) => s.map((x, k) => k === idx ? { ...x, unit_level: lvl, unit_name: name } : x));
                          }}>
                          {opts.map((o) => <option key={o.level} value={o.level}>{o.name}</option>)}
                        </select>
                      ) : (
                        <span style={{ color: "#6b7280" }}>{i.unit_name || "—"}</span>
                      )}
                    </td>
                    <td style={cellStyle}>
                      <input type="number" min="0" step="0.01" value={i.unit_price} style={{ ...inputStyle, height: 32 }}
                        onChange={(e) => setItems((s) => s.map((x, k) => k === idx ? { ...x, unit_price: Number(e.target.value) } : x))} />
                    </td>
                    <td style={cellStyle}>{(i.quantity * i.unit_price).toFixed(2)}</td>
                    <td style={cellStyle}>
                      <button onClick={() => setItems((s) => s.filter((_, k) => k !== idx))}
                        className="h-8 w-8 rounded-md inline-flex items-center justify-center"
                        style={{ color: RED }}><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                  );
                })}
                {items.length > 0 && (
                  <tr><td colSpan={4} style={{ ...cellStyle, textAlign: dir === "rtl" ? "left" : "right", fontWeight: 600 }}>{t("products.damaged.grand_total")}</td>
                    <td colSpan={2} style={{ ...cellStyle, fontWeight: 600 }}>{total.toFixed(2)}</td></tr>
                )}
              </tbody>
            </table>
          </DataCard>

          <DataCard>
            <div className="grid md:grid-cols-2 gap-4">
              <div><label style={labelStyle}>{t("products.damaged.recovered")}<span style={{ color: RED }}>*</span></label>
                <input type="number" step="0.01" style={inputStyle} value={recovered} onChange={(e) => setRecovered(e.target.value)} /></div>
              <div><label style={labelStyle}>{t("products.damaged.reason")}</label>
                <textarea style={{ ...inputStyle, height: 80, padding: 8 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("products.damaged.reason")} /></div>
            </div>
            <div className="text-center mt-4">
              <button type="button" disabled={save.isPending} onClick={() => save.mutate()}
                className="h-10 px-8 rounded-md text-white text-sm" style={{ backgroundColor: BLUE }}>{t("products.form.save")}</button>
            </div>
          </DataCard>
        </div>
      </DialogContent>
    </Dialog>
  );
}
