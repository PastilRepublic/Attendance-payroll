-- CreateEnum
CREATE TYPE "SanitationAssignmentStatus" AS ENUM ('PENDING', 'DONE');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('PASS', 'FAIL');

-- CreateTable
CREATE TABLE "SanitationProcedure" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "areaEquipment" TEXT NOT NULL,
    "chemicals" TEXT NOT NULL,
    "steps" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "responsibleRole" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SanitationProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SanitationAssignment" (
    "id" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "SanitationAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "assignedByAdminId" TEXT,
    "inspectedByAdminId" TEXT,
    "inspectedAt" TIMESTAMP(3),
    "inspectionResult" "InspectionResult",
    "inspectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SanitationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SanitationAssignment_employeeId_date_idx" ON "SanitationAssignment"("employeeId", "date");

-- CreateIndex
CREATE INDEX "SanitationAssignment_date_idx" ON "SanitationAssignment"("date");

-- AddForeignKey
ALTER TABLE "SanitationAssignment" ADD CONSTRAINT "SanitationAssignment_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "SanitationProcedure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SanitationAssignment" ADD CONSTRAINT "SanitationAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SanitationAssignment" ADD CONSTRAINT "SanitationAssignment_assignedByAdminId_fkey" FOREIGN KEY ("assignedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SanitationAssignment" ADD CONSTRAINT "SanitationAssignment_inspectedByAdminId_fkey" FOREIGN KEY ("inspectedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
