-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "pinHash" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "adminPinFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "adminPinLockedUntil" TIMESTAMP(3);
