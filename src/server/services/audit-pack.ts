import { createId } from "@paralleldrive/cuid2";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { assertAuditPackTransition, isOverdue, periodError, planLayout, type AuditPackStatus } from "@/domain/audit-pack";
import { startOfIstDay } from "@/domain/due";
import { formatDate, formatDateTime } from "@/domain/india/format";
import { UserError } from "@/server/errors";
import { enqueue } from "@/server/jobs/boss";
import { notify } from "@/server/notify/notifier";
import { renderFront, renderSection, safe, type SectionDoc } from "@/server/pdf/audit-pack";
import { objectKey, storage } from "@/server/storage";
import { currentTenant, tenantDb, withTenantTx, type TenantContext, type TenantTx } from "@/server/tenant";

const STATUS_LABEL: Record<string, string> = {
  IN_STORE: "In store",
  IN_USE: "In use",
  AWAITING_DISPATCH: "Awaiting dispatch",
  AT_VENDOR: "At lab",
  RECEIVED_PENDING_VERIFICATION: "Back, verifying",
  ON_HOLD_OOT: "On hold (OOT)",
  SCRAPPED: "Scrapped",
  LOST: "Lost",
};
const DISPOSITION: Record<string, string> = {
  ADJUSTED: "Adjusted / recalibrated",
  REPAIRED: "Repaired",
  DOWNGRADED: "Downgraded",
  SCRAPPED: "Scrapped",
  USE_AS_IS: "Use as is",
};

/** Queues an audit pack for a plant and period (inclusive IST dates). */
export async function requestAuditPack(tx: TenantTx, input: { plantId: string; from: Date; to: Date }, now = new Date()) {
  const { organizationId, actorId } = currentTenant();
  if (!actorId) throw new Error("An audit pack needs a requesting user");
  const err = periodError(startOfIstDay(input.from), startOfIstDay(input.to), now);
  if (err) throw new UserError(err);
  await tx.plant.findUniqueOrThrow({ where: { id: input.plantId } }); // plant must be accessible
  const pack = await tx.auditPack.create({
    // whole IST days: from 00:00 on the first day to 23:59:59.999 on the last
    data: {
      organizationId,
      plantId: input.plantId,
      periodFrom: startOfIstDay(input.from),
      periodTo: new Date(startOfIstDay(input.to).getTime() + 86_400_000 - 1),
      requestedById: actorId,
    },
  });
  await enqueue("auditpack.generate", { auditPackId: pack.id, organizationId }, { tx });
  return pack;
}

async function setStatus(ctx: TenantContext, id: string, to: AuditPackStatus, data: Record<string, unknown> = {}) {
  await withTenantTx(ctx, async (tx) => {
    const p = await tx.auditPack.findUniqueOrThrow({ where: { id } });
    assertAuditPackTransition(p.status, to);
    await tx.auditPack.update({ where: { id }, data: { ...data, status: to } });
  });
}

/** Retry a failed pack. */
export async function retryAuditPack(tx: TenantTx, id: string) {
  const { organizationId } = currentTenant();
  const p = await tx.auditPack.findUniqueOrThrow({ where: { id } });
  if (p.status !== "FAILED") throw new UserError("Only failed packs can be retried");
  await tx.auditPack.update({ where: { id }, data: { status: "QUEUED", error: null } });
  await enqueue("auditpack.generate", { auditPackId: id, organizationId }, { tx });
}

/**
 * Worker entry point: renders every section, merges certificates, stamps page numbers, stores the PDF and
 * notifies the requester. Runs as the requesting user (so the data is exactly what they may see).
 */
