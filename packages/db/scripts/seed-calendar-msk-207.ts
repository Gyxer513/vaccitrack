/**
 * Сидер регионального календаря Москвы.
 * Источник: Приказ ДЗМ № 207 от 04.03.2022.
 *
 * Создаёт два каталога (KID и ADULT) с region='RU-MSK', которые
 * **расширяют** соответствующие РФ-1122н каталоги через parentCatalogId.
 * Каждый МСК-каталог содержит только дельту относительно РФ-1122н —
 * план пациента рекурсивно собирает позиции из parent + child.
 *
 * Дельта KID (7 позиций) — то, чего нет в нацкалендаре, но есть в МСК:
 *   - 3 позиции ротавирусной инфекции (плановая, 2/3/4.5 мес.)
 *   - ветряная оспа перед ДОУ
 *   - гепатит A перед ДОУ
 *   - менингококковая инфекция перед ДОУ
 *   - HPV для девочек 12-13 лет
 *
 * Дельта ADULT (0 позиций) — у Москвы для взрослых принципиальных
 * дополнений к федеральному нет. Каталог всё равно создаётся пустой,
 * чтобы можно было активировать его на ADULT-Site (план поднимется
 * по parent-цепочке к РФ).
 *
 * Идемпотентен: использует upsertCatalog/replaceSchedules из
 * seed-calendar-helpers.
 *
 * Запуск: pnpm -F @vaccitrack/db db:seed:msk-207
 *   (после db:seed:rf-1122n; иначе parent не найдётся и каталоги
 *   создадутся без parent с предупреждением)
 */

import { PrismaClient } from '@prisma/client'
import {
  upsertCatalog,
  replaceSchedules,
  type ScheduleSeed,
} from './seed-calendar-helpers'

const prisma = new PrismaClient()

const APPROVAL_REF = 'Приказ ДЗМ № 207 от 04.03.2022'
const VALID_FROM = new Date('2022-04-01T00:00:00.000Z')
const REGION = 'RU-MSK'
const LOG_TAG = '[msk207]'

const RF_APPROVAL_REF = 'Приказ МЗ РФ № 1122н от 06.12.2021'
const RF_REGION = 'RU'

// ============================================================================
// Дельта МСК-207 — KID
// ============================================================================
const KID_DELTA_SCHEDULES: ScheduleSeed[] = [
  {
    code: 'msk207_kid_1',
    name: 'Первая вакцинация против ротавирусной инфекции (плановая)',
    minAgeYears: 0, minAgeMonths: 2, minAgeDays: 0,
  },
  {
    code: 'msk207_kid_2',
    name: 'Вторая вакцинация против ротавирусной инфекции',
    minAgeYears: 0, minAgeMonths: 3, minAgeDays: 0,
  },
  {
    code: 'msk207_kid_3',
    name: 'Третья вакцинация против ротавирусной инфекции',
    minAgeYears: 0, minAgeMonths: 4, minAgeDays: 15,
  },
  {
    code: 'msk207_kid_4',
    name: 'Вакцинация против ветряной оспы перед поступлением в ДОУ',
    minAgeYears: 1, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 6, maxAgeMonths: 11, maxAgeDays: 30,
  },
  {
    code: 'msk207_kid_5',
    name: 'Вакцинация против гепатита A перед поступлением в ДОУ',
    minAgeYears: 3, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 6, maxAgeMonths: 11, maxAgeDays: 30,
  },
  {
    code: 'msk207_kid_6',
    name: 'Вакцинация против менингококковой инфекции перед поступлением в ДОУ',
    minAgeYears: 3, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 6, maxAgeMonths: 11, maxAgeDays: 30,
  },
  {
    code: 'msk207_kid_7',
    name: 'Вакцинация против вируса папилломы человека (девочки)',
    minAgeYears: 12, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 13, maxAgeMonths: 11, maxAgeDays: 30,
    appliesToSex: 'FEMALE',
  },
]

// ============================================================================
// Дельта МСК-207 — ADULT (пусто)
// ============================================================================
const ADULT_DELTA_SCHEDULES: ScheduleSeed[] = []

// ============================================================================
// Поиск parent-каталога РФ-1122n. Если не найден — лог + null (fallback).
// ============================================================================
async function findRfParentId(
  scope: 'KID' | 'ADULT',
): Promise<string | null> {
  const parent = await prisma.catalog.findFirst({
    where: {
      region: RF_REGION,
      scope,
      approvalRef: RF_APPROVAL_REF,
    },
    select: { id: true },
  })
  if (!parent) {
    console.warn(
      `${LOG_TAG} ВНИМАНИЕ: РФ-1122н сидер не запущен (не найден parent для scope=${scope}); ` +
        `создаю МСК-каталог без parent. Запустите db:seed:rf-1122n до этого.`,
    )
    return null
  }
  return parent.id
}

async function main() {
  console.log(`${LOG_TAG} Старт сидера регионального календаря Москвы (Приказ ДЗМ № 207)`)

  // Резолвим parent'ов до транзакции — это просто чтение.
  const kidParentId = await findRfParentId('KID')
  const adultParentId = await findRfParentId('ADULT')

  await prisma.$transaction(async (tx) => {
    const kidCatalog = await upsertCatalog(tx, {
      name: 'Региональный календарь Москвы (детский)',
      region: REGION,
      scope: 'KID',
      approvalRef: APPROVAL_REF,
      validFrom: VALID_FROM,
      parentCatalogId: kidParentId,
      logTag: LOG_TAG,
    })
    const adultCatalog = await upsertCatalog(tx, {
      name: 'Региональный календарь Москвы (взрослый)',
      region: REGION,
      scope: 'ADULT',
      approvalRef: APPROVAL_REF,
      validFrom: VALID_FROM,
      parentCatalogId: adultParentId,
      logTag: LOG_TAG,
    })

    await replaceSchedules(tx, kidCatalog.id, KID_DELTA_SCHEDULES, LOG_TAG)
    await replaceSchedules(tx, adultCatalog.id, ADULT_DELTA_SCHEDULES, LOG_TAG)
  })

  console.log(
    `${LOG_TAG} Готово. KID-дельта=${KID_DELTA_SCHEDULES.length}, ` +
      `ADULT-дельта=${ADULT_DELTA_SCHEDULES.length} (пусто — план поднимется к РФ через parent).`,
  )
}

main()
  .catch((e) => {
    console.error(`${LOG_TAG} Ошибка сидера:`, e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
