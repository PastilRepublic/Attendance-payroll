-- AlterTable
ALTER TABLE "FinanceEntry" ADD COLUMN "payPeriodId" TEXT;

-- CreateIndex
CREATE INDEX "FinanceEntry_payPeriodId_idx" ON "FinanceEntry"("payPeriodId");

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "PayPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
