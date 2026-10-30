import type { TenantClient } from "@/server/tenant";

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type HistoryEntry = {
  jobId: string | null;
  status: string | null;
  calibratedAt: Date | null;
  sentAt: Date | null;
  receivedAt: Date | null;
  tatDays: number | null;
  promisedTatDays: number | null;
  lab: string | null;
  labAccreditation: string | null;
  standardCode: string | null;
  standardDate: Date | null;
  po: { id: string; number: string; date: Date | null } | null;
  challan: { id: string; number: string | null } | null;
  cost: { rate: number; gstPercent: number; gst: number; total: number } | null;
  certificateNo: string | null;
  ulrNo: string | null;
  certificateFileId: string | null;
  result: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  nextDueAt: Date | null;
  readings: number;
  oot: { id: string; status: string; disposition: string | null }[];
  /** Calibration known only from the register (imported/entered date, no job in Gauge Room) */
  manual: boolean;
};

/** Every calibration of an instrument, newest first, with lab, cost, documents and outcome. */
export async function calibrationHistory(db: Pick<TenantClient, "instrument" | "calibrationJob" | "user">, instrumentId: string) {
  const instrument = await db.instrument.findUnique({
    where: { id: instrumentId },
    select: {
      id: true,
      code: true,
      lastCalibratedAt: true,
      nextDueAt: true,
      type: { select: { name: true } },
      make: true,
      serialNo: true,
      plantId: true,
    },
  });
  if (!instrument) return null;
  const jobs = await db.calibrationJob.findMany({
    where: { instrumentId },
    orderBy: [{ calibratedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    include: {
      vendor: { select: { name: true, nablCertNo: true } },
      poItem: {
        select: {
          rate: true,
          gstPercent: true,
          tatDays: true,
          po: { select: { id: true, number: true, sentAt: true, approvedAt: true, createdAt: true } },
        },
      },
      challanItem: { select: { challan: { select: { id: true, number: true } } } },
      ootCases: { select: { id: true, status: true, disposition: true } },
      _count: { select: { readings: true } },
    },
  });
  const users = new Map(
    (
      await db.user.findMany({
        where: { id: { in: jobs.map((j) => j.verifiedById).filter((x): x is string => !!x) } },
        select: { id: true, name: true, email: true },
      })
    ).map((u) => [u.id, u.name ?? u.email]),
  );
  const entries: HistoryEntry[] = jobs.map((j) => {
    const rate = j.poItem?.rate.toNumber();
    const gstPct = j.poItem?.gstPercent.toNumber();
    return {
      jobId: j.id,
      status: j.status,
      calibratedAt: j.calibratedAt,
      sentAt: j.sentAt,
      receivedAt: j.receivedAt,
      tatDays: j.sentAt && j.receivedAt ? Math.round((j.receivedAt.getTime() - j.sentAt.getTime()) / DAY) : null,
      promisedTatDays: j.poItem?.tatDays ?? null,
      lab: j.vendor?.name ?? (j.vendorId ? null : "In-house"),
      labAccreditation: j.labAccreditationNo ?? j.vendor?.nablCertNo ?? null,
      standardCode: j.standardCode,
      standardDate: j.standardDate,
      po: j.poItem
        ? {
            id: j.poItem.po.id,
            number: j.poItem.po.number,
            date: j.poItem.po.sentAt ?? j.poItem.po.approvedAt ?? j.poItem.po.createdAt,
          }
        : null,
      challan: j.challanItem ? { id: j.challanItem.challan.id, number: j.challanItem.challan.number } : null,
      cost:
        rate != null && gstPct != null
          ? { rate, gstPercent: gstPct, gst: r2((rate * gstPct) / 100), total: r2(rate * (1 + gstPct / 100)) }
          : null,
      certificateNo: j.certificateNo,
      ulrNo: j.ulrNo,
      certificateFileId: j.certificateFileId,
      result: j.result,
      verifiedBy: j.verifiedById ? (users.get(j.verifiedById) ?? null) : null,
      verifiedAt: j.verifiedAt,
      nextDueAt: j.nextDueAt,
      readings: j._count.readings,
      oot: j.ootCases,
      manual: false,
    };
  });
  // The register's last calibration date without a matching job (imported or typed in)
  const last = instrument.lastCalibratedAt;
  if (last && !jobs.some((j) => j.calibratedAt && Math.abs(j.calibratedAt.getTime() - last.getTime()) < DAY)) {
    entries.push({
      jobId: null,
      status: null,
      calibratedAt: last,
      sentAt: null,
      receivedAt: null,
      tatDays: null,
      promisedTatDays: null,
      lab: null,
      labAccreditation: null,
      standardCode: null,
      standardDate: null,
      po: null,
      challan: null,
      cost: null,
      certificateNo: null,
      ulrNo: null,
      certificateFileId: null,
      result: null,
      verifiedBy: null,
      verifiedAt: null,
      nextDueAt: null,
      readings: 0,
      oot: [],
      manual: true,
    });
    entries.sort((a, b) => (b.calibratedAt?.getTime() ?? Infinity) - (a.calibratedAt?.getTime() ?? Infinity));
  }
  const done = entries.filter((e) => e.result);
  const tats = entries.map((e) => e.tatDays).filter((x): x is number => x != null);
  const summary = {
    calibrations: entries.filter((e) => e.calibratedAt).length,
    passed: done.filter((e) => e.result === "PASS").length,
    failed: done.filter((e) => e.result === "FAIL").length,
    totalCost: r2(entries.reduce((a, e) => a + (e.cost?.total ?? 0), 0)),
    avgTatDays: tats.length ? Math.round((tats.reduce((a, b) => a + b, 0) / tats.length) * 10) / 10 : null,
    labs: [...new Set(entries.map((e) => e.lab).filter((x): x is string => !!x))],
  };
  return { instrument, entries, summary };
}
