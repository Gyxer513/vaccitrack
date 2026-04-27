/**
 * Сидер национального календаря прививок РФ.
 * Источник: Приказ МЗ РФ № 1122н от 06.12.2021.
 *
 * Создаёт два каталога (KID и ADULT) и наполняет их позициями
 * из приложений 1 (плановый) и 2 (по эпид-показаниям) приказа.
 *
 * Идемпотентен:
 *   - каталог ищется по (region, scope, approvalRef) и upsert'ится
 *   - все VaccineSchedule с этим catalogId перед загрузкой удаляются
 *     (вместе со связями VaccineScheduleLink), затем создаются заново
 *
 * Запуск: pnpm -F @vaccitrack/db db:seed:rf-1122n
 *
 * NB: Legacy schedules с catalogId=NULL (импорт из FoxPro) не трогаем.
 */

import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

const APPROVAL_REF = 'Приказ МЗ РФ № 1122н от 06.12.2021'
const VALID_FROM = new Date('2022-01-01T00:00:00.000Z')
const REGION = 'RU'

type ScheduleSeed = {
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

// ============================================================================
// Приложение 1 — плановый календарь (KID)
// ============================================================================
const KID_PLAN_SCHEDULES: ScheduleSeed[] = [
  {
    code: 'rf1122n_kid_1',
    name: 'Первая вакцинация против вирусного гепатита B',
    minAgeYears: 0, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 0, maxAgeMonths: 0, maxAgeDays: 1,
  },
  {
    code: 'rf1122n_kid_2',
    name: 'Вакцинация против туберкулеза',
    minAgeYears: 0, minAgeMonths: 0, minAgeDays: 3,
    maxAgeYears: 0, maxAgeMonths: 0, maxAgeDays: 7,
  },
  {
    code: 'rf1122n_kid_3',
    name: 'Вторая вакцинация против вирусного гепатита B',
    minAgeYears: 0, minAgeMonths: 1, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_4',
    name: 'Третья вакцинация против вирусного гепатита B (группы риска)',
    minAgeYears: 0, minAgeMonths: 2, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_5',
    name: 'Первая вакцинация против пневмококковой инфекции',
    minAgeYears: 0, minAgeMonths: 2, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_6',
    name: 'Первая вакцинация против дифтерии, коклюша, столбняка',
    minAgeYears: 0, minAgeMonths: 3, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_7',
    name: 'Первая вакцинация против полиомиелита',
    minAgeYears: 0, minAgeMonths: 3, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_8',
    name: 'Первая вакцинация против гемофильной инфекции типа b',
    minAgeYears: 0, minAgeMonths: 3, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_9',
    name: 'Вторая вакцинация против дифтерии, коклюша, столбняка',
    minAgeYears: 0, minAgeMonths: 4, minAgeDays: 15,
  },
  {
    code: 'rf1122n_kid_10',
    name: 'Вторая вакцинация против гемофильной инфекции типа b',
    minAgeYears: 0, minAgeMonths: 4, minAgeDays: 15,
  },
  {
    code: 'rf1122n_kid_11',
    name: 'Вторая вакцинация против полиомиелита',
    minAgeYears: 0, minAgeMonths: 4, minAgeDays: 15,
  },
  {
    code: 'rf1122n_kid_12',
    name: 'Вторая вакцинация против пневмококковой инфекции',
    minAgeYears: 0, minAgeMonths: 4, minAgeDays: 15,
  },
  {
    code: 'rf1122n_kid_13',
    name: 'Третья вакцинация против дифтерии, коклюша, столбняка',
    minAgeYears: 0, minAgeMonths: 6, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_14',
    name: 'Третья вакцинация против вирусного гепатита B',
    minAgeYears: 0, minAgeMonths: 6, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_15',
    name: 'Третья вакцинация против полиомиелита',
    minAgeYears: 0, minAgeMonths: 6, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_16',
    name: 'Третья вакцинация против гемофильной инфекции типа b',
    minAgeYears: 0, minAgeMonths: 6, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_17',
    name: 'Вакцинация против кори, краснухи, эпидемического паротита',
    minAgeYears: 1, minAgeMonths: 0, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_18',
    name: 'Четвертая вакцинация против вирусного гепатита B (группы риска)',
    minAgeYears: 1, minAgeMonths: 0, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_19',
    name: 'Ревакцинация против пневмококковой инфекции',
    minAgeYears: 1, minAgeMonths: 3, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_20',
    name: 'Первая ревакцинация против дифтерии, коклюша, столбняка',
    minAgeYears: 1, minAgeMonths: 6, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_21',
    name: 'Первая ревакцинация против полиомиелита',
    minAgeYears: 1, minAgeMonths: 6, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_22',
    name: 'Ревакцинация против гемофильной инфекции типа b',
    minAgeYears: 1, minAgeMonths: 6, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_23',
    name: 'Вторая ревакцинация против полиомиелита',
    minAgeYears: 1, minAgeMonths: 8, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_24',
    name: 'Ревакцинация против кори, краснухи, эпидемического паротита',
    minAgeYears: 6, minAgeMonths: 0, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_25',
    name: 'Третья ревакцинация против полиомиелита',
    minAgeYears: 6, minAgeMonths: 0, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_26',
    name: 'Вторая ревакцинация против дифтерии, столбняка',
    minAgeYears: 6, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 7, maxAgeMonths: 11, maxAgeDays: 30,
  },
  {
    code: 'rf1122n_kid_27',
    name: 'Ревакцинация против туберкулеза',
    minAgeYears: 6, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 7, maxAgeMonths: 11, maxAgeDays: 30,
  },
  {
    code: 'rf1122n_kid_28',
    name: 'Третья ревакцинация против дифтерии, столбняка',
    minAgeYears: 14, minAgeMonths: 0, minAgeDays: 0,
  },
  {
    code: 'rf1122n_kid_29',
    name: 'Вакцинация против вирусного гепатита B (вдогонку, не привитые ранее)',
    minAgeYears: 1, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 17, maxAgeMonths: 11, maxAgeDays: 30,
    isCatchUp: true, catchUpMaxAgeYears: 17,
  },
  {
    code: 'rf1122n_kid_30',
    name: 'Вакцинация/ревакцинация против краснухи (вдогонку для девочек)',
    minAgeYears: 1, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 17, maxAgeMonths: 11, maxAgeDays: 30,
    isCatchUp: true, catchUpMaxAgeYears: 17, appliesToSex: 'FEMALE',
  },
  {
    code: 'rf1122n_kid_31',
    name: 'Вакцинация/ревакцинация против кори (вдогонку, не привитые ранее)',
    minAgeYears: 1, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 17, maxAgeMonths: 11, maxAgeDays: 30,
    isCatchUp: true, catchUpMaxAgeYears: 17,
  },
  {
    code: 'rf1122n_kid_32',
    name: 'Вакцинация против гриппа (детская группа)',
    minAgeYears: 0, minAgeMonths: 6, minAgeDays: 0,
    maxAgeYears: 17, maxAgeMonths: 11, maxAgeDays: 30,
  },
]

// ============================================================================
// Приложение 1 — плановый календарь (ADULT)
// ============================================================================
const ADULT_PLAN_SCHEDULES: ScheduleSeed[] = [
  {
    code: 'rf1122n_adult_1',
    name: 'Ревакцинация против дифтерии, столбняка (каждые 10 лет)',
    minAgeYears: 18, minAgeMonths: 0, minAgeDays: 0,
  },
  {
    code: 'rf1122n_adult_2',
    name: 'Вакцинация против вирусного гепатита B (вдогонку, не привитые ранее)',
    minAgeYears: 18, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 55, maxAgeMonths: 11, maxAgeDays: 30,
    isCatchUp: true, catchUpMaxAgeYears: 55,
  },
  {
    code: 'rf1122n_adult_3',
    name: 'Вакцинация против краснухи (вдогонку для женщин)',
    minAgeYears: 18, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 25, maxAgeMonths: 11, maxAgeDays: 30,
    isCatchUp: true, catchUpMaxAgeYears: 25, appliesToSex: 'FEMALE',
  },
  {
    code: 'rf1122n_adult_4',
    name: 'Вакцинация/ревакцинация против кори (вдогонку, не привитые)',
    minAgeYears: 18, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 55, maxAgeMonths: 11, maxAgeDays: 30,
    isCatchUp: true, catchUpMaxAgeYears: 55,
  },
  {
    code: 'rf1122n_adult_5',
    name: 'Вакцинация против гриппа (взрослые группы риска)',
    minAgeYears: 18, minAgeMonths: 0, minAgeDays: 0,
  },
]

// ============================================================================
// Приложение 2 — эпид-показания (KID)
// ============================================================================
const KID_EPID_SCHEDULES: ScheduleSeed[] = [
  {
    code: 'rf1122n_epi_kid_polio',
    name: 'Против полиомиелита (контактные дети 3 мес-15 лет)',
    minAgeYears: 0, minAgeMonths: 3, minAgeDays: 0,
    maxAgeYears: 15, maxAgeMonths: 11, maxAgeDays: 30,
    isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_kid_pneumo',
    name: 'Против пневмококковой инфекции (дети 2-5 лет)',
    minAgeYears: 2, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 5, maxAgeMonths: 11, maxAgeDays: 30,
    isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_kid_rota',
    name: 'Против ротавирусной инфекции (детям)',
    minAgeYears: 0, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 17, maxAgeMonths: 11, maxAgeDays: 30,
    isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_kid_hib',
    name: 'Против гемофильной инфекции (не привитые на 1-м году)',
    minAgeYears: 1, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 17, maxAgeMonths: 11, maxAgeDays: 30,
    isEpid: true, isEpidContact: true,
  },
  // BOTH-кейсы (KID-копия)
  {
    code: 'rf1122n_epi_kid_meningo',
    name: 'Против менингококковой инфекции (контактные в очагах)',
    minAgeYears: 0, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 17, maxAgeMonths: 11, maxAgeDays: 30,
    isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_kid_measles_contact',
    name: 'Против кори (контактные лица в очагах)',
    minAgeYears: 0, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 17, maxAgeMonths: 11, maxAgeDays: 30,
    isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_kid_hepb_contact',
    name: 'Против вирусного гепатита B (контактные в очагах)',
    minAgeYears: 0, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 17, maxAgeMonths: 11, maxAgeDays: 30,
    isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_kid_diphtheria_contact',
    name: 'Против дифтерии (контактные в очагах)',
    minAgeYears: 0, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 17, maxAgeMonths: 11, maxAgeDays: 30,
    isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_kid_mumps_contact',
    name: 'Против эпидемического паротита (контактные в очагах)',
    minAgeYears: 0, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 17, maxAgeMonths: 11, maxAgeDays: 30,
    isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_kid_chickenpox',
    name: 'Против ветряной оспы (группы риска)',
    minAgeYears: 0, minAgeMonths: 0, minAgeDays: 0,
    maxAgeYears: 17, maxAgeMonths: 11, maxAgeDays: 30,
    isEpid: true, isEpidContact: true,
  },
]

// ============================================================================
// Приложение 2 — эпид-показания (ADULT)
// ============================================================================
const ADULT_EPID_SCHEDULES: ScheduleSeed[] = [
  {
    code: 'rf1122n_epi_adult_tularemia',
    name: 'Против туляремии',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_plague',
    name: 'Против чумы',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_brucella',
    name: 'Против бруцеллёза',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_anthrax',
    name: 'Против сибирской язвы',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_rabies',
    name: 'Против бешенства',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_lepto',
    name: 'Против лептоспироза',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_tickenc',
    name: 'Против клещевого энцефалита',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_qfever',
    name: 'Против лихорадки Ку',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_yellow',
    name: 'Против жёлтой лихорадки',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_cholera',
    name: 'Против холеры',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_typhoid',
    name: 'Против брюшного тифа',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_shigella',
    name: 'Против шигеллезов',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_pneumo',
    name: 'Против пневмококковой инфекции (60+ и группы риска)',
    minAgeYears: 60, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_covid',
    name: 'Против COVID-19 (18+)',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  // BOTH-кейсы (ADULT-копия)
  {
    code: 'rf1122n_epi_adult_meningo',
    name: 'Против менингококковой инфекции (контактные в очагах)',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_measles_contact',
    name: 'Против кори (контактные лица в очагах)',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_hepb_contact',
    name: 'Против вирусного гепатита B (контактные в очагах)',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_diphtheria_contact',
    name: 'Против дифтерии (контактные в очагах)',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_mumps_contact',
    name: 'Против эпидемического паротита (контактные в очагах)',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
  {
    code: 'rf1122n_epi_adult_chickenpox',
    name: 'Против ветряной оспы (группы риска)',
    minAgeYears: 18, isEpid: true, isEpidContact: true,
  },
]

const KID_SCHEDULES: ScheduleSeed[] = [...KID_PLAN_SCHEDULES, ...KID_EPID_SCHEDULES]
const ADULT_SCHEDULES: ScheduleSeed[] = [...ADULT_PLAN_SCHEDULES, ...ADULT_EPID_SCHEDULES]

// ============================================================================
// Идемпотентный upsert каталога по (region, scope, approvalRef)
// ============================================================================
async function upsertCatalog(
  tx: Prisma.TransactionClient,
  params: { name: string; scope: 'KID' | 'ADULT' },
) {
  const existing = await tx.catalog.findFirst({
    where: {
      region: REGION,
      scope: params.scope,
      approvalRef: APPROVAL_REF,
    },
  })

  if (existing) {
    console.log(`[1122n] каталог ${params.scope} уже существует (id=${existing.id}), обновляю`)
    return tx.catalog.update({
      where: { id: existing.id },
      data: {
        name: params.name,
        validFrom: VALID_FROM,
        isActive: true,
        isLegacy: false,
      },
    })
  }

  console.log(`[1122n] создаю каталог ${params.scope}: ${params.name}`)
  return tx.catalog.create({
    data: {
      name: params.name,
      region: REGION,
      scope: params.scope,
      approvalRef: APPROVAL_REF,
      validFrom: VALID_FROM,
      isActive: true,
      isLegacy: false,
    },
  })
}

// ============================================================================
// Сначала удаляем VaccineScheduleLink (FK-зависимость), потом сами schedules,
// затем заново создаём все позиции
// ============================================================================
async function replaceSchedules(
  tx: Prisma.TransactionClient,
  catalogId: string,
  seeds: ScheduleSeed[],
) {
  await tx.vaccineScheduleLink.deleteMany({
    where: { vaccineSchedule: { catalogId } },
  })
  const deleted = await tx.vaccineSchedule.deleteMany({ where: { catalogId } })
  if (deleted.count > 0) {
    console.log(`[1122n] catalogId=${catalogId}: удалено ${deleted.count} старых позиций`)
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

async function main() {
  console.log('[1122n] Старт сидера приказа МЗ РФ № 1122н')

  await prisma.$transaction(async (tx) => {
    const kidCatalog = await upsertCatalog(tx, {
      name: 'Национальный календарь РФ (детский)',
      scope: 'KID',
    })
    const adultCatalog = await upsertCatalog(tx, {
      name: 'Национальный календарь РФ (взрослый)',
      scope: 'ADULT',
    })

    await replaceSchedules(tx, kidCatalog.id, KID_SCHEDULES)
    await replaceSchedules(tx, adultCatalog.id, ADULT_SCHEDULES)
  })

  console.log(
    `[1122n] Готово. KID=${KID_SCHEDULES.length} (план=${KID_PLAN_SCHEDULES.length}, эпид=${KID_EPID_SCHEDULES.length}), ` +
      `ADULT=${ADULT_SCHEDULES.length} (план=${ADULT_PLAN_SCHEDULES.length}, эпид=${ADULT_EPID_SCHEDULES.length}).`,
  )
}

main()
  .catch((e) => {
    console.error('[1122n] Ошибка сидера:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
