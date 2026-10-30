import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { InstrumentForm } from "../../instrument-form";
import { instrumentToForm, loadFormOptions } from "../../form-data";

export const metadata: Metadata = { title: "Edit instrument" };

export default async function EditInstrumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("instrument.manage");
  const t = await getTranslations("instruments");
  const db = tenantDb(ctx.tenant);
  const instrument = await db.instrument.findUnique({ where: { id } });
  if (!instrument) notFound();
  const options = await loadFormOptions(db);
  return (
    <>
      <PageHeader title={t("editTitle", { code: instrument.code })} />
      <InstrumentForm
        options={options}
        defaults={instrumentToForm(instrument)}
        instrumentId={instrument.id}
        canSetPlanning={ctx.can("org.manage")}
      />
    </>
  );
}
