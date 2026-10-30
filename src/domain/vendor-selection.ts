/**
 * Rate-contract vendor auto-assignment for a calibration request item:
 * among eligible contract rates for the instrument's type, pick the cheapest, then the shortest TAT.
 * Eligible = contract ACTIVE and valid today, for this plant (or all plants), vendor approved for the org,
 * and — when the instrument needs NABL calibration — a NABL vendor whose certificate is valid today.
 */
export type ContractRate = {
  vendorId: string;
  vendorName: string;
  rateContractItemId: string;
  rate: number;
  tatDays: number;
  contractStatus: "DRAFT" | "ACTIVE" | "EXPIRED";
  contractPlantId: string | null;
  validFrom: Date;
  validTo: Date;
  vendorApproved: boolean;
  accreditationType: "NABL" | "OEM" | "OTHER";
  nablValidUntil: Date | null;
};

export type SelectionResult =
  { sourcing: "CONTRACT"; choice: ContractRate; alternatives: ContractRate[] } | { sourcing: "RFQ"; reason: string };

export function isContractRateUsable(c: ContractRate, plantId: string, nablRequired: boolean, now: Date): string | null {
  if (c.contractStatus !== "ACTIVE") return "contract not active";
  if (now < c.validFrom || now > c.validTo) return "contract outside validity";
  if (c.contractPlantId && c.contractPlantId !== plantId) return "contract for another plant";
  if (!c.vendorApproved) return "vendor not approved";
  if (nablRequired && (c.accreditationType !== "NABL" || !c.nablValidUntil || c.nablValidUntil < now))
    return "NABL accreditation missing or expired";
  return null;
}

export function selectVendor(
  candidates: readonly ContractRate[],
  instrument: { plantId: string; nablRequired: boolean },
  now: Date = new Date(),
): SelectionResult {
  if (!candidates.length) return { sourcing: "RFQ", reason: "No rate contract for this instrument type" };
  const usable = candidates.filter((c) => isContractRateUsable(c, instrument.plantId, instrument.nablRequired, now) === null);
  if (!usable.length) {
    const reasons = [
      ...new Set(candidates.map((c) => isContractRateUsable(c, instrument.plantId, instrument.nablRequired, now))),
    ];
    return { sourcing: "RFQ", reason: `No usable contract (${reasons.join("; ")})` };
  }
  const sorted = [...usable].sort((a, b) => a.rate - b.rate || a.tatDays - b.tatDays || a.vendorName.localeCompare(b.vendorName));
  return { sourcing: "CONTRACT", choice: sorted[0], alternatives: sorted.slice(1) };
}

/** NABL certificate state for display and alerts: expired, expiring within `days`, or valid. */
export function nablState(validUntil: Date | null, days = 60, now: Date = new Date()): "EXPIRED" | "EXPIRING" | "VALID" {
  if (!validUntil || validUntil < now) return "EXPIRED";
  return validUntil.getTime() < now.getTime() + days * 86_400_000 ? "EXPIRING" : "VALID";
}
