-- AlterTable
ALTER TABLE "SanitationProcedure" ADD COLUMN     "bonusAmount" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "SanitationAssignment" ADD COLUMN     "payslipAdjustmentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SanitationAssignment_payslipAdjustmentId_key" ON "SanitationAssignment"("payslipAdjustmentId");

-- AddForeignKey
ALTER TABLE "SanitationAssignment" ADD CONSTRAINT "SanitationAssignment_payslipAdjustmentId_fkey" FOREIGN KEY ("payslipAdjustmentId") REFERENCES "PayslipAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
