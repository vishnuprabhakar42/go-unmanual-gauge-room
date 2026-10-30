import Papa from "papaparse";
import type { z } from "zod";
import { gstinStateCode } from "@/domain/india/gstin";
import { coveringVendorIds, type ScopeRow, type ScopeTarget } from "@/domain/scope-match";
import { scopeRowSchema, type vendorSchema } from "@/domain/vendor-schemas";
import { UserError } from "@/server/errors";
import { currentTenant, type TenantClient, type TenantTx } from "@/server/tenant";

type VendorData = z.output<typeof vendorSchema>;

function vendorFields(d: VendorData) {
  return {
    name: d.name,
    gstin: d.gstin ?? null,
    pan: d.pan ?? null,
    address: d.address ?? null,
    stateCode: d.stateCode ?? (d.gstin ? gstinStateCode(d.gstin) : null),
    contacts: d.contacts,
    accreditationType: d.accreditationType,
    nablCertNo: d.nablCertNo ?? null,
    nablValidUntil: d.nablValidUntil ?? null,
    onsiteCapable: d.onsiteCapable,
  };
}

/** Creates the lab record owned by this org and links it (approval is per org). */
export async function createVendor(tx: TenantTx, d: VendorData) {
  const { organizationId } = currentTenant();
  if (d.gstin) {
    const dup = await tx.vendor.findFirst({ where: { gstin: d.gstin, archivedAt: null } });
    if (dup) throw new UserError(`A vendor with GSTIN ${d.gstin} already exists: ${dup.name}`, { gstin: ["Already added"] });
  }
  const vendor = await tx.vendor.create({ data: { ...vendorFields(d), ownerOrganizationId: organizationId } });
  await tx.vendorLink.create({
    data: { organizationId, vendorId: vendor.id, isApproved: d.isApproved, evaluationNotes: d.evaluationNotes ?? null },
  });
  return vendor;
}

export async function updateVendor(tx: TenantTx, id: string, d: VendorData) {
  const { organizationId } = currentTenant();
  const vendor = await tx.vendor.findUniqueOrThrow({ where: { id } });
  if (vendor.ownerOrganizationId === organizationId) {
    if (d.gstin && d.gstin !== vendor.gstin) {
      const dup = await tx.vendor.findFirst({ where: { gstin: d.gstin, id: { not: id }, archivedAt: null } });
      if (dup) throw new UserError(`GSTIN ${d.gstin} is already used by ${dup.name}`, { gstin: ["Already used"] });
    }
    await tx.vendor.update({ where: { id }, data: vendorFields(d) });
  }
  // Approval and evaluation are always this org's own decision
  await tx.vendorLink.updateMany({
    where: { vendorId: id },
    data: { isApproved: d.isApproved, evaluationNotes: d.evaluationNotes ?? null },
  });
}

export async function setVendorArchived(tx: TenantTx, id: string, archived: boolean) {
  await tx.vendorLink.updateMany({ where: { vendorId: id }, data: { archivedAt: archived ? new Date() : null } });
}

async function assertLinked(tx: TenantTx, vendorId: string) {
  const v = await tx.vendor.findUnique({ where: { id: vendorId }, select: { id: true, ownerOrganizationId: true } });
  if (!v) throw new UserError("Vendor not found");
  if (v.ownerOrganizationId !== currentTenant().organizationId) throw new UserError("This lab manages its own scope");
}

export async function addScopeRows(tx: TenantTx, vendorId: string, rows: z.output<typeof scopeRowSchema>[], replace = false) {
  await assertLinked(tx, vendorId);
  if (replace) await tx.vendorScope.updateMany({ where: { vendorId, archivedAt: null }, data: { archivedAt: new Date() } });
  if (rows.length)
    await tx.vendorScope.createMany({ data: rows.map((r) => ({ vendorId, ...r, unit: r.unit ?? null, cmc: r.cmc ?? null })) });
}

export async function removeScopeRow(tx: TenantTx, scopeId: string) {
  const row = await tx.vendorScope.findUniqueOrThrow({ where: { id: scopeId } });
  await assertLinked(tx, row.vendorId);
  await tx.vendorScope.update({ where: { id: scopeId }, data: { archivedAt: new Date() } });
}

export type ScopeCsvResult = { rows: z.output<typeof scopeRowSchema>[]; errors: { line: number; message: string }[] };

/** CSV columns (header names are matched loosely): discipline, parameter, range min, range max, unit, CMC. */
export function parseScopeCsv(text: string): ScopeCsvResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) =>
      h
        .trim()
        .toLowerCase()
        .replace(/[^a-z]/g, ""),
  });
  const pick = (r: Record<string, string>, keys: string[]) => keys.map((k) => r[k]).find((v) => v !== undefined) ?? "";
  const rows: ScopeCsvResult["rows"] = [];
  const errors: ScopeCsvResult["errors"] = [];
  parsed.data.forEach((r, i) => {
    const res = scopeRowSchema.safeParse({
      discipline: pick(r, ["discipline", "field", "group"]),
      parameter: pick(r, ["parameter", "quantity", "measurand", "instrument"]),
      rangeMin: pick(r, ["rangemin", "min", "from", "lowerrange"]),
      rangeMax: pick(r, ["rangemax", "max", "to", "upperrange"]),
      unit: pick(r, ["unit", "uom", "units"]),
      cmc: pick(r, ["cmc", "bestmeasurementcapability", "uncertainty", "bmc"]),
    });
    if (res.success) rows.push(res.data);
    else errors.push({ line: i + 2, message: res.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
  });
  return { rows, errors };
}

/** Linked, approved vendors whose accredited scope covers the target (instrument parameter/range). */
export async function vendorsCovering(db: Pick<TenantClient, "vendorScope">, target: ScopeTarget): Promise<Set<string>> {
  const scopes = await db.vendorScope.findMany({
    where: { archivedAt: null },
    select: { vendorId: true, parameter: true, rangeMin: true, rangeMax: true, unit: true },
  });
  return coveringVendorIds(scopes.map(toScopeRow), target);
}

export function toScopeRow(s: {
  vendorId: string;
  parameter: string;
  rangeMin: { toNumber(): number } | null;
  rangeMax: { toNumber(): number } | null;
  unit: string | null;
}): ScopeRow {
  return {
    vendorId: s.vendorId,
    parameter: s.parameter,
    rangeMin: s.rangeMin?.toNumber() ?? null,
    rangeMax: s.rangeMax?.toNumber() ?? null,
    unit: s.unit,
  };
}

/** Approved NABL vendors whose certificate has expired or expires within `days`. */
export async function nablExpiringCount(db: Pick<TenantClient, "vendor">, organizationId: string, days = 60, now = new Date()) {
  return db.vendor.count({
    where: {
      archivedAt: null,
      accreditationType: "NABL",
      nablValidUntil: { lt: new Date(now.getTime() + days * 86_400_000) },
      links: { some: { organizationId, isApproved: true, archivedAt: null } },
    },
  });
}
