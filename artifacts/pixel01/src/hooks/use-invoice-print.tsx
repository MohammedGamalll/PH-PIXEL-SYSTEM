import { useEffect, useState, type ReactNode } from "react";
import { useInvoiceItems } from "@/hooks/use-invoices";
import { PrintableInvoice, type PrintMode } from "@/components/sales/PrintableInvoice";

type UseInvoicePrintOptions = {
  customerName?: (invoice: any) => string;
  customerPhone?: (invoice: any) => string;
  customerAddress?: (invoice: any) => string;
};

export function useInvoicePrint(options: UseInvoicePrintOptions = {}) {
  const [printingInvoice, setPrintingInvoice] = useState<any | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>("invoice");
  const [pendingPrint, setPendingPrint] = useState(false);
  const printingId = printingInvoice?.id ?? null;
  const { data: printItems = [], isLoading: itemsLoading } = useInvoiceItems(printingId || undefined);

  useEffect(() => {
    const handler = () => {
      setPrintingInvoice(null);
      setPendingPrint(false);
    };
    window.addEventListener("afterprint", handler);
    return () => window.removeEventListener("afterprint", handler);
  }, []);

  useEffect(() => {
    if (!pendingPrint || !printingInvoice || !printingId) return;
    if (itemsLoading) return;
    const tm = setTimeout(() => {
      window.print();
      setPendingPrint(false);
    }, 100);
    return () => clearTimeout(tm);
  }, [pendingPrint, printingInvoice, printingId, printItems, itemsLoading]);

  const triggerPrint = (invoice: any, mode: PrintMode = "invoice") => {
    if (!invoice?.id) return;
    setPrintMode(mode);
    setPrintingInvoice(invoice);
    setPendingPrint(true);
  };

  const onModalPrint = (invoice: any, closeModal: () => void) => (mode: PrintMode) => {
    if (!invoice?.id) return;
    closeModal();
    setTimeout(() => triggerPrint(invoice, mode), 150);
  };

  const resolveName = (inv: any) =>
    options.customerName?.(inv) ?? inv?.customer_name_snapshot ?? "";
  const resolvePhone = (inv: any) => options.customerPhone?.(inv) ?? "";
  const resolveAddress = (inv: any) => options.customerAddress?.(inv) ?? "";

  const printNode: ReactNode = printingInvoice ? (
    <PrintableInvoice
      mode={printMode}
      invoice={printingInvoice}
      items={printItems as any[]}
      customerName={resolveName(printingInvoice)}
      customerPhone={resolvePhone(printingInvoice)}
      customerAddress={resolveAddress(printingInvoice)}
    />
  ) : null;

  return { triggerPrint, onModalPrint, printNode };
}

export type { PrintMode };
