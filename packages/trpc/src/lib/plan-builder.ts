/**
 * Plan builder — общий сборщик плана прививок для пациента.
 *
 * Используется и tRPC-роутером (превью на странице /plan), и
 * NestJS DocumentsService (генерация .docx-отчёта по участку).
 *
 * Алгоритм:
 * 1. Резолв активного каталога (Site.activeCatalogId → fallback на РФ-1122н).
 * 2. Рекурсивный сбор позиций из активного каталога + всех parent-каталогов
 *    (МСК-207 → РФ-1122н).
 * 3. Для каждой позиции — проверка применимости (sex, возраст, catch-up).
 * 4. Сравнение с историей VaccinationRecord и активным медотводом.
 * 5. Расчёт shortCode (V1, RV, ДСТ…) и group (для столбца отчёта).
 *
 * Чтобы избежать дополнительной зависимости date-fns на бэкенде,
 * арифметика дат сделана через нативный Date.
 */

import type { PrismaClient, Patient, VaccineSchedule, VaccinationRecord, PatientMedExemption, Sex } from '@vaccitrack/db'

export type PlanGroupKey =
  | 'tuberkulin'
  | 'bcg'
  | 'akds'
  | 'kpk'
  | 'hepb'
  | 'hepa'
  | 'polio'
  | 'pneumo'
  | 'rota'
  | 'hib'
  | 'meningo'
  | 'varicella'
  | 'covid'
  | 'influenza'
  | 'hpv'
  | 'other'

export type PlanItemStatus =
  | 'overdue'
  | 'due-soon'
  | 'planned'
  | 'never'
  | 'exempt'
  | 'done'
  | 'epid'

export type PlanItem = {
  schedule: VaccineSchedule
  status: PlanItemStatus
  dueDate: Date
  /** Возраст, к которому позиция должна быть выполнена. Например «1г.6м.». */
  dueAge: string
  group: PlanGroupKey
  shortCode: string
}

type PatientWithRefs = Patient & {
  vaccinationRecords?: VaccinationRecord[]
  activeMedExemption?: PatientMedExemption | null
  district?: { siteId: string; site?: { activeCatalogId: string | null; dept: 'KID' | 'ADULT' } | null } | null
}

/* ——— даты ——— */

function addYMD(base: Date, years: number, months: number, days: number): Date {
  // защита: при maxAgeYears=99 не падаем на overflow.
  const y = Math.min(Math.max(years, 0), 200)
  const m = Math.min(Math.max(months, 0), 1200)
  const d = Math.min(Math.max(days, 0), 365 * 200)
  const r = new Date(base)
  r.setFullYear(r.getFullYear() + y)
  r.setMonth(r.getMonth() + m)
  r.setDate(r.getDate() + d)
  return r
}

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function ageInYears(birthday: Date, at: Date): number {
  const ms = at.getTime() - birthday.getTime()
  return ms / (1000 * 60 * 60 * 24 * 365.25)
}

function ageLabel(years: number, months: number, days: number): string {
  const parts: string[] = []
  if (years) parts.push(`${years}г.`)
  if (months) parts.push(`${months}м.`)
  if (days && !years) parts.push(`${days}дн.`)
  return parts.join(' ') || '—'
}

/* ——— shortCode и group ——— */

const SHORT_CODE_RULES: Array<[RegExp, string]> = [
  [/первая\s+ревакц/i, '1RV'],
  [/вторая\s+ревакц/i, '2RV'],
  [/третья\s+ревакц/i, '3RV'],
  [/четверт.*ревакц/i, '4RV'],
  [/ревакц/i, 'RV'],
  [/диаскин/i, 'ДСТ'],
  [/манту/i, 'Манту'],
  [/первая\s+вакц/i, 'V1'],
  [/вторая\s+вакц/i, 'V2'],
  [/третья\s+вакц/i, 'V3'],
  [/четверт.*вакц/i, 'V4'],
  [/пят.*вакц/i, 'V5'],
  [/вакц/i, 'V'],
]

