-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "directContractNumber" TEXT,
ADD COLUMN     "hasDirectContract" BOOLEAN NOT NULL DEFAULT false;
