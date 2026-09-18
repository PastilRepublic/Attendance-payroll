-- AlterTable
ALTER TABLE "TaskAssignment" ADD COLUMN     "bonusDismissed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SanitationAssignment" ADD COLUMN     "bonusDismissed" BOOLEAN NOT NULL DEFAULT false;
