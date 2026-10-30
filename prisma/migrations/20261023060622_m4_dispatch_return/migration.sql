-- CreateEnum
CREATE TYPE "ChallanStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_RETURNED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('BY_HAND', 'COURIER', 'VEHICLE', 'VENDOR_PICKUP');

-- CreateEnum
CREATE TYPE "CalibrationJobStatus" AS ENUM ('PLANNED', 'PO_RAISED', 'DISPATCHED', 'AT_LAB', 'RETURNED', 'CERT_UPLOADED', 'VERIFIED_PASS', 'VERIFIED_FAIL', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalibrationResult" AS ENUM ('PASS', 'FAIL', 'LIMITED', 'NOT_CALIBRATED');

-- CreateTable
CREATE TABLE "DeliveryChallan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "number" TEXT,
    "date" TIMESTAMP(3),
    "reason" TEXT NOT NULL DEFAULT 'Sent for calibration — returnable, not a supply',
    "consignorGstin" TEXT,
    "consigneeGstin" TEXT,
    "placeOfSupply" TEXT,
    "transportMode" "TransportMode",
    "vehicleNo" TEXT,
    "courierName" TEXT,
    "awbNo" TEXT,
    "ewayBillNo" TEXT,
    "expectedReturnAt" TIMESTAMP(3),
    "status" "ChallanStatus" NOT NULL DEFAULT 'DRAFT',
    "gatePassNo" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "dispatchedById" TEXT,
    "pdfFileId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryChallan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryChallanItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "challanId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "poItemId" TEXT,
    "hsnCode" TEXT,
    "description" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "value" DECIMAL(14,2) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "receiptRemarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryChallanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "vendorId" TEXT,
    "poItemId" TEXT,
    "challanItemId" TEXT,
    "status" "CalibrationJobStatus" NOT NULL DEFAULT 'PLANNED',
    "sentAt" TIMESTAMP(3),
    "atLabAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "calibratedAt" TIMESTAMP(3),
    "certificateNo" TEXT,
    "ulrNo" TEXT,
    "nablMarkPresent" BOOLEAN,
    "labAccreditationNo" TEXT,
    "result" "CalibrationResult",
    "nextDueAt" TIMESTAMP(3),
    "certificateFileId" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verificationChecklist" JSONB,
    "aiExtraction" JSONB,
    "aiConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalibrationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryChallan_organizationId_plantId_status_idx" ON "DeliveryChallan"("organizationId", "plantId", "status");

-- CreateIndex
CREATE INDEX "DeliveryChallan_organizationId_expectedReturnAt_idx" ON "DeliveryChallan"("organizationId", "expectedReturnAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryChallan_organizationId_number_key" ON "DeliveryChallan"("organizationId", "number");

-- CreateIndex
CREATE INDEX "DeliveryChallanItem_organizationId_instrumentId_idx" ON "DeliveryChallanItem"("organizationId", "instrumentId");

-- CreateIndex
CREATE INDEX "DeliveryChallanItem_challanId_idx" ON "DeliveryChallanItem"("challanId");

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationJob_poItemId_key" ON "CalibrationJob"("poItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationJob_challanItemId_key" ON "CalibrationJob"("challanItemId");

-- CreateIndex
CREATE INDEX "CalibrationJob_organizationId_plantId_status_idx" ON "CalibrationJob"("organizationId", "plantId", "status");

-- CreateIndex
CREATE INDEX "CalibrationJob_organizationId_instrumentId_idx" ON "CalibrationJob"("organizationId", "instrumentId");

-- AddForeignKey
ALTER TABLE "DeliveryChallan" ADD CONSTRAINT "DeliveryChallan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryChallan" ADD CONSTRAINT "DeliveryChallan_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryChallan" ADD CONSTRAINT "DeliveryChallan_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryChallan" ADD CONSTRAINT "DeliveryChallan_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryChallanItem" ADD CONSTRAINT "DeliveryChallanItem_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "DeliveryChallan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryChallanItem" ADD CONSTRAINT "DeliveryChallanItem_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryChallanItem" ADD CONSTRAINT "DeliveryChallanItem_poItemId_fkey" FOREIGN KEY ("poItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationJob" ADD CONSTRAINT "CalibrationJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationJob" ADD CONSTRAINT "CalibrationJob_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationJob" ADD CONSTRAINT "CalibrationJob_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationJob" ADD CONSTRAINT "CalibrationJob_poItemId_fkey" FOREIGN KEY ("poItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationJob" ADD CONSTRAINT "CalibrationJob_challanItemId_fkey" FOREIGN KEY ("challanItemId") REFERENCES "DeliveryChallanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
