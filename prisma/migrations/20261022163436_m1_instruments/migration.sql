-- CreateEnum
CREATE TYPE "InstrumentCategory" AS ENUM ('DIMENSIONAL', 'PRESSURE', 'THERMAL', 'ELECTRICAL', 'MASS', 'TORQUE', 'FORCE', 'FLOW', 'OTHER');

-- CreateEnum
CREATE TYPE "FrequencyUnit" AS ENUM ('DAYS', 'MONTHS');

-- CreateEnum
CREATE TYPE "Criticality" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "CalibrationSource" AS ENUM ('EXTERNAL', 'INHOUSE');

-- CreateEnum
CREATE TYPE "InstrumentStatus" AS ENUM ('IN_STORE', 'IN_USE', 'AWAITING_DISPATCH', 'AT_VENDOR', 'RECEIVED_PENDING_VERIFICATION', 'ON_HOLD_OOT', 'SCRAPPED', 'LOST');

-- CreateEnum
CREATE TYPE "InstrumentEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'SENT', 'RECEIVED', 'CALIBRATED', 'OOT', 'MOVED', 'EDITED');

-- CreateTable
CREATE TABLE "InstrumentType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "InstrumentCategory" NOT NULL DEFAULT 'OTHER',
    "parameter" TEXT,
    "unit" TEXT,
    "defaultFrequencyValue" INTEGER NOT NULL DEFAULT 12,
    "defaultFrequencyUnit" "FrequencyUnit" NOT NULL DEFAULT 'MONTHS',
    "defaultTolerance" TEXT,
    "nablRequired" BOOLEAN NOT NULL DEFAULT true,
    "hsnCode" TEXT,
    "defaultLeadTimeDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "InstrumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "description" TEXT,
    "make" TEXT,
    "model" TEXT,
    "serialNo" TEXT,
    "rangeMin" DECIMAL(18,6),
    "rangeMax" DECIMAL(18,6),
    "unit" TEXT,
    "leastCount" DECIMAL(18,6),
    "tolerancePlus" DECIMAL(18,6),
    "toleranceMinus" DECIMAL(18,6),
    "acceptanceCriteria" TEXT,
    "departmentId" TEXT,
    "locationId" TEXT,
    "custodianName" TEXT,
    "criticality" "Criticality" NOT NULL DEFAULT 'B',
    "calibrationSource" "CalibrationSource" NOT NULL DEFAULT 'EXTERNAL',
    "frequencyValue" INTEGER NOT NULL,
    "frequencyUnit" "FrequencyUnit" NOT NULL,
    "lastCalibratedAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3),
    "status" "InstrumentStatus" NOT NULL DEFAULT 'IN_STORE',
    "nablRequired" BOOLEAN NOT NULL DEFAULT true,
    "purchaseValue" DECIMAL(14,2),
    "qrToken" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "type" "InstrumentEventType" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,

    CONSTRAINT "InstrumentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstrumentType_organizationId_name_key" ON "InstrumentType"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_qrToken_key" ON "Instrument"("qrToken");

-- CreateIndex
CREATE INDEX "Instrument_organizationId_plantId_nextDueAt_idx" ON "Instrument"("organizationId", "plantId", "nextDueAt");

-- CreateIndex
CREATE INDEX "Instrument_organizationId_status_idx" ON "Instrument"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Instrument_organizationId_typeId_idx" ON "Instrument"("organizationId", "typeId");

-- CreateIndex
CREATE INDEX "Instrument_organizationId_departmentId_idx" ON "Instrument"("organizationId", "departmentId");

-- CreateIndex
CREATE INDEX "Instrument_organizationId_serialNo_idx" ON "Instrument"("organizationId", "serialNo");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_organizationId_code_key" ON "Instrument"("organizationId", "code");

-- CreateIndex
CREATE INDEX "InstrumentEvent_instrumentId_at_idx" ON "InstrumentEvent"("instrumentId", "at");

-- CreateIndex
CREATE INDEX "InstrumentEvent_organizationId_at_idx" ON "InstrumentEvent"("organizationId", "at");

-- CreateIndex
CREATE INDEX "SavedView_organizationId_page_idx" ON "SavedView"("organizationId", "page");

-- CreateIndex
CREATE INDEX "Attachment_organizationId_entityType_entityId_idx" ON "Attachment"("organizationId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "InstrumentType" ADD CONSTRAINT "InstrumentType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instrument" ADD CONSTRAINT "Instrument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instrument" ADD CONSTRAINT "Instrument_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instrument" ADD CONSTRAINT "Instrument_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "InstrumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instrument" ADD CONSTRAINT "Instrument_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instrument" ADD CONSTRAINT "Instrument_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentEvent" ADD CONSTRAINT "InstrumentEvent_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
