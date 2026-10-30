"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { DataTable, type BasicFeatures } from "@/components/data/data-table";
import { Field } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { archiveNodeAction, saveNodeAction } from "./actions";

export type NodeRow = {
  id: string;
  name: string;
  parentId: string | null;
  plantId: string;
  plantCode: string;
  depth: number;
  archived: boolean;
};
type Kind = "department" | "location";
type Plant = { id: string; label: string };

const TOP = "__top__";

export function NodeDialog({ kind, plants, nodes, row }: { kind: Kind; plants: Plant[]; nodes: NodeRow[]; row?: NodeRow }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [plantId, setPlantId] = useState(row?.plantId ?? plants[0]?.id ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [parentId, setParentId] = useState(row?.parentId ?? "");
  const [pending, start] = useTransition();
  const parents = nodes.filter((n) => n.plantId === plantId && n.id !== row?.id && !n.archived);

  const save = () =>
    start(async () => {
      const res = await saveNodeAction({ kind, id: row?.id, data: { plantId, name, parentId } });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("common.saved"));
      setOpen(false);
      if (!row) setName("");
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {row ? (
          <Button variant="ghost" size="sm">
            {t("masters.edit")}
          </Button>
        ) : (
          <Button className="h-10">
            <Plus className="size-4" />
            {kind === "department" ? t("masters.addDepartment") : t("masters.addLocation")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {row
              ? `${t("masters.edit")}: ${row.name}`
              : kind === "department"
                ? t("masters.addDepartment")
                : t("masters.addLocation")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={t("masters.plant")} htmlFor="node-plant">
            <Select value={plantId} onValueChange={(v) => (setPlantId(v), setParentId(""))} disabled={!!row}>
              <SelectTrigger id="node-plant" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plants.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("masters.name")} htmlFor="node-name">
            <Input id="node-name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t("masters.parent")} htmlFor="node-parent" optional>
            <Select value={parentId || TOP} onValueChange={(v) => setParentId(v === TOP ? "" : v)}>
              <SelectTrigger id="node-parent" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TOP}>{t("masters.noParent")}</SelectItem>
                {parents.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {"  ".repeat(p.depth)}
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending || !name.trim() || !plantId}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const helper = createColumnHelper<BasicFeatures, NodeRow>();

function ArchiveNode({ kind, row }: { kind: Kind; row: NodeRow }) {
  const t = useTranslations("common");
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await archiveNodeAction({ kind, id: row.id, archived: !row.archived });
          if (!res.ok) toast.error(res.error);
        })
      }
    >
      {row.archived ? t("restore") : t("archive")}
    </Button>
  );
}

export function NodesTable({ kind, rows, plants }: { kind: Kind; rows: NodeRow[]; plants: Plant[] }) {
  const t = useTranslations();
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("name", {
          header: t("masters.name"),
          cell: ({ row }) => (
            <span
              style={{ paddingLeft: `${row.original.depth * 1.25}rem` }}
              className={row.original.archived ? "text-muted-foreground line-through" : ""}
            >
              {row.original.depth > 0 && <span className="text-muted-foreground mr-1">↳</span>}
              {row.original.name}
            </span>
          ),
        }),
        helper.accessor("plantCode", {
          header: t("masters.plant"),
          cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
        }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">{t("common.actions")}</span>,
          cell: ({ row }) => (
            <div className="flex justify-end gap-1">
              {row.original.archived && <Badge variant="secondary">{t("common.archived")}</Badge>}
              {!row.original.archived && <NodeDialog kind={kind} plants={plants} nodes={rows} row={row.original} />}
              <ArchiveNode kind={kind} row={row.original} />
            </div>
          ),
        }),
      ]),
    [t, kind, plants, rows],
  );
  return <DataTable columns={columns} data={rows} getRowId={(r) => r.id} empty={t("masters.nodesEmpty")} />;
}
