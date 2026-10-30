import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { InstrumentForm } from "../instrument-form";
import { loadFormOptions } from "../form-data";

export const metadata: Metadata = { title: "Add instrument" };

export default async function NewInstrumentPage() {
  const ctx = await requirePermission("instrument.manage");
  const t = await getTranslations("instruments");
  const options = await loadFormOptions(tenantDb(ctx.tenant));
  const plantId = ctx.currentPlantId ?? options.plants[0]?.id ?? "";
  return (
    <>
      <PageHeader title={t("newTitle")} />
      <InstrumentForm
        options={options}
        canSetPlanning={ctx.can("org.manage")}
        defaults={{
          plantId,
          code: "",
          typeId: "",
          criticality: "B",
          calibrationSource: "EXTERNAL",
          frequencyValue: 12,
          frequencyUnit: "MONTHS",
          nablRequired: true,
          lastCalibratedAt: "",
          nextDueAt: "",
        }}
      />
    </>
  );
}
