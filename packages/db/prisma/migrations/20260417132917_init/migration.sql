-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DOCTOR', 'NURSE', 'REGISTRAR', 'HEAD_DOCTOR');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('PLANNED', 'DONE', 'OVERDUE', 'EXEMPTED', 'REFUSED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('FORM_063U', 'CERTIFICATE', 'PLAN_MONTH', 'REPORT_OPP1', 'REPORT_OPP2', 'REPORT_OPP3', 'REPORT_OPP4', 'REPORT_OPP5', 'REPORT_OPP6', 'REPORT_MEDEXEMPT', 'NOTIFICATION');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "okpo" TEXT,
    "okud" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Doctor" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "userId" TEXT,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "specialty" TEXT,

    CONSTRAINT "Doctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorDistrict" (
    "doctorId" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,

    CONSTRAINT "DoctorDistrict_pkey" PRIMARY KEY ("doctorId","districtId")
);

-- CreateTable
CREATE TABLE "Vaccine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeName" TEXT,
    "producer" TEXT,
    "country" TEXT,
    "dosesMl" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vaccine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaccineSchedule" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isEpid" BOOLEAN NOT NULL DEFAULT false,
    "minAgeYears" INTEGER NOT NULL DEFAULT 0,
    "minAgeMonths" INTEGER NOT NULL DEFAULT 0,
    "minAgeDays" INTEGER NOT NULL DEFAULT 0,
    "maxAgeYears" INTEGER NOT NULL DEFAULT 99,
    "maxAgeMonths" INTEGER NOT NULL DEFAULT 0,
    "maxAgeDays" INTEGER NOT NULL DEFAULT 0,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "intervalMonths" INTEGER NOT NULL DEFAULT 0,
    "intervalYears" INTEGER NOT NULL DEFAULT 0,
    "medExemptionLimitDays" INTEGER NOT NULL DEFAULT 0,
    "medExemptionLimitMonths" INTEGER NOT NULL DEFAULT 0,
    "medExemptionLimitYears" INTEGER NOT NULL DEFAULT 0,
    "nextScheduleId" TEXT,

    CONSTRAINT "VaccineSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaccineScheduleLink" (
    "vaccineId" TEXT NOT NULL,
    "vaccineScheduleId" TEXT NOT NULL,

    CONSTRAINT "VaccineScheduleLink_pkey" PRIMARY KEY ("vaccineId","vaccineScheduleId")
);