export async function generateAuditPack(auditPackId: string, organizationId: string, now = new Date()) {
  const sys: TenantContext = { organizationId, actorId: null, plantIds: "ALL", ip: null };
  const pack = await tenantDb(sys).auditPack.findUnique({ where: { id: auditPackId } });
  if (!pack || pack.status !== "QUEUED") return { skipped: true as const };
  const ctx: TenantContext = { organizationId, actorId: pack.requestedById, plantIds: "ALL", ip: null };
  await setStatus(ctx, pack.id, "RUNNING", { startedAt: new Date() });
  try {
    const result = await buildPack(ctx, pack, now);
    await withTenantTx(ctx, async (tx) => {
      const id = createId();
      const fileName = `Audit-pack_${result.plantCode}_${formatDate(pack.periodFrom)}_${formatDate(pack.periodTo)}.pdf`;
      const fileKey = objectKey(organizationId, "audit-packs", fileName, id);
      await storage().put({ key: fileKey, body: result.pdf, contentType: "application/pdf" });
      await tx.attachment.create({
        data: {
          id,
          organizationId,
          entityType: "AuditPack",
          entityId: pack.id,
          fileKey,
          fileName,
          mime: "application/pdf",
          size: result.pdf.length,
          uploadedBy: pack.requestedById,
        },
      });
      const p = await tx.auditPack.findUniqueOrThrow({ where: { id: pack.id } });
      assertAuditPackTransition(p.status, "READY");
      await tx.auditPack.update({
        where: { id: pack.id },
        data: { status: "READY", fileId: id, pageCount: result.pages, stats: result.stats, finishedAt: new Date() },
      });
      const user = await tx.user.findUnique({ where: { id: pack.requestedById }, select: { id: true, email: true } });
      if (user)
        await notify(tx, {
          template: "auditpack.ready",
          payload: {
            plant: result.plantCode,
            period: `${formatDate(pack.periodFrom)} to ${formatDate(pack.periodTo)}`,
            pages: result.pages,
            url: `${process.env.APP_URL ?? "http://localhost:3000"}/reports`,
          },
          to: [{ channel: "EMAIL", recipient: user.email, userId: user.id }],
        });
    });
    return { skipped: false as const, pages: result.pages, stats: result.stats };
  } catch (err) {
    console.error("[audit-pack] failed", pack.id, err);
    const error = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    await setStatus(ctx, pack.id, "FAILED", { error, finishedAt: new Date() });
    return { skipped: false as const, failed: error }; // no pg-boss retry: the user retries from the screen
  }
}

type Pack = { id: string; plantId: string; periodFrom: Date; periodTo: Date; requestedById: string };

