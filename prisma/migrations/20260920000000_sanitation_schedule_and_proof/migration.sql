-- CreateEnum
CREATE TYPE "SanitationSchedule" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "SanitationProcedure" ADD COLUMN     "schedule" "SanitationSchedule" NOT NULL DEFAULT 'DAILY';

-- AlterTable
ALTER TABLE "SanitationAssignment" ADD COLUMN     "photoUrl" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "sanitationPhotoRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weeklyCleaningDay" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "monthlyCleaningDate" DATE,
ADD COLUMN     "chemicalProduct" TEXT NOT NULL DEFAULT 'Zonrox',
ADD COLUMN     "chemicalStrength" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "chemicalDilution" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "chemicalGuideConfirmedAt" TIMESTAMP(3);
