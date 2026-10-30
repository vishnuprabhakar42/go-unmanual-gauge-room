-- CreateEnum
CREATE TYPE "AuditPackStatus" AS ENUM ('QUEUED', 'RUNNING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "AuditPack" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "status" "AuditPackStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedById" TEXT NOT NULL,
    "fileId" TEXT,
    "pageCount" INTEGER,
    "stats" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditPack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditPack_organizationId_plantId_createdAt_idx" ON "AuditPack"("organizationId", "plantId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditPack" ADD CONSTRAINT "AuditPack_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPack" ADD CONSTRAINT "AuditPack_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
