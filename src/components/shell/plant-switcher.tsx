"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { selectPlant } from "./actions";

const ALL = "__all__";

export function PlantSwitcher({
  plants,
  currentPlantId,
  allowAll,
}: {
  plants: { id: string; name: string; code: string }[];
  currentPlantId: string | null;
  allowAll: boolean;
}) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  return (
    <Select
      value={currentPlantId ?? ALL}
      onValueChange={(v) => start(() => selectPlant(v === ALL ? null : v))}
      disabled={pending}
    >
      <SelectTrigger className="h-10 w-full min-w-44 sm:w-56" aria-label={t("nav.plant")} data-testid="plant-switcher">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={ALL}>{t("common.allPlants")}</SelectItem>}
        {plants.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.code} · {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
