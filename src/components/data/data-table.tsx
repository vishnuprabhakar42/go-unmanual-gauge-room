"use client";

import { tableFeatures, useTable, type ColumnDef, type RowData } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const basicFeatures = tableFeatures({});
export type BasicFeatures = typeof basicFeatures;

/**
 * Thin TanStack Table v9 wrapper (headless rows, shadcn markup). Data arrives already
 * paginated/filtered from the server. Selection, column visibility and export land with M1 lists.
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  empty,
  getRowId,
  columnClassName = {},
  rowClassName,
}: {
  columns: ColumnDef<BasicFeatures, TData>[];
  data: TData[];
  empty?: React.ReactNode;
  getRowId?: (row: TData) => string;
  /** Extra classes per column id, e.g. { make: "hidden md:table-cell" } for responsive columns */
  columnClassName?: Record<string, string>;
  rowClassName?: (row: TData) => string | undefined;
}) {
  const table = useTable({ features: basicFeatures, columns, data, getRowId });
  const rows = table.getRowModel().rows;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id} className={cn("whitespace-nowrap", columnClassName[header.column.id])}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-muted-foreground h-24 text-center">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} className={rowClassName?.(row.original)}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className={cn("align-top", columnClassName[cell.column.id])}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
