-- CreateEnum
CREATE TYPE "CalibrationRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'SOURCING', 'PO_RAISED', 'CLOSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Instrument" ADD COLUMN     "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "CalibrationRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "CalibrationRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "dueWindowFrom" TIMESTAMP(3),
    "dueWindowTo" TIMESTAMP(3),
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalibrationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationRequestItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "CalibrationRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalibrationRequest_organizationId_plantId_status_idx" ON "CalibrationRequest"("organizationId", "plantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationRequest_organizationId_number_key" ON "CalibrationRequest"("organizationId", "number");

-- CreateIndex
CREATE INDEX "CalibrationRequestItem_organizationId_instrumentId_idx" ON "CalibrationRequestItem"("organizationId", "instrumentId");

-- CreateIndex
CREATE INDEX "CalibrationRequestItem_requestId_idx" ON "CalibrationRequestItem"("requestId");

-- CreateIndex
CREATE INDEX "Instrument_organizationId_status_statusChangedAt_idx" ON "Instrument"("organizationId", "status", "statusChangedAt");

-- AddForeignKey
ALTER TABLE "CalibrationRequest" ADD CONSTRAINT "CalibrationRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRequest" ADD CONSTRAINT "CalibrationRequest_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRequestItem" ADD CONSTRAINT "CalibrationRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CalibrationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRequestItem" ADD CONSTRAINT "CalibrationRequestItem_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: existing instruments last changed status when they were last updated.
UPDATE "Instrument" SET "statusChangedAt" = "updatedAt";
