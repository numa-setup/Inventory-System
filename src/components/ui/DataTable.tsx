import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  /** Render a cell; defaults to String(row[key]). */
  cell?: (row: T) => React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}

export function DataTable<T extends { id?: string | number }>({
  columns,
  rows,
  empty,
  onRowClick,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
}) {
  const align = (a?: string) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className={cn("overflow-x-auto scrollbar-thin", className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary",
                  align(c.align),
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center">
                {empty ?? (
                  <span className="text-sm text-text-tertiary">No records found.</span>
                )}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={row.id ?? i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-border/70 transition-colors last:border-0",
                  onRowClick && "cursor-pointer hover:bg-surface-2",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "whitespace-nowrap px-4 py-3 text-text-secondary",
                      align(c.align),
                      c.className,
                    )}
                  >
                    {c.cell
                      ? c.cell(row)
                      : String((row as Record<string, unknown>)[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
