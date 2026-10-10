-- AlterEnum
ALTER TYPE "FinanceKind" ADD VALUE 'CARD_PAYMENT';
ALTER TYPE "FinanceKind" ADD VALUE 'PLATFORM_BALANCE';

-- AlterEnum
ALTER TYPE "FinancePaidWith" ADD VALUE 'CARD';

-- CreateTable
CREATE TABLE "FinanceCard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCard_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "FinanceEntry" ADD COLUMN "cardId" TEXT;

-- CreateIndex
CREATE INDEX "FinanceEntry_cardId_idx" ON "FinanceEntry"("cardId");

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "FinanceCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
