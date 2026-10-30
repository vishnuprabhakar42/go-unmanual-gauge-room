import type { DocType } from "@/generated/prisma/client";
import { DEFAULT_SERIES, assertWithinLimit, financialYear, formatDocNumber } from "@/domain/numbering";
import type { TenantTx } from "@/server/tenant";

type SeriesRow = { seq: number; template: string; prefix: string; padding: number };

/**
 * Issues the next document number for a plant + doc type in the financial year of `date`.
 * Must be called inside withTenantTx(): the row lock taken by UPDATE … RETURNING serialises
 * concurrent issuers, and a rollback releases the number (gapless within committed docs).
 */
export async function nextDocNumber(tx: TenantTx, input: { plantId: string; docType: DocType; date?: Date }): Promise<string> {
  const fy = financialYear(input.date ?? new Date());
  const plant = await tx.plant.findUniqueOrThrow({ where: { id: input.plantId } }); // scoped: throws if not accessible

  const existing = await tx.numberSeries.findFirst({
    where: { plantId: plant.id, docType: input.docType, fy: fy.label },
  });
  if (!existing) {
    // New FY: carry forward the plant's latest configuration, else defaults.
    const previous = await tx.numberSeries.findFirst({
      where: { plantId: plant.id, docType: input.docType },
      orderBy: { fy: "desc" },
    });
    const cfg = previous ?? DEFAULT_SERIES[input.docType];
    await tx.numberSeries.createMany({
      data: [
        {
          organizationId: plant.organizationId,
          plantId: plant.id,
          docType: input.docType,
          fy: fy.label,
          prefix: cfg.prefix,
          template: cfg.template,
          padding: cfg.padding,
        },
      ],
      skipDuplicates: true,
    });
  }

  const rows = await tx.$queryRaw<SeriesRow[]>`
    UPDATE "NumberSeries"
       SET "next" = "next" + 1, "updatedAt" = now()
     WHERE "organizationId" = ${plant.organizationId}
       AND "plantId" = ${plant.id}
       AND "docType" = ${input.docType}::"DocType"
       AND "fy" = ${fy.label}
 RETURNING ("next" - 1)::int AS seq, "template", "prefix", "padding"`;
  const row = rows[0];
  if (!row) throw new Error(`Number series missing for ${input.docType} ${fy.label}`);

  const value = formatDocNumber({ ...row, plantCode: plant.code, fy });
  assertWithinLimit(input.docType, value);
  return value;
}
