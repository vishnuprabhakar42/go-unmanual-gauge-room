"use client";

import { formatDate } from "@/domain/india/format";

import { createColumnHelper } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";
import { toast } from "sonner";
import { DataTable, type BasicFeatures } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { archiveTypeAction } from "../actions";
import { TypeDialog, type TypeRow } from "./type-dialog";

const helper = createColumnHelper<BasicFeatures, TypeRow>();

function ArchiveType({ row }: { row: TypeRow }) {
  const t = useTranslations("common");
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await archiveTypeAction({ id: row.id, archived: !row.archived });
          if (!res.ok) toast.error(res.error);
        })
      }
    >
      {row.archived ? t("restore") : t("archive")}
    </Button>
  );
}

export function TypesTable({ rows }: { rows: TypeRow[] }) {
  const t = useTranslations();
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("name", {
          header: t("masters.name"),
          cell: ({ row }) => (
            <div>
              <div className="font-medium">{row.original.name}</div>
              <div className="text-muted-foreground text-xs">
                {[t(`category.${row.original.category}`), row.original.parameter, row.original.unit].filter(Boolean).join(" · ")}
              </div>
            </div>
          ),
        }),
        helper.accessor("defaultFrequencyValue", {
          header: t("masters.defaultFrequency"),
          cell: ({ row }) => `${row.original.defaultFrequencyValue} ${t(`frequencyUnit.${row.original.defaultFrequencyUnit}`)}`,
        }),
        helper.accessor("defaultTolerance", { header: t("masters.tolerance"), cell: (c) => c.getValue() ?? "—" }),
        helper.accessor("nablRequired", {
          header: t("masters.nabl"),
          cell: (c) => (c.getValue() ? t("common.yes") : t("common.no")),
        }),
        helper.accessor("standardCode", {
          header: t("masters.standard"),
          cell: ({ row }) =>
            row.original.standardCode ? (
              <span className="text-xs">
                {row.original.standardCode}
                {row.original.standardDate && (
                  <span className="text-muted-foreground"> · {formatDate(row.original.standardDate)}</span>
                )}
              </span>
            ) : (
              "—"
            ),
        }),
        helper.accessor("hsnCode", {
          header: t("masters.hsn"),
          cell: (c) => <span className="font-mono text-xs">{c.getValue() ?? "—"}</span>,
        }),
        helper.accessor("instruments", { header: t("masters.instruments"), cell: (c) => c.getValue().toLocaleString("en-IN") }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">{t("common.actions")}</span>,
          cell: ({ row }) => (
            <div className="flex justify-end gap-1">
              {row.original.archived && <Badge variant="secondary">{t("common.archived")}</Badge>}
              {!row.original.archived && <TypeDialog row={row.original} />}
              <ArchiveType row={row.original} />
            </div>
          ),
        }),
      ]),
    [t],
  );
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      empty={t("masters.typesEmpty")}
      columnClassName={{
        defaultTolerance: "hidden md:table-cell",
        hsnCode: "hidden md:table-cell",
        standardCode: "hidden lg:table-cell",
        nablRequired: "hidden sm:table-cell",
      }}
    />
  );
}
