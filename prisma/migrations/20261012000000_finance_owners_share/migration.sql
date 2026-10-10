-- AlterEnum
ALTER TYPE "FinanceKind" ADD VALUE 'OWNER_SHARE';
ALTER TYPE "FinanceKind" ADD VALUE 'OWNER_DRAW';

-- CreateTable
CREATE TABLE "FinancePayday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "profit" DECIMAL(12,2) NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "createdByAdminId" TEXT,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancePayday_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "FinanceEntry" ADD COLUMN "ownerId" TEXT,
ADD COLUMN "paydayId" TEXT;

-- CreateIndex
CREATE INDEX "FinancePayday_date_idx" ON "FinancePayday"("date");

-- CreateIndex
CREATE INDEX "FinanceEntry_ownerId_idx" ON "FinanceEntry"("ownerId");

-- CreateIndex
CREATE INDEX "FinanceEntry_paydayId_idx" ON "FinanceEntry"("paydayId");

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_paydayId_fkey" FOREIGN KEY ("paydayId") REFERENCES "FinancePayday"("id") ON DELETE SET NULL ON UPDATE CASCADE;
