-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "pinFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "pinLockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "employeePinFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "employeePinLockedUntil" TIMESTAMP(3);