export function inferShortCode(name: string, fallbackShort?: string | null): string {
  if (fallbackShort && fallbackShort.trim()) return fallbackShort.trim()
  for (const [rx, code] of SHORT_CODE_RULES) {
    if (rx.test(name)) return code
  }
  // Берём первое слово, обрезанное до 4 символов (для коротких типа «БЦЖ»).
  const first = name.trim().split(/\s+/)[0] ?? ''
  return first.slice(0, 4) || '•'
}

export function inferGroup(name: string): PlanGroupKey {
  const n = name.toLowerCase()
  if (/манту|диаскин/.test(n)) return 'tuberkulin'
  if (/туберкул|бцж/.test(n)) return 'bcg'
  if (/дифтер|столбняк|коклюш|акдс|адс/.test(n)) return 'akds'
  if (/корь|краснух|паротит/.test(n)) return 'kpk'
  if (/гепатит\s*[вb]|вирусн.+гепатит\s*в/.test(n)) return 'hepb'
  if (/гепатит\s*[аa]/.test(n)) return 'hepa'
  if (/полио/.test(n)) return 'polio'
  if (/пневмокок/.test(n)) return 'pneumo'
  if (/ротавир/.test(n)) return 'rota'
  if (/гемофил/.test(n)) return 'hib'
  if (/менингокок/.test(n)) return 'meningo'
  if (/ветрян/.test(n)) return 'varicella'
  if (/covid|коронавир/.test(n)) return 'covid'
  if (/грипп/.test(n)) return 'influenza'
  if (/папиллом|hpv/.test(n)) return 'hpv'
  return 'other'
}

/* ——— резолв каталога ——— */

async function resolveActiveCatalogId(
  prisma: PrismaClient,
  patient: PatientWithRefs,
): Promise<string | null> {
  const activeId = patient.district?.site?.activeCatalogId ?? null
  if (activeId) return activeId

  // Fallback: РФ-нацкалендарь (region='RU') в scope нужного отделения.
  const dept = patient.district?.site?.dept ?? 'KID'
  const fallback = await prisma.catalog.findFirst({
    where: { region: 'RU', scope: dept, isActive: true },
    select: { id: true },
  })
  return fallback?.id ?? null
}

async function collectSchedules(
  prisma: PrismaClient,
  catalogId: string,
  depth = 0,
  acc: Map<string, VaccineSchedule> = new Map(),
): Promise<VaccineSchedule[]> {
  if (depth > 5) return Array.from(acc.values()) // защита от циклов
  const cat = await prisma.catalog.findUnique({
    where: { id: catalogId },
    select: { id: true, parentCatalogId: true },
  })
  if (!cat) return Array.from(acc.values())

  const own = await prisma.vaccineSchedule.findMany({
    where: { catalogId, isActive: true },
  })
  for (const s of own) if (!acc.has(s.id)) acc.set(s.id, s)

  if (cat.parentCatalogId) {
    await collectSchedules(prisma, cat.parentCatalogId, depth + 1, acc)
  }
  return Array.from(acc.values())
}

/* ——— проверка применимости + статус ——— */

function isExemptionActive(ex: PatientMedExemption | null | undefined, now: Date): boolean {
  if (!ex) return false
  if (!ex.dateTo) return true // бессрочный
  return ex.dateTo.getTime() >= now.getTime()
}

const DUE_SOON_DAYS = 30

type ApplicabilityResult =
  | { ok: true; dueDate: Date; status: PlanItemStatus }
  | { ok: false }

