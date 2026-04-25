-- CreateEnum
CREATE TYPE "Dept" AS ENUM ('KID', 'ADULT');

-- CreateEnum
CREATE TYPE "ScheduleScope" AS ENUM ('KID', 'ADULT', 'BOTH');

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "dept" "Dept" NOT NULL DEFAULT 'KID';

-- AlterTable
ALTER TABLE "VaccineSchedule" ADD COLUMN     "targetDept" "ScheduleScope" NOT NULL DEFAULT 'BOTH';
