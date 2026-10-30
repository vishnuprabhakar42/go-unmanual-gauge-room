import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CONTRACT_TONE, StatusPill } from "@/components/data/status-pill";
import { toDateInput } from "@/domain/india/format";
import { effectiveContractStatus } from "@/domain/purchase-status";
import { requirePermission } from "@/server/context";
import { tenantDb } from "@/server/tenant";
import { ContractForm } from "../contract-form";
import { ContractStatusButtons, RatesGrid } from "./rates-grid";

export const metadata: Metadata = { title: "Rate contract" };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("rateContract.manage");
  const t = await getTranslations();
  const db = tenantDb(ctx.tenant);
  const c = await db.rateContract.findUnique({
    where: { id },
    include: {
      vendor: { select: { id: true, name: true } },
      items: {
        where: { archivedAt: null },
        include: { instrumentType: { select: { name: true } } },
        orderBy: { instrumentType: { name: "asc" } },
      },
    },
  });
  if (!c) notFound();
  const types = await db.instrumentType.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const status = effectiveContractStatus(c);
  const readOnly = status === "EXPIRED";
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="text-muted-foreground text-sm">
            <Link href="/purchase/contracts" className="hover:underline">
              {t("contracts.title")}
            </Link>
          </div>
          <h1 className="font-mono text-2xl font-semibold">{c.number}</h1>
          <div className="flex items-center gap-2 text-sm">
            <StatusPill label={t(`contractStatus.${status}`)} tone={CONTRACT_TONE[status]} />
            <Link href={`/vendors/${c.vendor.id}`} className="underline-offset-4 hover:underline">
              {c.vendor.name}
            </Link>
          </div>
        </div>
        <ContractStatusButtons id={c.id} status={status} />
      </div>
      <ContractForm
        contractId={c.id}
        readOnly={readOnly}
        vendors={[{ id: c.vendor.id, name: c.vendor.name }]}
        plants={ctx.plants.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))}
        defaults={{
          vendorId: c.vendorId,
          number: c.number,
          plantId: c.plantId ?? "",
          validFrom: toDateInput(c.validFrom),
          validTo: toDateInput(c.validTo),
          notes: c.notes ?? "",
        }}
      />
      <RatesGrid
        contractId={c.id}
        readOnly={readOnly}
        types={types}
        initial={c.items.map((i) => ({
          instrumentTypeId: i.instrumentTypeId,
          rate: String(i.rate.toNumber()),
          gstPercent: String(i.gstPercent.toNumber()),
          onsiteRate: i.onsiteRate ? String(i.onsiteRate.toNumber()) : "",
          tatDays: String(i.tatDays),
        }))}
      />
    </div>
  );
}
