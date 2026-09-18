-- CreateTable
CREATE TABLE "HalfDayAction" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "payslipAdjustmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HalfDayAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HalfDayAction_payslipAdjustmentId_key" ON "HalfDayAction"("payslipAdjustmentId");

-- CreateIndex
CREATE UNIQUE INDEX "HalfDayAction_employeeId_date_key" ON "HalfDayAction"("employeeId", "date");

-- AddForeignKey
ALTER TABLE "HalfDayAction" ADD CONSTRAINT "HalfDayAction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HalfDayAction" ADD CONSTRAINT "HalfDayAction_payslipAdjustmentId_fkey" FOREIGN KEY ("payslipAdjustmentId") REFERENCES "PayslipAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
