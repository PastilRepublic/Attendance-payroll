-- CreateEnum
CREATE TYPE "SanitationScope" AS ENUM ('COOKING', 'JAR_FILLING', 'BOTH');

-- AlterTable
ALTER TABLE "SanitationProcedure" ADD COLUMN     "appliesTo" "SanitationScope" NOT NULL DEFAULT 'BOTH';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "operationDayOverrideDate" DATE;
