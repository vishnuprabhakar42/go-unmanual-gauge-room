-- CreateEnum
CREATE TYPE "OotStatus" AS ENUM ('OPEN', 'ASSESSING', 'DISPOSITIONED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OotDisposition" AS ENUM ('ADJUSTED', 'REPAIRED', 'DOWNGRADED', 'SCRAPPED', 'USE_AS_IS');

-- CreateEnum
CREATE TYPE "OotTrigger" AS ENUM ('AS_LEFT_FAIL', 'AS_FOUND_FAIL');

-- AlterTable
ALTER TABLE "CalibrationJob" ADD COLUMN     "certRejectedAt" TIMESTAMP(3),
ADD COLUMN     "certRejectionReason" TEXT;

-- CreateTable
CREATE TABLE "CalibrationReading" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "pointLabel" TEXT NOT NULL,
    "nominal" DECIMAL(18,6) NOT NULL,
    "asFound" DECIMAL(18,6),
    "asLeft" DECIMAL(18,6) NOT NULL,
    "error" DECIMAL(18,6) NOT NULL,
    "permissibleError" DECIMAL(18,6) NOT NULL,
    "uncertainty" DECIMAL(18,6),
    "pass" BOOLEAN NOT NULL,
    "asFoundPass" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalibrationReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OotCase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "status" "OotStatus" NOT NULL DEFAULT 'OPEN',
    "trigger" "OotTrigger" NOT NULL DEFAULT 'AS_LEFT_FAIL',
    "lastGoodCalibrationAt" TIMESTAMP(3),
    "impactNotes" TEXT,
    "affectedProducts" TEXT,
    "disposition" "OotDisposition",
    "dispositionNotes" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "capaRef" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OotCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalibrationReading_jobId_idx" ON "CalibrationReading"("jobId");

-- CreateIndex
CREATE INDEX "OotCase_organizationId_plantId_status_idx" ON "OotCase"("organizationId", "plantId", "status");

-- AddForeignKey
ALTER TABLE "CalibrationReading" ADD CONSTRAINT "CalibrationReading_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CalibrationJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OotCase" ADD CONSTRAINT "OotCase_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CalibrationJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OotCase" ADD CONSTRAINT "OotCase_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
