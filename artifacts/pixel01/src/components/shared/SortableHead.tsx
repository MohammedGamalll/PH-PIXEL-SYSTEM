import { SortableHeader } from "./SortableHeader";
import type { TableSort } from "./useTableSort";
import { useI18n } from "@/lib/i18n";

type Col = { key: string; label: string; visible: boolean; dirLabels?: { asc: string; desc: string } };

/**
 * Drop-in replacement for the standard `<th>` head row used across table pages.
 * Sorts excluded for action/opt columns.
 */
export function SortableHead({
  cols,
  headStyle,
  sort,
  onSort,
  nonSortable = ["opt", "actions", "options"],
}: {
  cols: Col[];
  headStyle: React.CSSProperties;
  sort: TableSort;
  onSort: (s: TableSort) => void;
  nonSortable?: string[];
}) {
  const { dir } = useI18n();
  return (
    <tr>
      {cols.map((c) => {
        const skip = nonSortable.includes(c.key);
        return (
          <th key={c.key} style={headStyle} data-print-hide={skip ? "1" : undefined}>
            {skip ? (
              c.label
            ) : (
              <SortableHeader
                label={c.label}
                active={sort.key === c.key}
                direction={sort.key === c.key ? sort.dir : null}
                align={dir === "rtl" ? "right" : "left"}
                dirLabels={c.dirLabels}
                onChange={(d) => onSort(d ? { key: c.key, dir: d } : { key: "", dir: null })}
              />
            )}
          </th>
        );
      })}
    </tr>
  );
}
