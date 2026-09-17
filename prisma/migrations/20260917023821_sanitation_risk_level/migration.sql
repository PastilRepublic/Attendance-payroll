-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "SanitationProcedure" ADD COLUMN     "riskLevel" "RiskLevel" NOT NULL DEFAULT 'MEDIUM';
