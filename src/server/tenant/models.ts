import type { Prisma } from "@/generated/prisma/client";

/**
 * Tenancy classification of every Prisma model. A unit test fails if a model is missing here,
 * so new tables cannot silently bypass org scoping.
 */
type ModelName = Prisma.ModelName;

/** Models with an `organizationId` column. All reads/writes are forced into the current org. */
export const ORG_SCOPED_MODELS: ReadonlySet<ModelName> = new Set<ModelName>([
  "Plant",
  "Department",
  "Location",
  "Membership",
  "NumberSeries",
  "Notification",
  "AuditLog",
  "InstrumentType",
  "Instrument",
  "InstrumentEvent",
  "SavedView",
  "Attachment",
  "CalibrationRequest",
  "CalibrationRequestItem",
  "VendorLink",
  "RateContract",
  "RateContractItem",
  "Rfq",
  "RfqVendor",
  "Quote",
  "QuoteItem",
  "PurchaseOrder",
  "PurchaseOrderItem",
  "DeliveryChallan",
  "DeliveryChallanItem",
  "CalibrationJob",
  "CalibrationReading",
  "OotCase",
  "AuditPack",
]);

/** Org-scoped models that are additionally filtered to the user's accessible plants. Value = column holding the plant id. */
export const PLANT_SCOPED_MODELS: Readonly<Partial<Record<ModelName, "plantId" | "id">>> = {
  Plant: "id",
  Department: "plantId",
  Location: "plantId",
  NumberSeries: "plantId",
  Instrument: "plantId",
  CalibrationRequest: "plantId",
  Rfq: "plantId",
  PurchaseOrder: "plantId",
  DeliveryChallan: "plantId",
  CalibrationJob: "plantId",
  OotCase: "plantId",
  AuditPack: "plantId",
  // RateContract.plantId is nullable (= all plants), so it is org-scoped only; services filter by plant.
};

/** Models whose mutations are written to AuditLog automatically. */
export const AUDITED_MODELS: ReadonlySet<ModelName> = new Set<ModelName>([
  "Organization",
  "Plant",
  "Department",
  "Location",
  "Membership",
  "NumberSeries",
  "User",
  "InstrumentType",
  "Instrument",
  "SavedView",
  "Attachment",
  "CalibrationRequest",
  "CalibrationRequestItem",
  "Vendor",
  "VendorLink",
  "VendorScope",
  "RateContract",
  "RateContractItem",
  "Rfq",
  "RfqVendor",
  "Quote",
  "QuoteItem",
  "PurchaseOrder",
  "PurchaseOrderItem",
  "DeliveryChallan",
  "DeliveryChallanItem",
  "CalibrationJob",
  "VendorUser",
  "CalibrationReading",
  "OotCase",
  "AuditPack",
]);

/** Append-only logs: only create/createMany are allowed. */
export const APPEND_ONLY_MODELS: ReadonlySet<ModelName> = new Set<ModelName>(["AuditLog", "InstrumentEvent"]);

/** Models that live outside tenancy (global or auth tables). Access via the tenant client is limited. */
export const GLOBAL_MODELS: ReadonlySet<ModelName> = new Set<ModelName>([
  "Organization", // scoped by id = ctx.organizationId
  "User",
  "Account",
  "Session",
  "VerificationToken",
  "Vendor", // shared lab record: visible when linked to the org (VendorLink)
  "VendorScope", // via vendor link
  "VendorUser", // via vendor link
]);
