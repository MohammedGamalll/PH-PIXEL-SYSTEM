import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  TableToolbar,
  EmptyRow,
  TableFooter,
  type ColumnDef,
} from "@/components/products/TableToolbar";
import { DataCard } from "@/components/products/DataCard";
import { exportToCsv } from "@/lib/csv";
import { useI18n } from "@/lib/i18n";
import { SortableHeader, type SortDir } from "@/components/shared/SortableHeader";

const cellStyle: React.CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
  padding: "10px 12px",
  color: "#374151",
  whiteSpace: "nowrap",
};

export type ReportTableProps<T> = {
  rows: T[];
  initialCols: ColumnDef[];
  cellFor: (row: T, key: string) => ReactNode;
  numericKeys?: string[];
  searchFields?: (row: T) => string;
  exportName: string;
  printTitle: string;
  rowKey: (row: T, idx: number) => string;
  activeIdx?: number;
  onRowClick?: (row: T, idx: number) => void;
};

export function ReportTable<T>({
  rows,
  initialCols,
  cellFor,
  numericKeys = [],
  searchFields,
  exportName,
  printTitle,
  rowKey,
  activeIdx = -1,
  onRowClick,
}: ReportTableProps<T>) {
  const { t, dir } = useI18n();
  const headStyle: React.CSSProperties = {
    backgroundColor: "#f9fafb",
    color: "#374151",
    padding: "10px 12px",
    fontWeight: 600,
    textAlign: dir === "rtl" ? "right" : "left",
    fontSize: 13,
    borderBottom: "1px solid #e5e7eb",
    whiteSpace: "nowrap",
  };
  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState(initialCols);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      (searchFields ? searchFields(r) : JSON.stringify(r))
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search, searchFields]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    const isNum = numericKeys.includes(sortKey);
    const arr = [...filtered];
    arr.sort((a: any, b: any) => {
      const va = a?.[sortKey];
      const vb = b?.[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = isNum
        ? Number(va) - Number(vb)
        : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir, numericKeys]);

  const visible = cols.filter((c) => c.visible);
  const pageSize = Number(perPage);
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);

  const sums = useMemo(() => {
    const out: Record<string, number> = {};
    for (const k of numericKeys) {
      out[k] = sorted.reduce(
        (s, r) => s + Number((r as any)[k] ?? 0),
        0,
      );
    }
    return out;
  }, [sorted, numericKeys]);

  const exportCsv = (name: string) =>
    exportToCsv(
      name,
      visible.map((c) => c.label),
      sorted.map((r) =>
        visible.map((c) => String(cellFor(r, c.key) ?? "")),
      ),
    );

  return (
    <DataCard>
      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        perPage={perPage}
        onPerPageChange={setPerPage}
        onExportCsv={() => exportCsv(`${exportName}.csv`)}
        onExportExcel={() => exportCsv(`${exportName}.xls`)}
        printRef={printRef}
        printTitle={printTitle}
        columns={cols}
        onToggleColumn={(k) =>
          setCols((s) =>
            s.map((c) => (c.key === k ? { ...c, visible: !c.visible } : c)),
          )
        }
      />
      <div className="overflow-x-auto" ref={printRef}>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {visible.map((c) => (
                <th key={c.key} style={headStyle}>
                  <SortableHeader
                    label={c.label}
                    active={sortKey === c.key}
                    direction={sortKey === c.key ? sortDir : null}
                    align={dir === "rtl" ? "right" : "left"}
                    onChange={(d) => {
                      if (!d) { setSortKey(null); setSortDir(null); }
                      else { setSortKey(c.key); setSortDir(d); }
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <EmptyRow colSpan={visible.length} />
            ) : (
            pageRows.map((r, i) => {
                const globalIdx = (page - 1) * pageSize + i;
                const isActive = globalIdx === activeIdx;
                return (
                <tr
                  key={rowKey(r, i)}
                  onClick={() => onRowClick?.(r, globalIdx)}
                  style={isActive ? { backgroundColor: '#1e3a8a', color: '#fff', cursor: 'pointer' } : { cursor: onRowClick ? 'pointer' : undefined }}
                >
                  {visible.map((c) => (
                    <td key={c.key} style={{ ...cellStyle, color: isActive ? '#fff' : undefined }}>
                      {cellFor(r, c.key)}
                    </td>
                  ))}
                </tr>
              );})

            )}
          </tbody>
          {numericKeys.length > 0 && (
            <tfoot>
              <tr style={{ backgroundColor: "#f9fafb", fontWeight: 600 }}>
                {visible.map((c, idx) => {
                  if (idx === 0)
                    return (
                      <td key={c.key} style={cellStyle}>
                        {t("reports.total")}
                      </td>
                    );
                  if (numericKeys.includes(c.key))
                    return (
                      <td key={c.key} style={cellStyle}>
                        {(sums[c.key] ?? 0).toFixed(2)}
                      </td>
                    );
                  return <td key={c.key} style={cellStyle} />;
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <TableFooter
        from={from}
        to={to}
        total={total}
        page={page}
        pageCount={pageCount}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
      />
    </DataCard>
  );
}

export function StatCard({
  label,
  value,
  accent = "#3b82f6",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb" }}
    >
      <div className="text-xs mb-2" style={{ color: "#6b7280" }}>
        {label}
      </div>
      <div className="text-xl font-bold" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}
