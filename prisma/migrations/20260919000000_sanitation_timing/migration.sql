-- CreateEnum
CREATE TYPE "SanitationTiming" AS ENUM ('PRE_COOKING', 'POST_COOKING', 'ANYTIME');

-- AlterTable
ALTER TABLE "SanitationProcedure" ADD COLUMN     "timing" "SanitationTiming" NOT NULL DEFAULT 'ANYTIME';
