-- CreateTable
CREATE TABLE "LateDayAction" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "payslipAdjustmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LateDayAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LateDayAction_payslipAdjustmentId_key" ON "LateDayAction"("payslipAdjustmentId");

-- CreateIndex
CREATE UNIQUE INDEX "LateDayAction_employeeId_date_key" ON "LateDayAction"("employeeId", "date");

-- AddForeignKey
ALTER TABLE "LateDayAction" ADD CONSTRAINT "LateDayAction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateDayAction" ADD CONSTRAINT "LateDayAction_payslipAdjustmentId_fkey" FOREIGN KEY ("payslipAdjustmentId") REFERENCES "PayslipAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
