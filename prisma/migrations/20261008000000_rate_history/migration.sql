-- CreateTable
CREATE TABLE "EmployeeRateChange" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "payRate" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeRateChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationRateChange" (
    "id" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "cookingDayRate" DECIMAL(10,2) NOT NULL,
    "jarFillingDayRate" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationRateChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeRateChange_employeeId_effectiveDate_key" ON "EmployeeRateChange"("employeeId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "OperationRateChange_effectiveDate_key" ON "OperationRateChange"("effectiveDate");

-- AddForeignKey
ALTER TABLE "EmployeeRateChange" ADD CONSTRAINT "EmployeeRateChange_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: today's rates apply to every day so far, so nothing already
-- worked changes price. Later changes are recorded from the day they're made.
INSERT INTO "EmployeeRateChange" ("id", "employeeId", "effectiveDate", "payRate")
SELECT gen_random_uuid()::text, "id", DATE '2000-01-01', "payRate" FROM "Employee";

INSERT INTO "OperationRateChange" ("id", "effectiveDate", "cookingDayRate", "jarFillingDayRate")
SELECT gen_random_uuid()::text, DATE '2000-01-01', "cookingDayRate", "jarFillingDayRate" FROM "Settings" WHERE "id" = 1;
