import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Wallet, Eye, Pencil, Trash2, Power, Undo2 } from "lucide-react";
import { useDeleteContact, useToggleContactActive } from "@/hooks/use-contacts";
import { ContactPaymentModal } from "@/components/sales/cashier/ContactPaymentModal";
import { EditContactDialog } from "@/components/contacts/EditContactDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useCan } from "@/lib/can";

type Props = {
  contact: any;
  scope: "customer" | "supplier";
};

export function ContactOptionsMenu({ contact, scope }: Props) {
  const navigate = useNavigate();
  const { can } = useCan();
  const moduleKey = scope === "supplier" ? "suppliers" : "customers";
  const [payOpen, setPayOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const del = useDeleteContact(scope);
  const toggle = useToggleContactActive();

  const canEdit = can(moduleKey, "edit");
  const canDelete = can(moduleKey, "delete");
  const canDeactivate = can(moduleKey, "edit");
  const isActive = contact.is_active !== false;
  const viewBase = "/users/contacts";


  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="h-8 px-3 inline-flex items-center gap-1 rounded text-white text-xs"
            style={{ backgroundColor: "#3b82f6" }}
          >
            خيارات <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-white min-w-[160px]">
          {canEdit && (
            <DropdownMenuItem onClick={() => setPayOpen(true)} className="gap-2 cursor-pointer">
              <Wallet className="h-4 w-4" /> الدفع
            </DropdownMenuItem>
          )}
          {canEdit && scope === "supplier" && (
            <DropdownMenuItem onClick={() => setRefundOpen(true)} className="gap-2 cursor-pointer">
              <Undo2 className="h-4 w-4" /> استلام مرتجع شراء مستحق
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => navigate({ to: `${viewBase}/${contact.id}/view` })}
            className="gap-2 cursor-pointer"
          >
            <Eye className="h-4 w-4" /> فحص
          </DropdownMenuItem>
          {canEdit && (
            <DropdownMenuItem onClick={() => setEditOpen(true)} className="gap-2 cursor-pointer">
              <Pencil className="h-4 w-4" /> تعديل
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDelOpen(true)} className="gap-2 cursor-pointer text-red-600">
                <Trash2 className="h-4 w-4" /> حذف
              </DropdownMenuItem>
            </>
          )}
          {canDeactivate && (
            <DropdownMenuItem
              onClick={() => toggle.mutate({ id: contact.id, is_active: !isActive })}
              className="gap-2 cursor-pointer"
            >
              <Power className="h-4 w-4" /> {isActive ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ContactPaymentModal
        open={payOpen}
        direction={scope === "supplier" ? "out" : "in"}
        initialContactId={contact.id}
        lockContact
        onClose={() => setPayOpen(false)}
      />
      {scope === "supplier" && (
        <ContactPaymentModal
          open={refundOpen}
          direction="out"
          contactType="supplier"
          titleOverride="استلام مرتجع شراء مستحق"
          initialContactId={contact.id}
          lockContact
          onClose={() => setRefundOpen(false)}
        />
      )}
      <EditContactDialog open={editOpen} onOpenChange={setEditOpen} contact={contact} />
      <ConfirmDialog
        open={delOpen}
        onOpenChange={setDelOpen}
        title="تأكيد الحذف"
        description={`هل أنت متأكد من حذف ${scope === "supplier" ? "المورد" : "العميل"} "${[contact.first_name, contact.last_name].filter(Boolean).join(" ")}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="حذف"
        confirmVariant="destructive"
        onConfirm={() => del.mutate(contact.id)}
      />
    </>
  );
}
