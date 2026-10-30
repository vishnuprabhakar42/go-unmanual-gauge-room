"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { FileSpreadsheet, History, Printer, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { DataTable, type BasicFeatures } from "@/components/data/data-table";
import { DueText, StatusBadge } from "@/components/instruments/badges";
import { LabelsDialog } from "@/components/instruments/labels-dialog";
import { CreateRequestButton } from "../due/create-request-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { DueState } from "@/domain/due";
import { formatDate } from "@/domain/india/format";
import type { InstrumentStatus } from "@/domain/instrument-status";

export type InstrumentRow = {
  id: string;
  code: string;
  type: string;
  description: string | null;
  serialNo: string | null;
  make: string | null;
  status: InstrumentStatus;
  criticality: "A" | "B" | "C";
  plant: string;
  department: string | null;
  location: string | null;
  range: string | null;
  leastCount: string | null;
  standardCode: string | null;
  standardDate: string | null;
  /** standard comes from the instrument type */
  standardInherited: boolean;
  adjustable: boolean | null;
  planningDate: string | null;
  lastCalibratedAt: string | null;
  nextDueAt: string | null;
  dueState: DueState;
  daysToDue: number | null;
};

const helper = createColumnHelper<BasicFeatures, InstrumentRow>();

export function InstrumentsTable({
  rows,
  emptyLabel,
  mode = "register",
}: {
  rows: InstrumentRow[];
  emptyLabel: string;
  /** "due" adds "Create calibration request" to the bulk bar */
  mode?: "register" | "due";
}) {
  const t = useTranslations();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [labelsOpen, setLabelsOpen] = useState(false);
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "select",
          header: () => (
            <Checkbox
              aria-label={t("instruments.selectAll")}
              checked={allOnPage}
              onCheckedChange={(v) => setSelected(v === true ? new Set(rows.map((r) => r.id)) : new Set())}
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              aria-label={t("instruments.selectRow", { code: row.original.code })}
              checked={selected.has(row.original.id)}
              onCheckedChange={() => toggle(row.original.id)}
            />
          ),
        }),
        helper.accessor("code", {
          header: t("instruments.code"),
          cell: ({ row }) => (
            <div className="space-y-1">
              <Link
                href={`/instruments/${row.original.id}`}
                className="block font-mono font-medium underline-offset-4 hover:underline"
              >
                {row.original.code}
              </Link>
              <StatusBadge status={row.original.status} />
            </div>
          ),
        }),
        helper.accessor("type", {
          header: t("instruments.instrument"),
          cell: ({ row }) => (
            <div className="max-w-56 min-w-40">
              <div>{row.original.type}</div>
              <div className="text-muted-foreground text-xs">
                {[row.original.description, row.original.serialNo && `SN ${row.original.serialNo}`].filter(Boolean).join(" · ")}
              </div>
              <div className="text-muted-foreground text-xs">
                {[row.original.plant, row.original.department, row.original.location].filter(Boolean).join(" · ")}
              </div>
            </div>
          ),
        }),
        helper.accessor("make", { header: t("instruments.make"), cell: (c) => c.getValue() ?? "—" }),
        helper.accessor("range", {
          header: t("instruments.rangeLc"),
          cell: ({ row }) => (
            <div className="text-sm whitespace-nowrap">
              <div>{row.original.range ?? "—"}</div>
              <div className="text-muted-foreground text-xs">
                {t("instruments.lcShort", { lc: row.original.leastCount ?? "—" })}
              </div>
            </div>
          ),
        }),
        helper.accessor("standardCode", {
          header: t("instruments.standard"),
          cell: ({ row }) =>
            row.original.standardCode ? (
              <div className="min-w-28 text-xs">
                <div>{row.original.standardCode}</div>
                <div className="text-muted-foreground">
                  {formatDate(row.original.standardDate) || "—"}
                  {row.original.standardInherited && ` · ${t("instruments.fromType")}`}
                </div>
              </div>
            ) : (
              "—"
            ),
        }),
        helper.accessor("adjustable", {
          header: t("instruments.adjustableShort"),
          cell: (c) => (c.getValue() == null ? "—" : c.getValue() ? t("common.yes") : t("common.no")),
        }),
        helper.accessor("planningDate", {
          header: t("instruments.planningDate"),
          cell: ({ row }) => (
            <span
              className={
                row.original.dueState === "DUE_SOON"
                  ? "font-medium whitespace-nowrap text-amber-700 dark:text-amber-400"
                  : "whitespace-nowrap"
              }
            >
              {formatDate(row.original.planningDate) || "—"}
            </span>
          ),
        }),
        helper.accessor("nextDueAt", {
          header: t("instruments.dueDate"),
          cell: ({ row }) => (
            <DueText state={row.original.dueState} date={formatDate(row.original.nextDueAt)} days={row.original.daysToDue} />
          ),
        }),
        helper.accessor("lastCalibratedAt", {
          header: t("instruments.history"),
          cell: ({ row }) => (
            <Link
              href={`/instruments/${row.original.id}/history`}
              className="inline-flex items-center gap-1 text-sm whitespace-nowrap underline-offset-4 hover:underline"
              aria-label={t("instruments.history")}
              title={t("instruments.lastShort", { date: formatDate(row.original.lastCalibratedAt) || "—" })}
            >
              <History className="size-4" aria-hidden="true" />
              <span className="hidden 2xl:inline">{t("instruments.history")}</span>
            </Link>
          ),
        }),
      ]),
    [t, selected, allOnPage, rows],
  );

  const ids = [...selected];
  return (
    <>
      {selected.size > 0 && (
        <div
          className="bg-muted sticky top-16 z-20 mb-2 flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm"
          data-testid="bulk-bar"
        >
          <span className="font-medium">{t("common.selected", { count: selected.size })}</span>
          {mode === "due" && <CreateRequestButton ids={ids} onDone={() => setSelected(new Set())} />}
          <Button size="sm" variant="outline" onClick={() => setLabelsOpen(true)}>
            <Printer className="size-4" />
            {t("instruments.printSelected")}
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={`/api/instruments/export?ids=${ids.join(",")}`}>
              <FileSpreadsheet className="size-4" />
              {t("instruments.exportSelected")}
            </a>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <X className="size-4" />
            {t("common.clear")}
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        empty={emptyLabel}
        columnClassName={{
          select: "w-10",
          make: "hidden md:table-cell",
          range: "hidden md:table-cell",
          standardCode: "hidden xl:table-cell",
          adjustable: "hidden xl:table-cell",
          planningDate: "hidden sm:table-cell",
          lastCalibratedAt: "hidden md:table-cell",
        }}
        rowClassName={(r) => (selected.has(r.id) ? "bg-muted/50" : undefined)}
      />
      <LabelsDialog open={labelsOpen} onOpenChange={setLabelsOpen} ids={ids} />
    </>
  );
}
