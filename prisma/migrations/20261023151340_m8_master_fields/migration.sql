-- AlterTable
ALTER TABLE "CalibrationJob" ADD COLUMN     "standardCode" TEXT,
ADD COLUMN     "standardDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Instrument" ADD COLUMN     "adjustable" BOOLEAN,
ADD COLUMN     "planLeadDays" INTEGER,
ADD COLUMN     "planningDate" TIMESTAMP(3),
ADD COLUMN     "standardCode" TEXT,
ADD COLUMN     "standardDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InstrumentType" ADD COLUMN     "standardCode" TEXT,
ADD COLUMN     "standardDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Instrument_organizationId_planningDate_idx" ON "Instrument"("organizationId", "planningDate");

-- Planning date = next due − lead days (instrument override → type lead time → org "due soon" default → 30).
CREATE OR REPLACE FUNCTION instrument_planning_date() RETURNS trigger AS $$
DECLARE
  lead INTEGER;
BEGIN
  IF NEW."nextDueAt" IS NULL THEN
    NEW."planningDate" := NULL;
    RETURN NEW;
  END IF;
  SELECT COALESCE(
           NEW."planLeadDays",
           (SELECT t."defaultLeadTimeDays" FROM "InstrumentType" t WHERE t."id" = NEW."typeId"),
           (SELECT NULLIF(o."settings"->>'dueSoonDays', '')::INTEGER FROM "Organization" o WHERE o."id" = NEW."organizationId"),
           30)
    INTO lead;
  NEW."planningDate" := NEW."nextDueAt" - make_interval(days => lead);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER instrument_planning_date_ins BEFORE INSERT ON "Instrument"
  FOR EACH ROW EXECUTE FUNCTION instrument_planning_date();
CREATE TRIGGER instrument_planning_date_upd BEFORE UPDATE OF "nextDueAt", "planLeadDays", "typeId", "planningDate" ON "Instrument"
  FOR EACH ROW EXECUTE FUNCTION instrument_planning_date();

-- Type lead time changed → recompute its instruments
CREATE OR REPLACE FUNCTION instrument_type_lead_changed() RETURNS trigger AS $$
BEGIN
  UPDATE "Instrument" SET "nextDueAt" = "nextDueAt" WHERE "typeId" = NEW."id" AND "nextDueAt" IS NOT NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER instrument_type_lead_changed AFTER UPDATE OF "defaultLeadTimeDays" ON "InstrumentType"
  FOR EACH ROW WHEN (OLD."defaultLeadTimeDays" IS DISTINCT FROM NEW."defaultLeadTimeDays")
  EXECUTE FUNCTION instrument_type_lead_changed();

-- Org default changed → recompute the org's instruments
CREATE OR REPLACE FUNCTION organization_due_soon_changed() RETURNS trigger AS $$
BEGIN
  UPDATE "Instrument" SET "nextDueAt" = "nextDueAt" WHERE "organizationId" = NEW."id" AND "nextDueAt" IS NOT NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER organization_due_soon_changed AFTER UPDATE OF "settings" ON "Organization"
  FOR EACH ROW WHEN ((OLD."settings"->>'dueSoonDays') IS DISTINCT FROM (NEW."settings"->>'dueSoonDays'))
  EXECUTE FUNCTION organization_due_soon_changed();

-- Backfill
UPDATE "Instrument" SET "nextDueAt" = "nextDueAt" WHERE "nextDueAt" IS NOT NULL;
