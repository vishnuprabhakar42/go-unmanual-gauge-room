import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { requirePermission } from "@/server/context";
import { challanCandidates } from "@/server/services/challans";
import { tenantDb } from "@/server/tenant";
import { NewChallanForm } from "./new-challan-form";

export const metadata: Metadata = { title: "New delivery challan" };

export default async function NewChallanPage({ searchParams }: { searchParams: Promise<{ po?: string }> }) {
  const ctx = await requirePermission("dispatch.manage");
  const t = await getTranslations("dispatch");
  const { po: poId } = await searchParams;
  if (!poId) notFound();
  const db = tenantDb(ctx.tenant);
  const found = await db.purchaseOrder.findUnique({ where: { id: poId }, include: { vendor: { select: { name: true } } } });
  if (!found) notFound();
  const { items } = await challanCandidates(db, poId);
  return (
    <>
      <PageHeader title={t("newTitle")} subtitle={t("newSubtitle", { po: found.number, vendor: found.vendor.name })} />
      <NewChallanForm
        poId={poId}
        items={items.map((i) => ({
          poItemId: i.poItemId,
          code: i.code,
          description: i.description,
          hsnCode: i.hsnCode,
          value: i.value,
          blocked: i.blocked,
        }))}
      />
    </>
  );
}
