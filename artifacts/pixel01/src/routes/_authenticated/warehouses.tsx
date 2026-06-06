import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useWarehouses,
  useCreateWarehouse,
  useDeleteWarehouse,
  type Warehouse,
} from "@/hooks/use-warehouses";
import { useOwnerId } from "@/lib/owner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import {
  Trash2,
  Plus,
  Warehouse as WarehouseIcon,
  Boxes,
  DollarSign,
  Package,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/warehouses")({
  component: WarehousesPage,
});

type WhStat = {
  items: number;
  cost: number;
  value: number;
  distinct: number;
};

function useWarehouseStats(warehouses: Warehouse[]) {
  const ownerId = useOwnerId();
  return useQuery({
    queryKey: ["warehouses-stats", ownerId, warehouses.map((w) => w.id).join(",")],
    enabled: !!ownerId && warehouses.length > 0,
    staleTime: 0,
    queryFn: async () => {
      // Two simple queries — no embed/join (no FK exists between PWS and products).
      const [pRes, sRes] = await Promise.all([
        supabase.from("products").select("id, cost, price").eq("owner_id", ownerId!),
        supabase
          .from("product_warehouse_stock")
          .select("warehouse_id, product_id, stock")
          .eq("owner_id", ownerId!),
      ]);
      if (pRes.error) throw pRes.error;
      if (sRes.error) throw sRes.error;
      const pMap = new Map<string, { cost: number; price: number }>();
      for (const p of (pRes.data ?? []) as any[]) {
        pMap.set(p.id, { cost: Number(p.cost ?? 0), price: Number(p.price ?? 0) });
      }
      const stats = new Map<string, WhStat>();
      for (const w of warehouses) {
        stats.set(w.id, { items: 0, cost: 0, value: 0, distinct: 0 });
      }
      for (const r of (sRes.data ?? []) as any[]) {
        const s = stats.get(r.warehouse_id);
        if (!s) continue;
        const stock = Number(r.stock ?? 0);
        if (stock <= 0) continue;
        const p = pMap.get(r.product_id) ?? { cost: 0, price: 0 };
        s.items += stock;
        s.cost += stock * p.cost;
        s.value += stock * p.price;
        s.distinct += 1;
      }
      return Object.fromEntries(stats.entries()) as Record<string, WhStat>;
    },
  });
}

