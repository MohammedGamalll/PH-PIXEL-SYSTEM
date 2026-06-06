import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, Search, Printer, Tag, Eye, Undo2, RefreshCw, Wallet, Pencil } from "lucide-react";
import { useCan } from "@/lib/can";

export type PurchaseAction =
  | "inspect" | "edit" | "print" | "labels" | "payments" | "add_payment" | "return" | "status";


export function PurchaseOptionsMenu({ onAction }: { onAction: (a: PurchaseAction) => void }) {
  const { can } = useCan();
  const canEdit = can("purchase_invoices", "edit");
  const canPrint = can("purchase_invoices", "print");
  const canReturn = can("purchase_returns", "create");
  // Always keep "inspect"/"payments" (view) available if user has view.
  const hasAny = true; // view always allowed for users who reach the row
  if (!hasAny) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="h-8 px-3 rounded-md text-xs inline-flex items-center gap-1"
        style={{ backgroundColor: "#6366f1", color: "#ffffff", border: "1px solid #4f46e5" }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#4f46e5")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#6366f1")}
      >
        خيارات <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]" style={{ backgroundColor: "#ffffff", border: "1px solid #d1d5db" }}>
        <DropdownMenuItem onClick={() => onAction("inspect")}><Search className="h-4 w-4 me-2" /> فحص</DropdownMenuItem>
        {canEdit && <DropdownMenuItem onClick={() => onAction("edit")}><Pencil className="h-4 w-4 me-2" /> تعديل</DropdownMenuItem>}
        {canPrint && <DropdownMenuItem onClick={() => onAction("print")}><Printer className="h-4 w-4 me-2" /> طباعة</DropdownMenuItem>}
        {canPrint && <DropdownMenuItem onClick={() => onAction("labels")}><Tag className="h-4 w-4 me-2" /> طباعة الملصقات</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => onAction("payments")}><Eye className="h-4 w-4 me-2" /> عرض المدفوعات</DropdownMenuItem>
        {canEdit && <DropdownMenuItem onClick={() => onAction("add_payment")}><Wallet className="h-4 w-4 me-2" /> إضافة دفعة</DropdownMenuItem>}
        {canReturn && <DropdownMenuItem onClick={() => onAction("return")}><Undo2 className="h-4 w-4 me-2" /> مرجع مشتريات</DropdownMenuItem>}
        {canEdit && <DropdownMenuItem onClick={() => onAction("status")}><RefreshCw className="h-4 w-4 me-2" /> تحديث الحالة</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
