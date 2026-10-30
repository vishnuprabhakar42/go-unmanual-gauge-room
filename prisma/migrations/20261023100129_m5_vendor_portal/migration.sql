-- CreateEnum
CREATE TYPE "LabProgress" AS ENUM ('RECEIVED_AT_LAB', 'IN_PROGRESS', 'DISPATCHED_BACK');

-- AlterTable
ALTER TABLE "CalibrationJob" ADD COLUMN     "labProgress" "LabProgress",
ADD COLUMN     "labUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "returnAwb" TEXT,
ADD COLUMN     "returnCourier" TEXT,
ADD COLUMN     "returnNote" TEXT;

-- AlterTable
ALTER TABLE "VendorUser" ADD COLUMN     "archivedAt" TIMESTAMP(3);
