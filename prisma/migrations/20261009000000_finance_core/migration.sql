-- CreateEnum
CREATE TYPE "FinanceKind" AS ENUM ('OPENING_BANK', 'OPENING_CASH', 'INCOME', 'EXPENSE', 'CASH_WITHDRAWAL');

-- CreateEnum
CREATE TYPE "FinancePaidWith" AS ENUM ('CASH', 'BANK');

-- CreateTable
CREATE TABLE "FinanceEntry" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "FinanceKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "category" TEXT,
    "paidWith" "FinancePaidWith",
    "note" TEXT,
    "createdByAdminId" TEXT,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),
    "voidedByAdminId" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceEntry_date_idx" ON "FinanceEntry"("date");

-- CreateIndex
CREATE INDEX "FinanceEntry_kind_voided_idx" ON "FinanceEntry"("kind", "voided");

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_voidedByAdminId_fkey" FOREIGN KEY ("voidedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
