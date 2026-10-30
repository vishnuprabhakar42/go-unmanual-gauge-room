import {
  allowedDispositions,
  assertOotTransition,
  dispositionBlockers,
  instrumentStatusAfter,
  type OotDisposition,
  type OotStatus,
} from "@/domain/oot";
import { UserError } from "@/server/errors";
import { currentTenant, type TenantTx } from "@/server/tenant";
import { moveJob } from "./calibration-jobs";
import { changeInstrumentStatus, recordEvent } from "./instruments";

async function move(tx: TenantTx, id: string, to: OotStatus, data: Record<string, unknown> = {}) {
  const c = await tx.ootCase.findUniqueOrThrow({ where: { id } });
  try {
    assertOotTransition(c.status, to);
  } catch (e) {
    throw new UserError((e as Error).message);
  }
  return tx.ootCase.update({ where: { id }, data: { ...data, status: to } });
}

/** Gauge in-charge / quality head records the impact assessment (starts the assessment if still open). */
export async function saveAssessment(
  tx: TenantTx,
  id: string,
  input: { lastGoodCalibrationAt: Date | null; impactNotes: string; affectedProducts: string },
) {
  const c = await tx.ootCase.findUniqueOrThrow({ where: { id } });
  if (c.status === "DISPOSITIONED" || c.status === "CLOSED") throw new UserError("The case is already decided");
  const data = {
    lastGoodCalibrationAt: input.lastGoodCalibrationAt,
    impactNotes: input.impactNotes.trim() || null,
    affectedProducts: input.affectedProducts.trim(),
  };
  if (c.status === "OPEN") await move(tx, id, "ASSESSING", data);
  else await tx.ootCase.update({ where: { id }, data });
}

/** Quality head's decision; applies it to a held instrument and closes the failed job. */
export async function decideDisposition(tx: TenantTx, id: string, disposition: OotDisposition, notes: string, now = new Date()) {
  const { actorId } = currentTenant();
  const c = await tx.ootCase.findUniqueOrThrow({
    where: { id },
    include: { instrument: { select: { id: true, status: true } }, job: { select: { id: true, status: true } } },
  });
  if (c.status !== "ASSESSING") throw new UserError("Record the impact assessment first");
  const blockers = dispositionBlockers(c);
  if (blockers.length) throw new UserError(blockers.join("; "));
  if (!allowedDispositions(c.trigger).includes(disposition))
    throw new UserError("That disposition doesn't apply to an as-found-only case");
  if (!notes.trim()) throw new UserError("Give the reason for the decision");

  await move(tx, id, "DISPOSITIONED", { disposition, dispositionNotes: notes.trim(), decidedById: actorId, decidedAt: now });
  if (c.instrument.status === "ON_HOLD_OOT")
    await changeInstrumentStatus(tx, c.instrument.id, instrumentStatusAfter(disposition));
  if (c.job.status === "VERIFIED_FAIL") await moveJob(tx, c.job.id, "CLOSED");
  await recordEvent(tx, c.instrument.id, "OOT", { disposition, notes: notes.trim(), case: id });
}

export async function closeOot(tx: TenantTx, id: string, capaRef: string | null, now = new Date()) {
  await move(tx, id, "CLOSED", { capaRef: capaRef?.trim() || null, closedAt: now });
}

export type { OotDisposition };