function evaluateSchedule(
  schedule: VaccineSchedule,
  patient: PatientWithRefs,
  records: VaccinationRecord[],
  now: Date,
): ApplicabilityResult {
  // Эпид-показания «по контакту» — отдельно, не плановые.
  if (schedule.isEpidContact) {
    const dueDate = addYMD(patient.birthday, schedule.minAgeYears, schedule.minAgeMonths, schedule.minAgeDays)
    return { ok: true, dueDate, status: 'epid' }
  }
  // Эпид-показания (грипп, ковид и т.п.) — по умолчанию НЕ плановые.
  if (schedule.isEpid) {
    const dueDate = addYMD(patient.birthday, schedule.minAgeYears, schedule.minAgeMonths, schedule.minAgeDays)
    return { ok: true, dueDate, status: 'epid' }
  }

  // Пол.
  if (schedule.appliesToSex && schedule.appliesToSex !== (patient.sex as Sex)) {
    return { ok: false }
  }

  const today = startOfDay(now)
  const dueDate = startOfDay(addYMD(patient.birthday, schedule.minAgeYears, schedule.minAgeMonths, schedule.minAgeDays))
  const maxDate = startOfDay(addYMD(patient.birthday, schedule.maxAgeYears, schedule.maxAgeMonths, schedule.maxAgeDays))

  // catch-up: если позиция помечена «вдогонку», она применима пока возраст
  // пациента ≤ catchUpMaxAgeYears. Иначе — только в стандартном окне minAge..maxAge.
  if (schedule.isCatchUp && schedule.catchUpMaxAgeYears != null) {
    const ageY = ageInYears(patient.birthday, today)
    if (ageY > schedule.catchUpMaxAgeYears) return { ok: false }
  }

  // Уже сделана?
  const done = records.some((r) => r.vaccineScheduleId === schedule.id)
  if (done) return { ok: true, dueDate, status: 'done' }

  // Активный медотвод — для позиций, до которых пациент дорос.
  if (isExemptionActive(patient.activeMedExemption, today) && today.getTime() >= dueDate.getTime()) {
    return { ok: true, dueDate, status: 'exempt' }
  }

  // Старше maxAge → 'never' (окно пропущено и не catch-up).
  if (today.getTime() > maxDate.getTime() && !(schedule.isCatchUp && schedule.catchUpMaxAgeYears != null)) {
    return { ok: true, dueDate, status: 'never' }
  }

  if (today.getTime() >= dueDate.getTime()) return { ok: true, dueDate, status: 'overdue' }
  const diffDays = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= DUE_SOON_DAYS) return { ok: true, dueDate, status: 'due-soon' }
  return { ok: true, dueDate, status: 'planned' }
}

/* ——— главный сборщик ——— */

export async function buildPlanForPatient(
  prisma: PrismaClient,
  patient: PatientWithRefs,
  options: { now?: Date } = {},
): Promise<PlanItem[]> {
  const now = options.now ?? new Date()

  const catalogId = await resolveActiveCatalogId(prisma, patient)
  if (!catalogId) return []

  const schedules = await collectSchedules(prisma, catalogId)
  if (schedules.length === 0) return []

  // Записи и медотвод: предпочитаем уже подгруженные, иначе достаём из БД.
  const records = patient.vaccinationRecords
    ?? (await prisma.vaccinationRecord.findMany({ where: { patientId: patient.id } }))
  if (patient.activeMedExemption === undefined && patient.activeMedExemptionId) {
    patient.activeMedExemption = await prisma.patientMedExemption.findUnique({
      where: { id: patient.activeMedExemptionId },
    })
  }

  const items: PlanItem[] = []
  for (const s of schedules) {
    const r = evaluateSchedule(s, patient, records, now)
    if (!r.ok) continue
    items.push({
      schedule: s,
      status: r.status,
      dueDate: r.dueDate,
      dueAge: ageLabel(s.minAgeYears, s.minAgeMonths, s.minAgeDays),
      group: inferGroup(s.name),
      shortCode: inferShortCode(s.name, s.shortName),
    })
  }
  return items
}

/* ——— фильтрация для отчёта по участку ——— */

export function filterReportableItems(
  items: PlanItem[],
  fromDate: Date,
  toDate: Date,
): PlanItem[] {
  // overdue, который старше года — отсекаем (иначе у непривитого 12-летки
  // выпадет 50 позиций в отчёт).
  const oldestAllowed = new Date(fromDate)
  oldestAllowed.setDate(oldestAllowed.getDate() - 365)

  const to = startOfDay(toDate)
  return items.filter((i) => {
    if (!['overdue', 'due-soon', 'planned'].includes(i.status)) return false
    const due = startOfDay(i.dueDate)
    if (due.getTime() > to.getTime()) return false
    if (due.getTime() < oldestAllowed.getTime()) return false
    return true
  })
}