async function buildPack(ctx: TenantContext, pack: Pack, now: Date) {
  const db = tenantDb(ctx);
  // overdue = due before the start of the as-at day (due today is not overdue)
  const asOf = startOfIstDay(pack.periodTo < now ? pack.periodTo : now);
  const range = { gte: pack.periodFrom, lte: pack.periodTo };
  const [org, plant, requester] = [
    await db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { name: true, address: true } }),
    await db.plant.findUniqueOrThrow({ where: { id: pack.plantId }, select: { code: true, name: true } }),
    await db.user.findUnique({ where: { id: pack.requestedById }, select: { name: true, email: true } }),
  ];

  const register = await db.instrument.findMany({
    where: { plantId: pack.plantId, archivedAt: null },
    orderBy: { code: "asc" },
    select: {
      code: true,
      description: true,
      serialNo: true,
      status: true,
      lastCalibratedAt: true,
      nextDueAt: true,
      type: { select: { name: true } },
      location: { select: { name: true } },
      department: { select: { name: true } },
    },
  });
  const overdue = register.filter((i) => isOverdue(i, asOf));
  const jobs = await db.calibrationJob.findMany({
    where: { plantId: pack.plantId, verifiedAt: { not: null }, calibratedAt: range },
    orderBy: [{ calibratedAt: "asc" }],
    select: {
      calibratedAt: true,
      certificateNo: true,
      ulrNo: true,
      result: true,
      certificateFileId: true,
      verifiedById: true,
      vendorId: true,
      instrument: { select: { code: true, type: { select: { name: true } } } },
      vendor: { select: { name: true } },
    },
  });
  const oot = await db.ootCase.findMany({
    where: {
      plantId: pack.plantId,
      createdAt: { lte: pack.periodTo },
      OR: [{ createdAt: { gte: pack.periodFrom } }, { status: { not: "CLOSED" } }, { closedAt: { gte: pack.periodFrom } }],
    },
    orderBy: { createdAt: "asc" },
    include: { instrument: { select: { code: true } } },
  });
  const vendorIds = [...new Set(jobs.map((j) => j.vendorId).filter((x): x is string => !!x))];
  const vendors = await db.vendor.findMany({
    where: { id: { in: vendorIds } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, accreditationType: true, nablCertNo: true, nablValidUntil: true },
  });
  const userIds = [
    ...new Set([...jobs.map((j) => j.verifiedById), ...oot.map((o) => o.decidedById)].filter((x): x is string => !!x)),
  ];
  const users = new Map(
    (await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })).map((u) => [
      u.id,
      u.name ?? u.email,
    ]),
  );
  const lastCalByVendor = new Map<string, Date>();
  for (const j of jobs)
    if (j.vendorId && j.calibratedAt && (!lastCalByVendor.get(j.vendorId) || j.calibratedAt > lastCalByVendor.get(j.vendorId)!))
      lastCalByVendor.set(j.vendorId, j.calibratedAt);

  const period = `${formatDate(pack.periodFrom)} to ${formatDate(pack.periodTo)}`;
  const plantLabel = `${plant.code} · ${plant.name}`;
  const sections: SectionDoc<never>[] = [
    {
      number: 1,
      title: "Instrument register",
      subtitle: `${register.length} instruments · status as at ${formatDate(asOf)}`,
      columns: [
        { header: "Code", width: 13, value: (r) => r.code },
        { header: "Type / description", width: 27, value: (r) => [r.type.name, r.description].filter(Boolean).join(" · ") },
        { header: "Serial no.", width: 12, value: (r) => r.serialNo ?? "" },
        { header: "Location", width: 14, value: (r) => r.location?.name ?? r.department?.name ?? "" },
        { header: "Last cal.", width: 10, value: (r) => formatDate(r.lastCalibratedAt) },
        { header: "Next due", width: 10, value: (r) => formatDate(r.nextDueAt) },
        { header: "Status", width: 14, value: (r) => STATUS_LABEL[r.status] ?? r.status },
      ],
      rows: register,
      rowIsBad: (r) => isOverdue(r, asOf),
      empty: "No instruments registered for this plant.",
    } satisfies SectionDoc<(typeof register)[number]>,
    {
      number: 2,
      title: "Overdue instruments",
      subtitle: `Active instruments past their due date at ${formatDate(asOf)}`,
      notice: overdue.length
        ? { tone: "warn", text: `${overdue.length} instrument(s) overdue — see below.` }
        : { tone: "ok", text: "No instruments overdue." },
      columns: [
        { header: "Code", width: 14, value: (r) => r.code },
        { header: "Type", width: 30, value: (r) => r.type.name },
        { header: "Location", width: 18, value: (r) => r.location?.name ?? r.department?.name ?? "" },
        { header: "Due", width: 12, value: (r) => formatDate(r.nextDueAt) },
        {
          header: "Days over",
          width: 10,
          align: "right",
          value: (r) => String(Math.floor((asOf.getTime() - r.nextDueAt!.getTime()) / 86_400_000)),
        },
        { header: "Status", width: 16, value: (r) => STATUS_LABEL[r.status] ?? r.status },
      ],
      rows: overdue,
      rowIsBad: () => true,
      empty: "",
    } satisfies SectionDoc<(typeof register)[number]>,
    {
      number: 3,
      title: "Calibrations in the period",
      subtitle: `${jobs.length} verified calibrations · ${period}`,
      columns: [
        { header: "Date", width: 10, value: (r) => formatDate(r.calibratedAt) },
        { header: "Instrument", width: 12, value: (r) => r.instrument.code },
        { header: "Type", width: 20, value: (r) => r.instrument.type.name },
        { header: "Lab", width: 20, value: (r) => r.vendor?.name ?? "In-house" },
        { header: "Certificate / ULR", width: 22, value: (r) => [r.certificateNo, r.ulrNo].filter(Boolean).join(" / ") },
        { header: "Result", width: 7, value: (r) => r.result ?? "" },
        { header: "Verified by", width: 9, value: (r) => users.get(r.verifiedById ?? "") ?? "" },
      ],
      rows: jobs,
      rowIsBad: (r) => r.result === "FAIL",
      empty: "No calibrations were verified in this period.",
    } satisfies SectionDoc<(typeof jobs)[number]>,
    {
      number: 4,
      title: "Out-of-tolerance cases",
      subtitle: `Opened in the period or still open · ${oot.length} case(s)`,
      columns: [
        { header: "Instrument", width: 11, value: (r) => r.instrument.code },
        { header: "Opened", width: 10, value: (r) => formatDate(r.createdAt) },
        { header: "Trigger", width: 10, value: (r) => (r.trigger === "AS_LEFT_FAIL" ? "Failed cal." : "As found") },
        {
          header: "Impact / affected products",
          width: 29,
          value: (r) => [r.impactNotes, r.affectedProducts].filter(Boolean).join(" — "),
        },
        { header: "Disposition", width: 16, value: (r) => (r.disposition ? DISPOSITION[r.disposition] : "Pending") },
        {
          header: "Decided",
          width: 14,
          value: (r) => (r.decidedAt ? `${users.get(r.decidedById ?? "") ?? ""} ${formatDate(r.decidedAt)}` : ""),
        },
        { header: "Status", width: 10, value: (r) => r.status + (r.capaRef ? ` (${r.capaRef})` : "") },
      ],
      rows: oot,
      rowIsBad: (r) => r.status !== "CLOSED",
      empty: "No out-of-tolerance cases in this period.",
      landscape: true,
    } satisfies SectionDoc<(typeof oot)[number]>,
    {
      number: 5,
      title: "Laboratory accreditation",
      subtitle: "Labs that calibrated instruments in the period, with NABL certificate and validity",
      columns: [
        { header: "Laboratory", width: 34, value: (r) => r.name },
        { header: "Accreditation", width: 12, value: (r) => r.accreditationType },
        { header: "NABL cert. no.", width: 16, value: (r) => r.nablCertNo ?? "—" },
        { header: "Valid until", width: 12, value: (r) => formatDate(r.nablValidUntil) },
        { header: "Valid on last calibration", width: 26, value: (r) => validity(r, lastCalByVendor.get(r.id)) },
      ],
      rows: vendors,
      rowIsBad: (r) => validity(r, lastCalByVendor.get(r.id)).startsWith("No"),
      empty: "No external labs were used in this period.",
    } satisfies SectionDoc<(typeof vendors)[number]>,
  ] as unknown as SectionDoc<never>[];

  // Render sections (page counts are needed for the index)
  const sectionDocs: PDFDocument[] = [];
  for (const sec of sections) sectionDocs.push(await PDFDocument.load(await renderSection(sec)));

  // Load certificates; damaged files become a placeholder page
  const certs: { label: string; detail: string; doc: PDFDocument | null }[] = [];
  let skipped = 0;
  for (const j of jobs
    .filter((x) => x.certificateFileId)
    .sort(
      (a, b) => a.instrument.code.localeCompare(b.instrument.code) || a.calibratedAt!.getTime() - b.calibratedAt!.getTime(),
    )) {
    const label = `${j.instrument.code} — ${j.certificateNo ?? "certificate"}`;
    const detail = `${formatDate(j.calibratedAt)} · ${j.vendor?.name ?? "In-house"}`;
    try {
      const file = await db.attachment.findUniqueOrThrow({ where: { id: j.certificateFileId! } });
      const doc = await PDFDocument.load(await storage().get(file.fileKey), { ignoreEncryption: true });
      if (doc.getPageCount() < 1) throw new Error("no pages"); // also throws on a missing page tree
      certs.push({ label, detail, doc });
    } catch {
      skipped++;
      certs.push({ label, detail, doc: null });
    }
  }

  const layout = planLayout(
    sections.map((sec, i) => ({ label: `${sec.number}. ${sec.title}`, pages: sectionDocs[i].getPageCount() })),
    certs.map((c) => ({ label: c.label, detail: c.detail, pages: c.doc?.getPageCount() ?? 1 })),
  );
  const front = await PDFDocument.load(
    await renderFront({
      orgName: org.name,
      orgAddress: org.address,
      plant: plantLabel,
      period,
      generatedAt: formatDateTime(now),
      generatedBy: requester?.name ?? requester?.email ?? "",
      summary: [
        ["Instruments in register", String(register.length)],
        ["Overdue", overdue.length ? `${overdue.length} — see section 2` : "None"],
        ["Calibrations verified in period", String(jobs.length)],
        ["Failed calibrations (OOT)", String(jobs.filter((j) => j.result === "FAIL").length)],
        [
          "OOT cases (open / closed)",
          `${oot.filter((o) => o.status !== "CLOSED").length} / ${oot.filter((o) => o.status === "CLOSED").length}`,
        ],
        ["Certificates appended", String(certs.length - skipped) + (skipped ? ` (${skipped} could not be embedded)` : "")],
        ["Total pages", String(layout.totalPages)],
      ],
      entries: layout.entries,
    }),
  );
  if (front.getPageCount() !== 1 + layout.indexPages) throw new Error("Index layout mismatch");

  const out = await PDFDocument.create();
  out.setTitle(`Calibration audit pack ${plant.code} ${period}`);
  out.setAuthor(org.name);
  out.setCreator("Go Unmanual Gauge Room");
  const font = await out.embedFont(StandardFonts.Helvetica);
  const append = async (doc: PDFDocument) => {
    for (const p of await out.copyPages(doc, doc.getPageIndices())) out.addPage(p);
  };
  await append(front);
  for (const d of sectionDocs) await append(d);
  for (const c of certs) {
    if (c.doc) await append(c.doc);
    else {
      const p = out.addPage([595.28, 841.89]);
      p.drawText(safe(`${c.label} (${c.detail})`), { x: 40, y: 780, size: 12, font });
      p.drawText(
        "This certificate file could not be embedded (damaged or protected). The original is on record in Go Unmanual Gauge Room.",
        {
          x: 40,
          y: 756,
          size: 9,
          font,
        },
      );
    }
  }
  const total = out.getPageCount();
  if (total !== layout.totalPages) throw new Error(`Page count mismatch (${total} vs ${layout.totalPages})`);
  const footer = safe(`${org.name} · ${plant.code} · Calibration audit pack ${period}`);
  out.getPages().forEach((p, i) => {
    const { width } = p.getSize();
    const label = `Page ${i + 1} of ${total}`;
    p.drawText(footer, { x: 28, y: 14, size: 7, font, color: rgb(0.35, 0.35, 0.35) });
    p.drawText(label, { x: width - 28 - font.widthOfTextAtSize(label, 7), y: 14, size: 7, font, color: rgb(0.35, 0.35, 0.35) });
  });

  const stats = {
    instruments: register.length,
    overdue: overdue.length,
    calibrations: jobs.length,
    ootCases: oot.length,
    vendors: vendors.length,
    certificates: certs.length - skipped,
    certificatesSkipped: skipped,
  };
  return { pdf: Buffer.from(await out.save()), pages: total, stats, plantCode: plant.code };
}

function validity(v: { accreditationType: string; nablValidUntil: Date | null }, lastCal: Date | undefined) {
  if (v.accreditationType !== "NABL") return "Not NABL (OEM / other)";
  if (!v.nablValidUntil) return "No validity on file";
  if (lastCal && v.nablValidUntil < lastCal) return `No — expired ${formatDate(v.nablValidUntil)}`;
  return "Yes";
}
