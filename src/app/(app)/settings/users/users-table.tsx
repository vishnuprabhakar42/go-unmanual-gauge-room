"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";
import { toast } from "sonner";
import { DataTable, type BasicFeatures } from "@/components/data/data-table";
import { Badge } from "@/components/ui/badge";
import { revokeMembershipAction } from "./actions";

type RoleChip = { id: string; role: string; plant: string | null };
export type UserRow = { id: string; name: string; email: string; isYou: boolean; roles: RoleChip[] };

const helper = createColumnHelper<BasicFeatures, UserRow>();

function RoleBadge({ user, chip }: { user: UserRow; chip: RoleChip }) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  const plant = chip.plant ?? t("common.allPlants");
  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {t(`roles.${chip.role}`)} · {plant}
      <button
        type="button"
        disabled={pending}
        aria-label={`${t("users.revoke")}: ${t(`roles.${chip.role}`)}`}
        className="hover:bg-background/60 rounded-sm p-0.5"
        onClick={() => {
          if (!window.confirm(t("users.revokeConfirm", { role: t(`roles.${chip.role}`), plant, name: user.name }))) return;
          start(async () => {
            const res = await revokeMembershipAction({ membershipId: chip.id });
            if (!res.ok) toast.error(res.error);
          });
        }}
      >
        <X className="size-3" />
      </button>
    </Badge>
  );
}

export function UsersTable({ rows }: { rows: UserRow[] }) {
  const t = useTranslations("users");
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("name", {
          header: t("name"),
          cell: ({ row }) => (
            <div>
              <div className="font-medium">
                {row.original.name}
                {row.original.isYou && <span className="text-muted-foreground ml-1 text-xs">(you)</span>}
              </div>
              <div className="text-muted-foreground text-xs">{row.original.email}</div>
            </div>
          ),
        }),
        helper.accessor("roles", {
          header: t("roles"),
          cell: ({ row }) => (
            <div className="flex flex-wrap gap-1">
              {row.original.roles.map((chip) => (
                <RoleBadge key={chip.id} user={row.original} chip={chip} />
              ))}
            </div>
          ),
        }),
      ]),
    [t],
  );
  return <DataTable columns={columns} data={rows} getRowId={(r) => r.id} empty={t("emptyBody")} />;
}
