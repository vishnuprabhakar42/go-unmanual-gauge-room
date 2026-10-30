import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { IMPORT_FIELDS } from "@/domain/import/fields";
import { requirePermission } from "@/server/context";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import instruments" };

export default async function ImportPage() {
  const ctx = await requirePermission("instrument.manage");
  const t = await getTranslations("import");
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ImportWizard
        plants={ctx.plants.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))}
        defaultPlantId={ctx.currentPlantId ?? ctx.plants[0]?.id ?? ""}
        fields={IMPORT_FIELDS.map((f) => ({ key: f.key, label: f.label, required: !!f.required }))}
      />
    </>
  );
}
