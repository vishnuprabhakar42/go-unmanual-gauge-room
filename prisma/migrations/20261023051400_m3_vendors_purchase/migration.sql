-- CreateEnum
CREATE TYPE "AccreditationType" AS ENUM ('NABL', 'OEM', 'OTHER');

-- CreateEnum
CREATE TYPE "VendorLinkStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RateContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "Sourcing" AS ENUM ('CONTRACT', 'RFQ');

-- CreateEnum
CREATE TYPE "RfqStatus" AS ENUM ('OPEN', 'CLOSED', 'AWARDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('SUBMITTED', 'TECH_APPROVED', 'TECH_REJECTED', 'AWARDED', 'LOST');

-- CreateEnum
CREATE TYPE "PoSource" AS ENUM ('RATE_CONTRACT', 'RFQ');

-- CreateEnum
CREATE TYPE "PoStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACKNOWLEDGED', 'CLOSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "CalibrationRequestItem" ADD COLUMN     "proposedVendorId" TEXT,
ADD COLUMN     "rateContractItemId" TEXT,
ADD COLUMN     "scopeWarning" TEXT,
ADD COLUMN     "sourcing" "Sourcing";

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "ownerOrganizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "address" TEXT,
    "stateCode" TEXT,
    "contacts" JSONB NOT NULL DEFAULT '[]',
    "accreditationType" "AccreditationType" NOT NULL DEFAULT 'NABL',
    "nablCertNo" TEXT,
    "nablValidUntil" TIMESTAMP(3),
    "onsiteCapable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "VendorLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "evaluationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "VendorLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorScope" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "rangeMin" DECIMAL(18,6),
    "rangeMax" DECIMAL(18,6),
    "unit" TEXT,
    "cmc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "VendorScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorUser" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateContract" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plantId" TEXT,
    "vendorId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "status" "RateContractStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "RateContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateContractItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "instrumentTypeId" TEXT NOT NULL,
    "rate" DECIMAL(14,2) NOT NULL,
    "gstPercent" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "onsiteRate" DECIMAL(14,2),
    "tatDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "RateContractItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rfq" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "RfqStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqVendor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),

    CONSTRAINT "RfqVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'SUBMITTED',
    "validUntil" TIMESTAMP(3),
    "remarks" TEXT,
    "enteredById" TEXT,
    "techReviewedById" TEXT,
    "techReviewedAt" TIMESTAMP(3),
    "techRemarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "requestItemId" TEXT NOT NULL,
    "rate" DECIMAL(14,2) NOT NULL,
    "gstPercent" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "tatDays" INTEGER NOT NULL,
    "nablInScope" BOOLEAN NOT NULL DEFAULT true,
    "technicalRemarks" TEXT,
    "awarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "requestId" TEXT,
    "rfqId" TEXT,
    "number" TEXT NOT NULL,
    "source" "PoSource" NOT NULL,
    "status" "PoStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interState" BOOLEAN NOT NULL DEFAULT false,
    "pdfFileId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "requestItemId" TEXT,
    "description" TEXT NOT NULL,
    "sacCode" TEXT,
    "rate" DECIMAL(14,2) NOT NULL,
    "gstPercent" DECIMAL(5,2) NOT NULL,
    "tatDays" INTEGER NOT NULL,
    "onsite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vendor_gstin_idx" ON "Vendor"("gstin");

-- CreateIndex
CREATE UNIQUE INDEX "VendorLink_organizationId_vendorId_key" ON "VendorLink"("organizationId", "vendorId");

-- CreateIndex
CREATE INDEX "VendorScope_vendorId_idx" ON "VendorScope"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorUser_vendorId_userId_key" ON "VendorUser"("vendorId", "userId");

-- CreateIndex
CREATE INDEX "RateContract_organizationId_vendorId_idx" ON "RateContract"("organizationId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "RateContract_organizationId_number_key" ON "RateContract"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "RateContractItem_contractId_instrumentTypeId_key" ON "RateContractItem"("contractId", "instrumentTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Rfq_organizationId_number_key" ON "Rfq"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "RfqVendor_rfqId_vendorId_key" ON "RfqVendor"("rfqId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_rfqId_vendorId_key" ON "Quote"("rfqId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteItem_quoteId_requestItemId_key" ON "QuoteItem"("quoteId", "requestItemId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_organizationId_plantId_status_idx" ON "PurchaseOrder"("organizationId", "plantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_organizationId_number_key" ON "PurchaseOrder"("organizationId", "number");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_organizationId_instrumentId_idx" ON "PurchaseOrderItem"("organizationId", "instrumentId");

-- AddForeignKey
ALTER TABLE "CalibrationRequestItem" ADD CONSTRAINT "CalibrationRequestItem_proposedVendorId_fkey" FOREIGN KEY ("proposedVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRequestItem" ADD CONSTRAINT "CalibrationRequestItem_rateContractItemId_fkey" FOREIGN KEY ("rateContractItemId") REFERENCES "RateContractItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorLink" ADD CONSTRAINT "VendorLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorLink" ADD CONSTRAINT "VendorLink_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorScope" ADD CONSTRAINT "VendorScope_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorUser" ADD CONSTRAINT "VendorUser_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorUser" ADD CONSTRAINT "VendorUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateContract" ADD CONSTRAINT "RateContract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateContract" ADD CONSTRAINT "RateContract_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateContract" ADD CONSTRAINT "RateContract_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateContractItem" ADD CONSTRAINT "RateContractItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "RateContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateContractItem" ADD CONSTRAINT "RateContractItem_instrumentTypeId_fkey" FOREIGN KEY ("instrumentTypeId") REFERENCES "InstrumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CalibrationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqVendor" ADD CONSTRAINT "RfqVendor_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqVendor" ADD CONSTRAINT "RfqVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_requestItemId_fkey" FOREIGN KEY ("requestItemId") REFERENCES "CalibrationRequestItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CalibrationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_requestItemId_fkey" FOREIGN KEY ("requestItemId") REFERENCES "CalibrationRequestItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
