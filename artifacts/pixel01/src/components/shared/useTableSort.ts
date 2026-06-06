import { useMemo, useState } from "react";
import type { SortDir } from "./SortableHeader";

export type TableSort = { key: string; dir: SortDir };

/**
 * Generic client-side table sort. Returns sorted rows + sort state.
 * Numeric keys are detected automatically from sample values.
 */
export function useTableSort<T = any>(rows: T[]): { sorted: T[]; sort: TableSort; setSort: (s: TableSort) => void } {
  const [sort, setSort] = useState<TableSort>({ key: "", dir: null });

  const sorted = useMemo(() => {
    if (!sort.key || !sort.dir) return rows;
    const k = sort.key;
    const sample = (rows.find((r) => (r as any)?.[k] != null) as any)?.[k];
    const isNum = typeof sample === "number" || (typeof sample === "string" && sample !== "" && !isNaN(Number(sample)));
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = (a as any)?.[k];
      const vb = (b as any)?.[k];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = isNum
        ? Number(va) - Number(vb)
        : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sort]);

  return { sorted, sort, setSort };
}
