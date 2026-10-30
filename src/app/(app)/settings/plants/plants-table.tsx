"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { Factory } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";
import { toast } from "sonner";
import { DataTable, type BasicFeatures } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlantDialog } from "./plant-dialog";
import { setPlantArchivedAction } from "./actions";

export type PlantRow = {
  id: string;
  name: string;
  code: string;
  gstin: string | null;
  address: string | null;
  state: string | null;
  archived: boolean;
};

const helper = createColumnHelper<BasicFeatures, PlantRow>();

function ArchiveButton({ row }: { row: PlantRow }) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!row.archived && !window.confirm(t("plants.archiveConfirm", { name: row.name }))) return;
        start(async () => {
          const res = await setPlantArchivedAction({ id: row.id, archived: !row.archived });
          if (!res.ok) toast.error(res.error);
        });
      }}
    >
      {row.archived ? t("common.restore") : t("common.archive")}
    </Button>
  );
}

export function PlantsTable({ rows }: { rows: PlantRow[] }) {
  const t = useTranslations();
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("code", {
          header: t("plants.code"),
          cell: (c) => <span className="font-mono font-medium">{c.getValue()}</span>,
        }),
        helper.accessor("name", { header: t("plants.name") }),
        helper.accessor("gstin", {
          header: t("plants.gstin"),
          cell: (c) => <span className="font-mono text-xs">{c.getValue() ?? "—"}</span>,
        }),
        helper.accessor("state", { header: t("plants.state"), cell: (c) => c.getValue() ?? "—" }),
        helper.accessor("archived", {
          header: t("plants.status"),
          cell: (c) => (
            <Badge variant={c.getValue() ? "secondary" : "outline"}>
              {c.getValue() ? t("common.archived") : t("common.active")}
            </Badge>
          ),
        }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">{t("common.actions")}</span>,
          cell: ({ row }) => (
            <div className="flex justify-end gap-1">
              {!row.original.archived && <PlantDialog mode="edit" plant={row.original} />}
              <ArchiveButton row={row.original} />
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
      empty={
        <span className="inline-flex items-center gap-2">
          <Factory className="size-4" /> {t("plants.emptyBody")}
        </span>
      }
    />
  );
}
