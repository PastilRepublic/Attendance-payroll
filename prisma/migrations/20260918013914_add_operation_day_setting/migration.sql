-- CreateEnum
CREATE TYPE "OperationDay" AS ENUM ('COOKING', 'JAR_FILLING');

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "operationDay" "OperationDay" NOT NULL DEFAULT 'COOKING';
