import type { AppContext } from "@/server/context";

export const plantLabel = (ctx: AppContext, all: string) => {
  const p = ctx.plants.find((x) => x.id === ctx.currentPlantId);
  return p ? `${p.code} · ${p.name}` : all;
};
export const qs = (params: Record<string, string>) => new URLSearchParams(params).toString();
