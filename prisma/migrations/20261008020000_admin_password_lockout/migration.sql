-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "passwordFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "passwordLockedUntil" TIMESTAMP(3);
