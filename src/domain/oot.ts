/**
 * Out-of-tolerance case lifecycle:
 *   OPEN → ASSESSING (impact assessment) → DISPOSITIONED (quality head decides) → CLOSED (optional CAPA ref)
 * Disposition effect on an instrument held ON_HOLD_OOT:
 *   SCRAPPED → SCRAPPED; ADJUSTED | REPAIRED | DOWNGRADED | USE_AS_IS → IN_STORE (decision recorded).
 *   Repaired/adjusted instruments keep their existing due date, so they show up for recalibration.
 */
export const OOT_STATUSES = ["OPEN", "ASSESSING", "DISPOSITIONED", "CLOSED"] as const;
export type OotStatus = (typeof OOT_STATUSES)[number];
export const OOT_DISPOSITIONS = ["ADJUSTED", "REPAIRED", "DOWNGRADED", "SCRAPPED", "USE_AS_IS"] as const;
export type OotDisposition = (typeof OOT_DISPOSITIONS)[number];

export const OOT_TRANSITIONS: Readonly<Record<OotStatus, readonly OotStatus[]>> = {
  OPEN: ["ASSESSING"],
  ASSESSING: ["DISPOSITIONED"],
  DISPOSITIONED: ["CLOSED"],
  CLOSED: [],
};

export function assertOotTransition(from: OotStatus, to: OotStatus) {
  if (!OOT_TRANSITIONS[from].includes(to)) throw new Error(`Cannot move OOT case from ${from} to ${to}`);
}

export function instrumentStatusAfter(disposition: OotDisposition): "SCRAPPED" | "IN_STORE" {
  return disposition === "SCRAPPED" ? "SCRAPPED" : "IN_STORE";
}

/** A disposition needs the impact assessment written first. */
export function dispositionBlockers(c: { impactNotes: string | null; affectedProducts: string | null }): string[] {
  const out: string[] = [];
  if (!c.impactNotes?.trim()) out.push("Write the impact assessment");
  if (c.affectedProducts == null) out.push("List affected products/lots (or “None”)");
  return out;
}

/**
 * As-left failures hold the instrument, so any disposition applies. As-found-only cases (instrument passed
 * after adjustment) are impact assessments: the instrument is already back in use, so scrap/repair don't apply.
 */
export function allowedDispositions(trigger: "AS_LEFT_FAIL" | "AS_FOUND_FAIL"): readonly OotDisposition[] {
  return trigger === "AS_LEFT_FAIL" ? OOT_DISPOSITIONS : ["ADJUSTED", "USE_AS_IS", "DOWNGRADED"];
}
