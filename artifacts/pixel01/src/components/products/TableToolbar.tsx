import type { RefObject } from "react";
import { Search, Printer, FileSpreadsheet, FileText, Columns3 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { printTableElement } from "@/lib/print-table";
import { useI18n } from "@/lib/i18n";

export type ColumnDef = { key: string; label: string; visible: boolean; dirLabels?: { asc: string; desc: string } };

export function TableToolbar({
  search,
  onSearchChange,
  perPage = "25",
  onPerPageChange,
  onExportCsv,
  onExportExcel,
  onPrint,
  printRef,
  printTitle = "table",
  columns,
  onToggleColumn,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  perPage?: string;
  onPerPageChange?: (v: string) => void;
  onExportCsv?: () => void;
  onExportExcel?: () => void;
  onPrint?: () => void;
  printRef?: RefObject<HTMLElement | null>;
  printTitle?: string;
  columns?: ColumnDef[];
  onToggleColumn?: (key: string) => void;
}) {
  const { t } = useI18n();
  const btnStyle: React.CSSProperties = {
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#374151",
  };
  const handlePrint =
    onPrint ??
    (printRef
      ? () => printTableElement(printRef.current, printTitle)
      : undefined);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-2 flex-1 min-w-0 sm:flex-none">
        <div className="relative w-full sm:w-56">
          <Search
            className="h-4 w-4 absolute top-1/2 -translate-y-1/2"
            style={{ insetInlineEnd: "0.5rem", color: "#9ca3af" }}
          />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("toolbar.search")}
            className="h-9 rounded-md text-sm px-3 pe-8 w-full outline-none"
            style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff" }}
          />
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {onExportCsv && (
          <button type="button" onClick={onExportCsv} className="h-9 px-2 sm:px-3 rounded-md text-sm flex items-center gap-1.5" style={btnStyle}>
            <FileText className="h-4 w-4" /> <span className="hidden sm:inline">{t("toolbar.export_csv")}</span>
          </button>
        )}
        {(onExportExcel || onExportCsv) && (
          <button type="button" onClick={onExportExcel ?? onExportCsv} className="h-9 px-2 sm:px-3 rounded-md text-sm flex items-center gap-1.5" style={btnStyle}>
            <FileSpreadsheet className="h-4 w-4" /> <span className="hidden sm:inline">{t("toolbar.export_excel")}</span>
          </button>
        )}
        {handlePrint && (
          <button type="button" onClick={handlePrint} className="h-9 px-2 sm:px-3 rounded-md text-sm flex items-center gap-1.5" style={btnStyle}>
            <Printer className="h-4 w-4" /> <span className="hidden sm:inline">{t("toolbar.print")}</span>
          </button>
        )}
        {columns && onToggleColumn ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="h-9 px-2 sm:px-3 rounded-md text-sm flex items-center gap-1.5" style={btnStyle}>
                <Columns3 className="h-4 w-4" /> <span className="hidden sm:inline">{t("toolbar.columns")}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("toolbar.columns_label")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={c.visible}
                  onCheckedChange={() => onToggleColumn(c.key)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <div className="flex items-center gap-2 text-sm" style={{ color: "#374151" }}>
        <span className="hidden sm:inline">{t("toolbar.show")}</span>
        <select
          value={perPage}
          onChange={(e) => onPerPageChange?.(e.target.value)}
          className="h-9 rounded-md text-sm px-2"
          style={{ border: "1px solid #d1d5db", backgroundColor: "#ffffff" }}
        >
          <option>10</option>
          <option>25</option>
          <option>50</option>
          <option>100</option>
          <option>500</option>
          <option>1000</option>
          <option value="999999">{t("toolbar.all") || "الكل"}</option>
        </select>
        <span className="hidden sm:inline">{t("toolbar.entries")}</span>
      </div>
    </div>
  );
}

export function EmptyRow({ colSpan }: { colSpan: number }) {
  const { t } = useI18n();
  return (
    <tr>
      <td colSpan={colSpan} className="text-center py-6 text-sm" style={{ color: "#6b7280" }}>
        {t("toolbar.empty")}
      </td>
    </tr>
  );
}

export function TableFooter({
  from = 0,
  to = 0,
  total = 0,
  page = 1,
  pageCount = 1,
  onPrev,
  onNext,
}: {
  from?: number;
  to?: number;
  total?: number;
  page?: number;
  pageCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const { t } = useI18n();
  const prevDisabled = page <= 1 || total === 0;
  const nextDisabled = page >= pageCount || total === 0;
  const disabledStyle: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    backgroundColor: "#f9fafb",
    color: "#9ca3af",
    cursor: "not-allowed",
  };
  const enabledStyle: React.CSSProperties = {
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    color: "#374151",
  };
  return (
    <div className="flex items-center justify-between mt-3 text-sm" style={{ color: "#374151" }}>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="h-8 px-3 rounded-md"
          style={nextDisabled ? disabledStyle : enabledStyle}
        >
          {t("toolbar.next")}
        </button>
        <button
          type="button"
          onClick={onPrev}
          disabled={prevDisabled}
          className="h-8 px-3 rounded-md"
          style={prevDisabled ? disabledStyle : enabledStyle}
        >
          {t("toolbar.prev")}
        </button>
      </div>
      <div>
        {t("toolbar.showing", { from, to, total })}
      </div>
    </div>
  );
}
