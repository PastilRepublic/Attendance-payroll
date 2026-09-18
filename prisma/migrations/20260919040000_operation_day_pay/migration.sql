-- AlterEnum
ALTER TYPE "PayBasis" ADD VALUE 'FLAT_DAILY';
ALTER TYPE "PayBasis" ADD VALUE 'OPERATION_DAY';

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "payBreakdown" JSONB;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "cookingDayRate" DECIMAL(10,2) NOT NULL DEFAULT 400,
ADD COLUMN     "jarFillingDayRate" DECIMAL(10,2) NOT NULL DEFAULT 350;

-- CreateTable
CREATE TABLE "OperationDayLog" (
    "date" DATE NOT NULL,
    "operationDay" "OperationDay" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationDayLog_pkey" PRIMARY KEY ("date")
);
