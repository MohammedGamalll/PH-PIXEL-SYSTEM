import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useOwnerId } from "@/lib/owner";
import { requireOwnerId } from "@/lib/db-errors";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, FileText, Printer, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { exportToCSV, printInvoice } from "@/lib/export";
import pharmacyLogo from "@/assets/pharmacy-logo.png";

const invoiceSchema = z.object({
  customer_id: z.string().uuid().nullable(),
  invoice_number: z.string().trim().min(1, "رقم الفاتورة مطلوب").max(50),
  total: z.number().min(0.01, "الإجمالي يجب أن يكون أكبر من صفر").max(1_000_000_000),
  status: z.enum(["draft", "sent", "paid"]),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const Route = createFileRoute("/_authenticated/invoices")({
  component: InvoicesPage,
});

function InvoicesPage() {
  const { user } = useAuth();
  const ownerId = useOwnerId();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // Sales-side invoices list — joins on contacts (type=customer|both) since customer_id
  // points to the contacts table. The standalone `customers` table is unused.
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-list", "from-contacts"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, business_name, mobile, phone, email, address, city")
        .in("type", ["customer", "both"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        id: c.id,
        name: c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "—",
        mobile: c.mobile || c.phone || "",
        email: c.email || "",
        address: [c.address, c.city].filter(Boolean).join(", "),
      }));
    },
  });

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const create = useMutation({
    mutationFn: async (vals: { customer_id: string | null; invoice_number: string; total: number; status: string; notes: string }) => {
      const { error } = await supabase.from("invoices").insert({
        owner_id: requireOwnerId(ownerId),
        customer_id: vals.customer_id || null,
        invoice_number: vals.invoice_number,
        subtotal: vals.total,
        total: vals.total,
        tax: 0,
        status: vals.status,
        notes: vals.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(isAr ? "تم إنشاء الفاتورة" : "Invoice created");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const customerVal = String(fd.get("customer_id") || "") || null;
    const parsed = invoiceSchema.safeParse({
      customer_id: customerVal,
      invoice_number: String(fd.get("invoice_number") || "").trim(),
      total: Number(fd.get("total") || 0),
      status: String(fd.get("status") || "draft"),
      notes: String(fd.get("notes") || "").trim(),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
      return;
    }
    create.mutate({
      customer_id: parsed.data.customer_id,
      invoice_number: parsed.data.invoice_number.slice(0, 50),
      total: parsed.data.total,
      status: parsed.data.status,
      notes: (parsed.data.notes ?? "").slice(0, 500),
    });
  };

  const statusVariant = (s: string): "default" | "secondary" | "outline" =>
    s === "paid" ? "default" : s === "draft" ? "outline" : "secondary";

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{isAr ? "الفواتير" : "Invoices"}</h1>
          <p className="text-sm text-muted-foreground">{isAr ? "إدارة فواتير المبيعات" : "Manage sales invoices"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            disabled={invoices.length === 0}
            onClick={() => exportToCSV("invoices", invoices.map((i) => ({
              number: i.invoice_number, customer: customerMap.get(i.customer_id ?? "")?.name ?? "",
              date: i.issue_date, status: i.status, total: i.total,
            })))}
          >
            <Download className="h-4 w-4" />{isAr ? "تصدير" : "Export"}
          </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary shadow-soft gap-2"><Plus className="h-4 w-4" />{isAr ? "فاتورة جديدة" : "New invoice"}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{isAr ? "إنشاء فاتورة" : "Create invoice"}</DialogTitle></DialogHeader>
            <form onSubmit={onSubmit} className="space-y-3">
              <div><Label>{isAr ? "رقم الفاتورة" : "Invoice number"}</Label><Input name="invoice_number" required maxLength={50} defaultValue={`INV-${Date.now().toString().slice(-6)}`} /></div>
              <div>
                <Label>{isAr ? "العميل" : "Customer"}</Label>
                <Select name="customer_id">
                  <SelectTrigger><SelectValue placeholder={isAr ? "اختر عميل" : "Select customer"} /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{isAr ? "الإجمالي" : "Total"}</Label><Input name="total" type="number" step="0.01" min={0} required /></div>
              <div>
                <Label>{isAr ? "الحالة" : "Status"}</Label>
                <Select name="status" defaultValue="draft">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">{isAr ? "مسودة" : "Draft"}</SelectItem>
                    <SelectItem value="sent">{isAr ? "مرسلة" : "Sent"}</SelectItem>
                    <SelectItem value="paid">{isAr ? "مدفوعة" : "Paid"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{isAr ? "ملاحظات" : "Notes"}</Label><Input name="notes" maxLength={500} /></div>
              <Button type="submit" disabled={create.isPending} className="w-full bg-gradient-primary">{isAr ? "حفظ" : "Save"}</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {invoices.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">{isAr ? "لا توجد فواتير بعد" : "No invoices yet"}</Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-start">
                  <th className="px-4 py-3 text-start font-medium">{isAr ? "رقم" : "Number"}</th>
                  <th className="px-4 py-3 text-start font-medium">{isAr ? "العميل" : "Customer"}</th>
                  <th className="px-4 py-3 text-start font-medium">{isAr ? "التاريخ" : "Date"}</th>
                  <th className="px-4 py-3 text-start font-medium">{isAr ? "الحالة" : "Status"}</th>
                  <th className="px-4 py-3 text-end font-medium">{isAr ? "الإجمالي" : "Total"}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      {i.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{customerMap.get(i.customer_id ?? "")?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{i.issue_date}</td>
                    <td className="px-4 py-3"><Badge variant={statusVariant(i.status)}>{i.status}</Badge></td>
                    <td className="px-4 py-3 text-end font-semibold">{Number(i.total).toFixed(2)} {isAr ? "ج.م" : "EGP"}</td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => printInvoice({
                            invoice_number: i.invoice_number,
                            issue_date: i.issue_date,
                            due_date: i.due_date,
                            customer_name: customerMap.get(i.customer_id ?? "")?.name,
                            notes: i.notes,
                            subtotal: Number(i.subtotal || 0),
                            tax: Number(i.tax || 0),
                            total: Number(i.total || 0),
                            status: i.status,
                            logo_url: window.location.origin + pharmacyLogo,
                            company_name: lang === "ar" ? "​" : "​",
                          }, lang)}
                          title={isAr ? "طباعة" : "Print"}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => del.mutate(i.id)} className="text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
