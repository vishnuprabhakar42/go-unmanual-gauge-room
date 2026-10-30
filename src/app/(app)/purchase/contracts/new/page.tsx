import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/data/page-header";
import { toDateInput } from "@/domain/india/format";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { ContractForm } from "../contract-form";

export const metadata: Metadata = { title: "New rate contract" };

export default async function NewContractPage({ searchParams }: { searchParams: Promise<{ vendor?: string }> }) {
  const ctx = await requirePermission("rateContract.manage");
  const t = await getTranslations("contracts");
  const { vendor } = await searchParams;
  const vendors = await tenantDb(ctx.tenant).vendor.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const now = new Date();
  const fyStart = new Date(Date.UTC(now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1, 3, 1));
  const fyEnd = new Date(Date.UTC(fyStart.getUTCFullYear() + 1, 2, 31));
  return (
    <>
      <PageHeader title={t("add")} subtitle={t("subtitle")} />
      <ContractForm
        vendors={vendors}
        plants={ctx.plants.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))}
        defaults={{
          vendorId: vendor ?? "",
          number: "",
          plantId: "",
          validFrom: toDateInput(fyStart),
          validTo: toDateInput(fyEnd),
          notes: "",
        }}
      />
    </>
  );
}
