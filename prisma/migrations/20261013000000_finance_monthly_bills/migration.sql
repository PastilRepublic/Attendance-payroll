-- CreateTable
CREATE TABLE "FinanceBill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "paidWith" "FinancePaidWith" NOT NULL,
    "cardId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBill_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "FinanceEntry" ADD COLUMN "billId" TEXT;

-- CreateIndex
CREATE INDEX "FinanceEntry_billId_idx" ON "FinanceEntry"("billId");

-- AddForeignKey
ALTER TABLE "FinanceBill" ADD CONSTRAINT "FinanceBill_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "FinanceCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_billId_fkey" FOREIGN KEY ("billId") REFERENCES "FinanceBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
