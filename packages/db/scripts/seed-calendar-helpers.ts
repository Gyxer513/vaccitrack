/**
 * Общие хелперы для сидеров календарей прививок.
 * Используются как минимум двумя сидерами:
 *   - seed-calendar-rf-1122n.ts (РФ-нацкалендарь)
 *   - seed-calendar-msk-207.ts  (Региональный МСК)
 *
 * Контракт:
 *   - upsertCatalog: идемпотентный create/update по (region, scope, approvalRef)
 *   - replaceSchedules: «снести-и-залить» schedules для каталога,
 *     вместе с зависимостями VaccineScheduleLink (FK).
 *
 * NB: legacy schedules с catalogId=NULL не трогаются никогда.
 */

import type { Prisma } from '@prisma/client'

export type ScheduleSeed = {
  code: string
  name: string
  shortName?: string
  minAgeYears?: number
  minAgeMonths?: number
  minAgeDays?: number
  maxAgeYears?: number
  maxAgeMonths?: number
  maxAgeDays?: number
  isEpid?: boolean
  isEpidContact?: boolean
  isCatchUp?: boolean
  catchUpMaxAgeYears?: number
  appliesToSex?: 'MALE' | 'FEMALE'
}

export type UpsertCatalogParams = {
  name: string
  region: string
  scope: 'KID' | 'ADULT'
  approvalRef: string
  validFrom: Date
  parentCatalogId?: string | null
  isActive?: boolean
  isLegacy?: boolean
  /** Префикс для лога — например '[1122n]' или '[msk207]' */
  logTag?: string
}

/**
 * Идемпотентный upsert каталога по (region, scope, approvalRef).
 * Если каталог найден — обновляются name, validFrom, isActive, isLegacy и parentCatalogId.
 * Если не найден — создаётся новый.
 */
export async function upsertCatalog(
  tx: Prisma.TransactionClient,
  params: UpsertCatalogParams,
) {
  const tag = params.logTag ?? '[seed]'
  const isActive = params.isActive ?? true
  const isLegacy = params.isLegacy ?? false

  const existing = await tx.catalog.findFirst({
    where: {
      region: params.region,
      scope: params.scope,
      approvalRef: params.approvalRef,
    },
  })

  if (existing) {
    console.log(`${tag} каталог ${params.scope} (${params.region}) уже существует (id=${existing.id}), обновляю`)
    return tx.catalog.update({
      where: { id: existing.id },
      data: {
        name: params.name,
        validFrom: params.validFrom,
        isActive,
        isLegacy,
        parentCatalogId: params.parentCatalogId ?? null,
      },
    })
  }

  console.log(`${tag} создаю каталог ${params.scope} (${params.region}): ${params.name}`)
  return tx.catalog.create({
    data: {
      name: params.name,
      region: params.region,
      scope: params.scope,
      approvalRef: params.approvalRef,
      validFrom: params.validFrom,
      isActive,
      isLegacy,
      parentCatalogId: params.parentCatalogId ?? null,
    },
  })
}

/**
 * Удаляет все VaccineScheduleLink (FK-зависимость) и schedules для catalogId,
 * затем заново создаёт все позиции из seeds.
 *
 * Если seeds пуст — старые позиции всё равно удаляются (нужно для
 * случая, когда МСК-сидер позже захочет очистить ADULT-каталог).
 */
export async function replaceSchedules(
  tx: Prisma.TransactionClient,
  catalogId: string,
  seeds: ScheduleSeed[],
  logTag = '[seed]',
) {
  await tx.vaccineScheduleLink.deleteMany({
    where: { vaccineSchedule: { catalogId } },
  })
  const deleted = await tx.vaccineSchedule.deleteMany({ where: { catalogId } })
  if (deleted.count > 0) {
    console.log(`${logTag} catalogId=${catalogId}: удалено ${deleted.count} старых позиций`)
  }

  for (const s of seeds) {
    await tx.vaccineSchedule.create({
      data: {
        code: s.code,
        name: s.name,
        shortName: s.shortName ?? null,
        catalogId,
        isActive: true,
        isEpid: s.isEpid ?? false,
        isEpidContact: s.isEpidContact ?? false,
        isCatchUp: s.isCatchUp ?? false,
        catchUpMaxAgeYears: s.catchUpMaxAgeYears ?? null,
        appliesToSex: s.appliesToSex ?? null,
        minAgeYears: s.minAgeYears ?? 0,
        minAgeMonths: s.minAgeMonths ?? 0,
        minAgeDays: s.minAgeDays ?? 0,
        maxAgeYears: s.maxAgeYears ?? 99,
        maxAgeMonths: s.maxAgeMonths ?? 0,
        maxAgeDays: s.maxAgeDays ?? 0,
      },
    })
  }
}