-- CreateTable
CREATE TABLE "MedExemptionType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MedExemptionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "RiskGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,

    CONSTRAINT "InsuranceCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "districtId" TEXT,
    "riskGroupId" TEXT,
    "insuranceId" TEXT,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "sex" "Sex" NOT NULL,
    "birthday" DATE NOT NULL,
    "regionId" TEXT,
    "cityName" TEXT,
    "streetName" TEXT,
    "house" TEXT,
    "building" TEXT,
    "structure" TEXT,
    "apartment" TEXT,
    "phone" TEXT,
    "extraAddress" TEXT,
    "policySerial" TEXT,
    "policyNumber" TEXT,
    "isResident" BOOLEAN NOT NULL DEFAULT true,
    "isAlive" BOOLEAN NOT NULL DEFAULT true,
    "isDecret" BOOLEAN NOT NULL DEFAULT false,
    "isGkdc" BOOLEAN NOT NULL DEFAULT false,
    "activeMedExemptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByLogin" TEXT,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientMedExemption" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "medExemptionTypeId" TEXT NOT NULL,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE,
    "note" TEXT,

    CONSTRAINT "PatientMedExemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaccinationRecord" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "vaccineScheduleId" TEXT,
    "vaccineId" TEXT,
    "doctorId" TEXT,
    "createdById" TEXT,
    "isEpid" BOOLEAN NOT NULL DEFAULT false,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "ageYears" INTEGER NOT NULL DEFAULT 0,
    "ageMonths" INTEGER NOT NULL DEFAULT 0,
    "ageDays" INTEGER NOT NULL DEFAULT 0,
    "vaccinationDate" DATE NOT NULL,
    "doseNumber" DOUBLE PRECISION,
    "series" TEXT,
    "checkNumber" TEXT,
    "result" TEXT,
    "medExemptionTypeId" TEXT,
    "medExemptionDate" DATE,
    "nextScheduledDate" DATE,
    "nextScheduleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaccinationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaccinationPlanItem" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "vaccineScheduleId" TEXT NOT NULL,
    "plannedDate" DATE NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'PLANNED',
    "note" TEXT,

    CONSTRAINT "VaccinationPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDocument" (
    "id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "patientId" TEXT,
    "periodFrom" DATE,
    "periodTo" DATE,
    "generatedBy" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileKey" TEXT,

    CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_userId_key" ON "Doctor"("userId");

-- CreateIndex
CREATE INDEX "VaccinationRecord_patientId_idx" ON "VaccinationRecord"("patientId");

-- CreateIndex
CREATE INDEX "VaccinationRecord_vaccinationDate_idx" ON "VaccinationRecord"("vaccinationDate");

-- CreateIndex
CREATE INDEX "VaccinationRecord_vaccineScheduleId_idx" ON "VaccinationRecord"("vaccineScheduleId");

-- CreateIndex
CREATE INDEX "VaccinationPlanItem_plannedDate_idx" ON "VaccinationPlanItem"("plannedDate");

-- CreateIndex
CREATE INDEX "VaccinationPlanItem_status_idx" ON "VaccinationPlanItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VaccinationPlanItem_patientId_vaccineScheduleId_key" ON "VaccinationPlanItem"("patientId", "vaccineScheduleId");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "District" ADD CONSTRAINT "District_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorDistrict" ADD CONSTRAINT "DoctorDistrict_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorDistrict" ADD CONSTRAINT "DoctorDistrict_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vaccine" ADD CONSTRAINT "Vaccine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccineSchedule" ADD CONSTRAINT "VaccineSchedule_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "VaccineSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccineSchedule" ADD CONSTRAINT "VaccineSchedule_nextScheduleId_fkey" FOREIGN KEY ("nextScheduleId") REFERENCES "VaccineSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccineScheduleLink" ADD CONSTRAINT "VaccineScheduleLink_vaccineId_fkey" FOREIGN KEY ("vaccineId") REFERENCES "Vaccine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccineScheduleLink" ADD CONSTRAINT "VaccineScheduleLink_vaccineScheduleId_fkey" FOREIGN KEY ("vaccineScheduleId") REFERENCES "VaccineSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_riskGroupId_fkey" FOREIGN KEY ("riskGroupId") REFERENCES "RiskGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_insuranceId_fkey" FOREIGN KEY ("insuranceId") REFERENCES "InsuranceCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_activeMedExemptionId_fkey" FOREIGN KEY ("activeMedExemptionId") REFERENCES "PatientMedExemption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMedExemption" ADD CONSTRAINT "PatientMedExemption_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientMedExemption" ADD CONSTRAINT "PatientMedExemption_medExemptionTypeId_fkey" FOREIGN KEY ("medExemptionTypeId") REFERENCES "MedExemptionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_vaccineScheduleId_fkey" FOREIGN KEY ("vaccineScheduleId") REFERENCES "VaccineSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_vaccineId_fkey" FOREIGN KEY ("vaccineId") REFERENCES "Vaccine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_medExemptionTypeId_fkey" FOREIGN KEY ("medExemptionTypeId") REFERENCES "MedExemptionType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationPlanItem" ADD CONSTRAINT "VaccinationPlanItem_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationPlanItem" ADD CONSTRAINT "VaccinationPlanItem_vaccineScheduleId_fkey" FOREIGN KEY ("vaccineScheduleId") REFERENCES "VaccineSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
