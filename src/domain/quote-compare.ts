/**
 * Comparison grid for one RFQ: per request item, every vendor's offer with the landed cost
 * (rate incl. GST) and flags. "Recommended" = lowest landed cost among technically approved,
 * in-scope offers (ties → shorter TAT).
 */
export type Offer = {
  quoteId: string;
  quoteItemId: string;
  vendorId: string;
  vendorName: string;
  rate: number;
  gstPercent: number;
  tatDays: number;
  nablInScope: boolean;
  techStatus: "SUBMITTED" | "TECH_APPROVED" | "TECH_REJECTED" | "AWARDED" | "LOST";
  awarded: boolean;
};

export type ComparedOffer = Offer & { landed: number; recommended: boolean; eligible: boolean };

export function landedCost(o: Pick<Offer, "rate" | "gstPercent">): number {
  return Math.round(o.rate * (100 + o.gstPercent)) / 100;
}

export function compareOffers(offers: readonly Offer[]): ComparedOffer[] {
  const enriched = offers.map((o) => ({
    ...o,
    landed: landedCost(o),
    eligible: (o.techStatus === "TECH_APPROVED" || o.techStatus === "AWARDED") && o.nablInScope,
    recommended: false,
  }));
  const best = enriched.filter((o) => o.eligible).sort((a, b) => a.landed - b.landed || a.tatDays - b.tatDays)[0];
  if (best) best.recommended = true;
  return enriched.sort((a, b) => a.landed - b.landed);
}
