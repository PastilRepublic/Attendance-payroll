-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'SUPERVISOR');

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "role" "AdminRole" NOT NULL DEFAULT 'OWNER';
