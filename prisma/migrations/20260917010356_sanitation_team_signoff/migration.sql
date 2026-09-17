-- DropForeignKey
ALTER TABLE "SanitationAssignment" DROP CONSTRAINT "SanitationAssignment_employeeId_fkey";

-- AlterTable
ALTER TABLE "SanitationAssignment" ALTER COLUMN "employeeId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "SanitationAssignment" ADD CONSTRAINT "SanitationAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
