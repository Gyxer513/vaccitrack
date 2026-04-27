-- Phase 1: фундамент под каталоги прививок
-- - Catalog как полноценная сущность (РФ-1122н, МСК-207, …)
-- - VaccineSchedule.catalogId + applicability-поля для сборщика плана
-- - Site.activeCatalogId — активный каталог отделения
-- Прежние schedule'ы остаются с catalogId=NULL (legacy из FoxPro);
-- сидер 1122н в Phase 2 создаст реальные каталоги и привяжет к Site.

CREATE TABLE "Catalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "scope" "Dept" NOT NULL,
    "approvalRef" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isLegacy" BOOLEAN NOT NULL DEFAULT false,
    "parentCatalogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Catalog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Catalog"
    ADD CONSTRAINT "Catalog_parentCatalogId_fkey"
    FOREIGN KEY ("parentCatalogId") REFERENCES "Catalog"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VaccineSchedule"
    ADD COLUMN "catalogId" TEXT,
    ADD COLUMN "appliesToSex" "Sex",
    ADD COLUMN "isEpidContact" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "isCatchUp" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "catchUpMaxAgeYears" INTEGER;

ALTER TABLE "VaccineSchedule"
    ADD CONSTRAINT "VaccineSchedule_catalogId_fkey"
    FOREIGN KEY ("catalogId") REFERENCES "Catalog"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Site"
    ADD COLUMN "activeCatalogId" TEXT;

ALTER TABLE "Site"
    ADD CONSTRAINT "Site_activeCatalogId_fkey"
    FOREIGN KEY ("activeCatalogId") REFERENCES "Catalog"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "VaccineSchedule_catalogId_idx" ON "VaccineSchedule"("catalogId");
CREATE INDEX "Catalog_region_scope_idx" ON "Catalog"("region", "scope");
