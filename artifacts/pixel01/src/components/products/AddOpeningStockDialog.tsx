import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { useWarehouseContext } from "@/contexts/WarehouseContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataCard } from "@/components/products/DataCard";
import { Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { normalizeArabicText } from "@/lib/arabic";

const BLUE = "#3b82f6";
const RED = "#ef4444";

const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db", backgroundColor: "#ffffff",
  borderRadius: 6, height: 36, padding: "0 10px", width: "100%", fontSize: 14, outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 13, color: "#374151", marginBottom: 4, display: "block" };
const headStyle: React.CSSProperties = {
  backgroundColor: "#f9fafb", color: "#374151", padding: "10px 12px",
  fontWeight: 600, textAlign: "right", fontSize: 13, borderBottom: "1px solid #e5e7eb",
};
const cellStyle: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "8px 10px" };

type Row = {
  product_id: string | null;
  name: string;
  qty: number;
  price: number;
  date: string;
  note: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedProduct?: { id: string; name: string; cost?: number | null } | null;
}

function todayLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function AddOpeningStockDialog({ open, onOpenChange, preselectedProduct }: Props) {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const { currentWarehouseId } = useWarehouseContext();
  const qc = useQueryClient();

  const [globalDate, setGlobalDate] = useState<string>(todayLocal());
  const [globalNote, setGlobalNote] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([
    { product_id: null, name: "", qty: 0, price: 0, date: todayLocal(), note: "" },
  ]);
  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open && preselectedProduct) {
      setRows([{
        product_id: preselectedProduct.id,
        name: preselectedProduct.name,
        qty: 0,
        price: Number(preselectedProduct.cost ?? 0),
        date: todayLocal(),
        note: "",
      }]);
    }
  }, [open, preselectedProduct]);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    enabled: !!user && open,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, sku, cost");
      if (error) throw error;
      return data;
    },
  });

  const matches = useMemo(() => {
    if (!search.trim()) return [];
    const q = normalizeArabicText(search);
    return (products as any[])
      .filter((p) => normalizeArabicText((p.name || "") + " " + (p.sku ?? "")).includes(q))
      .slice(0, 6);
  }, [search, products]);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((s) => s.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((s) => [
      ...s,
      { product_id: null, name: "", qty: 0, price: 0, date: globalDate, note: globalNote },
    ]);
  const removeRow = (i: number) => setRows((s) => s.filter((_, k) => k !== i));

  const save = useMutation({
    mutationFn: async () => {
      const valid = rows.filter((r) => r.product_id && r.qty > 0);
      if (valid.length === 0) throw new Error("أضف صنفًا واحدًا على الأقل بكمية صحيحة");

      // 1) Adjust warehouse stock (positive delta)
      if (!currentWarehouseId) throw new Error("اختر مخزنًا أولاً");
      for (const r of valid) {
        const { error } = await (supabase as any).rpc("adjust_warehouse_stock", {
          _owner: ownerId,
          _product: r.product_id,
          _warehouse: currentWarehouseId,
          _delta: Math.round(r.qty),
        });
        if (error) throw error;
      }

      // 2) Update product cost when provided
      for (const r of valid) {
        if (r.price > 0) {
          await (supabase.from("products") as any)
            .update({ cost: r.price })
            .eq("id", r.product_id);
        }
      }
      void user; void globalNote; void globalDate;
    },
    onSuccess: () => {
      toast.success("تمت إضافة الكميات الافتتاحية");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product_warehouse_stock"] });
      setRows([{ product_id: null, name: "", qty: 0, price: 0, date: todayLocal(), note: "" }]);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-start">إضافة كميات افتتاحية</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <DataCard>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>التاريخ (افتراضي للصفوف)</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={globalDate}
                  onChange={(e) => setGlobalDate(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>ملاحظة عامة</label>
                <input
                  style={inputStyle}
                  value={globalNote}
                  onChange={(e) => setGlobalNote(e.target.value)}
                  placeholder="ملاحظة"
                />
              </div>
            </div>
          </DataCard>

          <DataCard>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={headStyle}>اسم الصنف</th>
                    <th style={headStyle}>الكمية الافتتاحية الجديدة<span style={{ color: RED }}>*</span></th>
                    <th style={headStyle}>السعر (قبل الضريبة)</th>
                    <th style={headStyle}>الإجمالي (قبل الضريبة)</th>
                    <th style={headStyle}>التاريخ</th>
                    <th style={headStyle}>ملاحظة</th>
                    <th style={headStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ ...cellStyle, minWidth: 220, position: "relative" }}>
                        <div className="relative">
                          <Search
                            className="h-4 w-4 absolute top-1/2 -translate-y-1/2"
                            style={{ insetInlineEnd: 8, color: "#9ca3af" }}
                          />
                          <input
                            style={{ ...inputStyle, paddingInlineEnd: 28 }}
                            value={searchIdx === i ? search : r.name}
                            placeholder="ابحث عن الصنف…"
                            onFocus={() => {
                              setSearchIdx(i);
                              setSearch(r.name);
                            }}
                            onChange={(e) => {
                              setSearchIdx(i);
                              setSearch(e.target.value);
                              update(i, { name: e.target.value, product_id: null });
                            }}
                          />
                          {searchIdx === i && matches.length > 0 && (
                            <div
                              className="absolute z-10 start-0 end-0 mt-1 rounded-md"
                              style={{ border: "1px solid #e5e7eb", backgroundColor: "#ffffff" }}
                            >
                              {matches.map((p: any) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  className="block w-full text-start px-3 py-2 text-sm hover:bg-gray-50"
                                  onClick={() => {
                                    update(i, {
                                      product_id: p.id,
                                      name: p.name,
                                      price: r.price || Number(p.cost ?? 0),
                                    });
                                    setSearchIdx(null);
                                    setSearch("");
                                  }}
                                >
                                  {p.name} {p.sku ? `(${p.sku})` : ""}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          style={{ ...inputStyle, height: 32 }}
                          value={r.qty}
                          onChange={(e) => update(i, { qty: Number(e.target.value) })}
                        />
                      </td>
                      <td style={cellStyle}>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          style={{ ...inputStyle, height: 32 }}
                          value={r.price}
                          onChange={(e) => update(i, { price: Number(e.target.value) })}
                        />
                      </td>
                      <td style={cellStyle}>{(r.qty * r.price).toFixed(2)}</td>
                      <td style={cellStyle}>
                        <input
                          type="date"
                          style={{ ...inputStyle, height: 32 }}
                          value={r.date}
                          onChange={(e) => update(i, { date: e.target.value })}
                        />
                      </td>
                      <td style={cellStyle}>
                        <input
                          style={{ ...inputStyle, height: 32 }}
                          value={r.note}
                          onChange={(e) => update(i, { note: e.target.value })}
                        />
                      </td>
                      <td style={cellStyle}>
                        <button
                          onClick={() => removeRow(i)}
                          disabled={rows.length === 1}
                          className="h-8 w-8 rounded-md inline-flex items-center justify-center disabled:opacity-50"
                          style={{ color: RED }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={addRow}
                className="h-9 px-3 rounded-md text-sm inline-flex items-center gap-1"
                style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff", color: "#374151" }}
              >
                <Plus className="h-4 w-4" /> إضافة صف
              </button>
            </div>

            <div className="text-center mt-4">
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => save.mutate()}
                className="h-10 px-8 rounded-md text-white text-sm"
                style={{ backgroundColor: BLUE }}
              >
                حفظ
              </button>
            </div>
          </DataCard>
        </div>
      </DialogContent>
    </Dialog>
  );
}