function WarehousesPage() {
  const { data: warehouses = [], isLoading } = useWarehouses();
  const create = useCreateWarehouse();
  const remove = useDeleteWarehouse();
  const { data: stats } = useWarehouseStats(warehouses);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", is_default: false });

  // Auto-generated, read-only code preview
  const nextCode = useMemo(() => {
    if (warehouses.length === 0) return "MAIN";
    return `W${warehouses.length + 1}`;
  }, [warehouses.length]);

  const openNew = () => {
    if (warehouses.length >= 2) {
      toast.error("لا يمكن إضافة أكثر من مخزنين");
      return;
    }
    setForm({ name: "", is_default: warehouses.length === 0 });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("الاسم مطلوب");
      return;
    }
    await create.mutateAsync({
      name: form.name.trim(),
      code: nextCode,
      is_default: form.is_default,
    });
    setOpen(false);
  };

  const tryDelete = (w: Warehouse) => {
    if (warehouses.length <= 1) {
      toast.error("لا يمكن حذف آخر مخزن — يجب الإبقاء على مخزن واحد على الأقل");
      return;
    }
    if (!confirm(`حذف المخزن "${w.name}"؟`)) return;
    remove.mutate(w.id);
  };

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WarehouseIcon className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">المخازن</h1>
        </div>
        <Button onClick={openNew} disabled={warehouses.length >= 2}>
          <Plus className="h-4 w-4 ms-1" /> إضافة مخزن
        </Button>
      </div>

      <WarehousesSummary warehouses={warehouses} stats={stats} />

      {warehouses.length >= 2 && (
        <div className="text-sm text-muted-foreground bg-muted/40 rounded p-3">
          الحد الأقصى للمخازن: 2
        </div>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm data-table">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-start">الاسم</th>
              <th className="p-3 text-start">الكود</th>
              <th className="p-3 text-start">عدد الأصناف</th>
              <th className="p-3 text-start">إجمالي القطع</th>
              <th className="p-3 text-start">قيمة بسعر الشراء</th>
              <th className="p-3 text-start">قيمة بسعر البيع</th>
              <th className="p-3 text-start">افتراضي</th>
              <th className="p-3 text-start">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  جاري التحميل...
                </td>
              </tr>
            ) : warehouses.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  لا توجد مخازن. اضغط "إضافة مخزن" للبدء.
                </td>
              </tr>
            ) : (
              warehouses.map((w) => {
                const s = stats?.[w.id] ?? { items: 0, cost: 0, value: 0, distinct: 0 };
                return (
                  <tr key={w.id} className="border-t">
                    <td className="p-3 font-bold">{w.name}</td>
                    <td className="p-3 font-semibold text-muted-foreground">
                      {w.code ?? "-"}
                    </td>
                    <td className="p-3 font-bold">{s.distinct.toLocaleString()}</td>
                    <td className="p-3 font-bold">{s.items.toFixed(2)}</td>
                    <td className="p-3 font-bold">{s.cost.toFixed(2)}</td>
                    <td className="p-3 font-bold">{s.value.toFixed(2)}</td>
                    <td className="p-3 font-semibold">{w.is_default ? "نعم" : "لا"}</td>
                    <td className="p-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => tryDelete(w)}
                        disabled={warehouses.length <= 1}
                        title={
                          warehouses.length <= 1
                            ? "لا يمكن حذف آخر مخزن"
                            : undefined
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة مخزن</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>الاسم *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="مثال: مخزن الفرع الثاني"
              />
            </div>
            <div>
              <Label>الكود (تلقائي)</Label>
              <Input value={nextCode} readOnly disabled className="font-mono" />
              <p className="text-xs text-muted-foreground mt-1">
                يتم توليد الكود تلقائياً ولا يمكن تعديله.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <Label>المخزن الافتراضي</Label>
              <Switch
                checked={form.is_default}
                onCheckedChange={(v) => setForm({ ...form, is_default: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={submit} disabled={create.isPending}>
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WarehousesSummary({
  warehouses,
  stats,
}: {
  warehouses: Warehouse[];
  stats: Record<string, WhStat> | undefined;
}) {
  if (!warehouses.length) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {warehouses.map((w) => {
        const s = stats?.[w.id] ?? { items: 0, cost: 0, value: 0, distinct: 0 };
        return (
          <Card key={w.id} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <WarehouseIcon className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-lg">{w.name}</h3>
                {w.is_default && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded font-bold"
                    style={{ background: "#dbeafe", color: "#1e40af" }}
                  >
                    افتراضي
                  </span>
                )}
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {w.code ?? "-"}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-md p-2" style={{ background: "#eff6ff" }}>
                <div
                  className="flex items-center gap-1 text-xs mb-1"
                  style={{ color: "#1e40af" }}
                >
                  <Package className="h-3.5 w-3.5" /> عدد الأصناف
                </div>
                <div className="font-extrabold text-base">
                  {s.distinct.toLocaleString()}
                </div>
              </div>
              <div className="rounded-md p-2" style={{ background: "#f3f4f6" }}>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <Boxes className="h-3.5 w-3.5" /> إجمالي القطع
                </div>
                <div className="font-extrabold text-base">{s.items.toFixed(2)}</div>
              </div>
              <div className="rounded-md p-2" style={{ background: "#fef3c7" }}>
                <div
                  className="flex items-center gap-1 text-xs mb-1"
                  style={{ color: "#92400e" }}
                >
                  <DollarSign className="h-3.5 w-3.5" /> قيمة بسعر الشراء
                </div>
                <div className="font-extrabold text-base">{s.cost.toFixed(2)}</div>
              </div>
              <div className="rounded-md p-2" style={{ background: "#dcfce7" }}>
                <div
                  className="flex items-center gap-1 text-xs mb-1"
                  style={{ color: "#166534" }}
                >
                  <DollarSign className="h-3.5 w-3.5" /> قيمة بسعر البيع
                </div>
                <div className="font-extrabold text-base">{s.value.toFixed(2)}</div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
