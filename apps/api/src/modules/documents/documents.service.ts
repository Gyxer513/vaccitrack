import { Injectable, NotFoundException } from '@nestjs/common'
import { prisma } from '@vaccitrack/db'
import { generateForm063u, generateForm063uDocx, generateCertificateDocx, generatePlanDocx, generateForm5Docx, generateForm6Docx } from '@vaccitrack/pdf'
import type { Form063Data, CertificateData, CertificateSection, PlanData, PlanRow, PlanGroupKey, Form5Data, Form5Row, Form6Data, Form6ColumnKey, Form6Section1Row, Form6Section2Row } from '@vaccitrack/pdf'
import type { Form063Row, Form063OtherRow, VacRevSplit } from '@vaccitrack/pdf'
import { buildPlanForPatient, filterReportableItems } from '@vaccitrack/trpc'

type RecordWithRefs = Awaited<ReturnType<typeof loadRecords>>[number]

async function loadRecords(patientId: string, orgId: string) {
  return prisma.vaccinationRecord.findMany({
    where: { patientId, patient: { organizationId: orgId } },
    include: {
      vaccine: true,
      vaccineSchedule: { include: { parent: true } },
      doctor: true,
      medExemptionType: true,
    },
    orderBy: { vaccinationDate: 'asc' },
  })
}

function diseaseNameOf(r: RecordWithRefs): string {
  return r.vaccineSchedule?.parent?.name ?? r.vaccineSchedule?.name ?? ''
}

// Какая секция формы 063/у для данной записи. Возвращаем ключ либо 'other'.
function sectionOf(r: RecordWithRefs):
  'tuberculosis' | 'polio' | 'dtk' | 'mumps' | 'measles' | 'rubella' | 'hepatitisB' | 'other' {
  const d = diseaseNameOf(r).toLowerCase()
  if (/туберкул/.test(d)) return 'tuberculosis'
  if (/полио/.test(d)) return 'polio'
  if (/дифтер|коклюш|столбняк/.test(d)) return 'dtk'
  if (/паротит/.test(d)) return 'mumps'
  if (/корь|коре/.test(d)) return 'measles'
  if (/краснух/.test(d)) return 'rubella'
  if (/гепатит\s*[вb]/.test(d)) return 'hepatitisB'
  return 'other'
}

function ageLabel(r: RecordWithRefs): string {
  const parts: string[] = []
  if (r.ageYears) parts.push(`${r.ageYears}г.`)
  if (r.ageMonths) parts.push(`${r.ageMonths}м.`)
  if (r.ageDays && !r.ageYears) parts.push(`${r.ageDays}дн.`)
  return parts.join(' ') || '—'
}

function ru(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDdMm(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

function toRow(r: RecordWithRefs): Form063Row {
  return {
    step: r.vaccineSchedule?.name ?? '',
    ageLabel: ageLabel(r),
    date: ru(r.vaccinationDate),
    dose: r.doseNumber?.toString() ?? (r.doseVolumeMl ? `${r.doseVolumeMl}` : ''),
    series: r.series ?? '',
    vaccineName: r.vaccine?.name ?? '',
    reaction: r.result ?? '',
    medExemption: r.medExemptionType
      ? `${r.medExemptionType.name}${r.medExemptionDate ? ' ' + ru(r.medExemptionDate) : ''}`
      : '',
  }
}

// В классических секциях (ДКС, Полио и т.п.) одна инъекция комбинированного
// препарата регистрируется как N записей — по одной на нозологию. Для отчёта
// это визуальный дубль. Схлопываем по (дата + препарат + серия).
function dedupRows(rs: RecordWithRefs[]): Form063Row[] {
  const seen = new Map<string, Form063Row>()
  for (const r of rs) {
    const key = `${ru(r.vaccinationDate)}|${r.vaccineId ?? ''}|${r.series ?? ''}`
    if (!seen.has(key)) seen.set(key, toRow(r))
  }
  return Array.from(seen.values())
}

function toOtherRow(r: RecordWithRefs): Form063OtherRow {
  return {
    diseaseName: diseaseNameOf(r),
    step: r.vaccineSchedule?.name ?? '',
    ageLabel: ageLabel(r),
    date: ru(r.vaccinationDate),
    dose: r.doseNumber?.toString() ?? (r.doseVolumeMl ? `${r.doseVolumeMl}` : ''),
    series: r.series ?? '',
    vaccineName: r.vaccine?.name ?? '',
    reaction: r.result ?? '',
  }
}

function dedupOther(rs: RecordWithRefs[]): Form063OtherRow[] {
  const seen = new Map<string, Form063OtherRow>()
  for (const r of rs) {
    const key = `${ru(r.vaccinationDate)}|${r.vaccineId ?? ''}|${r.series ?? ''}|${diseaseNameOf(r)}`
    if (!seen.has(key)) seen.set(key, toOtherRow(r))
  }
  return Array.from(seen.values())
}

// Разделение записей на Вакцинация vs Ревакцинация по имени этапа.
function splitByVacRev(rs: RecordWithRefs[]): VacRevSplit {
  const vac: RecordWithRefs[] = []
  const rev: RecordWithRefs[] = []
  for (const r of rs) {
    const step = (r.vaccineSchedule?.name ?? '').toLowerCase()
    if (step.includes('ревакц') || /\b(rv|r\s*v)\b/i.test(step)) rev.push(r)
    else vac.push(r)
  }
  return { vaccination: dedupRows(vac), revaccination: dedupRows(rev) }
}

type Form6Patient = Awaited<ReturnType<typeof loadForm6Patients>>[number]
type Form6Record = Form6Patient['vaccinationRecords'][number]
type Form6Infection =
  | 'diphtheria'
  | 'pertussis'
  | 'polio'
  | 'tb'
  | 'hepb'
  | 'measles'
  | 'mumps'
  | 'rubella'
  | 'pneumo'
  | 'hib'

type Form6Stage = { phase: 'v' | 'rv'; number: number | null }

const FORM6_COLS: Form6ColumnKey[] = [
  'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10',
  'c11', 'c12', 'c13', 'c14', 'c15', 'c16', 'c17',
  'c18', 'c19', 'c20', 'c21', 'c22', 'c23', 'c24', 'c25', 'c26', 'c27', 'c28', 'c29',
  'c30', 'c31', 'c32', 'c33',
]

const FORM6_AGE_ROWS: Array<{ line: string; label: string; match: (birthday: Date, at: Date) => boolean }> = [
  { line: '01', label: '0 - 11 месяцев 29 дней', match: (b, at) => ageMonthsAt(b, at) < 12 },
  { line: '02', label: '6 месяцев - 11 месяцев 29 дней', match: (b, at) => ageMonthsAt(b, at) >= 6 && ageMonthsAt(b, at) < 12 },
  { line: '03', label: '1 год', match: (b, at) => ageYearsAt(b, at) === 1 },
  { line: '04', label: '2 года', match: (b, at) => ageYearsAt(b, at) === 2 },
  { line: '05', label: '3 года', match: (b, at) => ageYearsAt(b, at) === 3 },
  { line: '06', label: '4 года', match: (b, at) => ageYearsAt(b, at) === 4 },
  { line: '07', label: '5 лет', match: (b, at) => ageYearsAt(b, at) === 5 },
  { line: '08', label: '6 лет', match: (b, at) => ageYearsAt(b, at) === 6 },
  { line: '09', label: '7 лет', match: (b, at) => ageYearsAt(b, at) === 7 },
  { line: '10', label: '8 лет', match: (b, at) => ageYearsAt(b, at) === 8 },
  { line: '11', label: '9 лет', match: (b, at) => ageYearsAt(b, at) === 9 },
  { line: '12', label: '10 лет', match: (b, at) => ageYearsAt(b, at) === 10 },
  { line: '13', label: '11 лет', match: (b, at) => ageYearsAt(b, at) === 11 },
  { line: '14', label: '12 лет', match: (b, at) => ageYearsAt(b, at) === 12 },
  { line: '15', label: '13 лет', match: (b, at) => ageYearsAt(b, at) === 13 },
  { line: '16', label: '14 лет', match: (b, at) => ageYearsAt(b, at) === 14 },
  { line: '17', label: '15 лет', match: (b, at) => ageYearsAt(b, at) === 15 },
  { line: '18', label: '16 лет', match: (b, at) => ageYearsAt(b, at) === 16 },
  { line: '19', label: '17 лет', match: (b, at) => ageYearsAt(b, at) === 17 },
  { line: '20', label: '18 - 35 лет 11 месяцев 29 дней', match: (b, at) => ageYearsAt(b, at) >= 18 && ageYearsAt(b, at) < 36 },
  { line: '21', label: '36 - 59 лет 11 месяцев 29 дней', match: (b, at) => ageYearsAt(b, at) >= 36 && ageYearsAt(b, at) < 60 },
  { line: '22', label: '60 лет и старше', match: (b, at) => ageYearsAt(b, at) >= 60 },
  { line: '23', label: 'Группа риска: организации социального обслуживания', match: () => false },
]

const FORM6_SECTION2_ROWS: Array<{
  line: string
  ageLabel: string
  vaccineLabel: string
  milestone: { years: number; months: number; days: number }
  infection: Form6Infection
  phase: 'v' | 'rv'
  minNumber?: number
}> = [
  { line: '01', ageLabel: '12 месяцев', vaccineLabel: 'Вакцинация против дифтерии', milestone: { years: 1, months: 0, days: 0 }, infection: 'diphtheria', phase: 'v', minNumber: 3 },
  { line: '02', ageLabel: '24 месяца', vaccineLabel: 'Первая ревакцинация против дифтерии', milestone: { years: 2, months: 0, days: 0 }, infection: 'diphtheria', phase: 'rv', minNumber: 1 },
  { line: '03', ageLabel: '12 месяцев', vaccineLabel: 'Вакцинация против коклюша', milestone: { years: 1, months: 0, days: 0 }, infection: 'pertussis', phase: 'v', minNumber: 3 },
  { line: '04', ageLabel: '24 месяца', vaccineLabel: 'Ревакцинация против коклюша', milestone: { years: 2, months: 0, days: 0 }, infection: 'pertussis', phase: 'rv', minNumber: 1 },
  { line: '05', ageLabel: '12 месяцев', vaccineLabel: 'Вакцинация против полиомиелита', milestone: { years: 1, months: 0, days: 0 }, infection: 'polio', phase: 'v', minNumber: 3 },
  { line: '06', ageLabel: '24 месяца', vaccineLabel: 'Вторая ревакцинация против полиомиелита', milestone: { years: 2, months: 0, days: 0 }, infection: 'polio', phase: 'rv', minNumber: 2 },
  { line: '07', ageLabel: '24 месяца', vaccineLabel: 'Вакцинация против кори', milestone: { years: 2, months: 0, days: 0 }, infection: 'measles', phase: 'v' },
  { line: '08', ageLabel: '24 месяца', vaccineLabel: 'Вакцинация против эпидемического паротита', milestone: { years: 2, months: 0, days: 0 }, infection: 'mumps', phase: 'v' },
  { line: '09', ageLabel: '24 месяца', vaccineLabel: 'Вакцинация против краснухи', milestone: { years: 2, months: 0, days: 0 }, infection: 'rubella', phase: 'v' },
  { line: '10', ageLabel: 'Новорожденные (30 дней)', vaccineLabel: 'Вакцинация против туберкулеза', milestone: { years: 0, months: 0, days: 30 }, infection: 'tb', phase: 'v' },
  { line: '11', ageLabel: '12 месяцев', vaccineLabel: 'Вакцинация против вирусного гепатита B', milestone: { years: 1, months: 0, days: 0 }, infection: 'hepb', phase: 'v', minNumber: 3 },
  { line: '12', ageLabel: '12 месяцев', vaccineLabel: 'Вакцинация против пневмококковой инфекции', milestone: { years: 1, months: 0, days: 0 }, infection: 'pneumo', phase: 'v', minNumber: 2 },
  { line: '13', ageLabel: '24 месяца', vaccineLabel: 'Ревакцинация против пневмококковой инфекции', milestone: { years: 2, months: 0, days: 0 }, infection: 'pneumo', phase: 'rv' },
  { line: '14', ageLabel: '12 месяцев', vaccineLabel: 'Вакцинация против гемофильной инфекции', milestone: { years: 1, months: 0, days: 0 }, infection: 'hib', phase: 'v', minNumber: 3 },
  { line: '15', ageLabel: '24 месяца', vaccineLabel: 'Ревакцинация против гемофильной инфекции', milestone: { years: 2, months: 0, days: 0 }, infection: 'hib', phase: 'rv' },
]

async function loadForm6Patients(orgId: string, toDate: Date) {
  return prisma.patient.findMany({
    where: {
      organizationId: orgId,
      isAlive: true,
      birthday: { lte: toDate },
    },
    include: {
      vaccinationRecords: {
        where: { vaccinationDate: { lte: toDate } },
        include: { vaccineSchedule: { include: { parent: true } } },
        orderBy: { vaccinationDate: 'asc' },
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
}

function blankForm6Values(): Record<Form6ColumnKey, number> {
  return Object.fromEntries(FORM6_COLS.map((c) => [c, 0])) as Record<Form6ColumnKey, number>
}

function ageYearsAt(birthday: Date, at: Date): number {
  let years = at.getFullYear() - birthday.getFullYear()
  const m = at.getMonth() - birthday.getMonth()
  if (m < 0 || (m === 0 && at.getDate() < birthday.getDate())) years -= 1
  return Math.max(years, 0)
}

function ageMonthsAt(birthday: Date, at: Date): number {
  let months = (at.getFullYear() - birthday.getFullYear()) * 12 + at.getMonth() - birthday.getMonth()
  if (at.getDate() < birthday.getDate()) months -= 1
  return Math.max(months, 0)
}

function addDateParts(base: Date, years: number, months: number, days: number): Date {
  const d = new Date(base)
  d.setFullYear(d.getFullYear() + years)
  d.setMonth(d.getMonth() + months)
  d.setDate(d.getDate() + days)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfReportYear(year: number): Date {
  return new Date(year, 11, 31, 23, 59, 59, 999)
}

function startOfReportYear(year: number): Date {
  return new Date(year, 0, 1, 0, 0, 0, 0)
}

function form6Legacy(record: Form6Record): { prefix: string; step: number } | null {
  const m = /^(\d+)_(\d+)$/.exec(record.vaccineSchedule?.code ?? '')
  if (!m) return null
  return { prefix: m[1], step: Number(m[2]) }
}

function form6Stage(record: Form6Record): Form6Stage | null {
  const legacy = form6Legacy(record)
  if (legacy) {
    if (['4', '5', '6'].includes(legacy.prefix)) {
      if (legacy.step === 1 || legacy.step === 3) return { phase: 'v', number: 1 }
      if (legacy.step === 2) return { phase: 'rv', number: 1 }
    }
    if (legacy.prefix === '7') {
      if (legacy.step >= 1 && legacy.step <= 6) return { phase: 'v', number: Math.min(legacy.step, 4) }
      if (legacy.step === 8) return { phase: 'rv', number: 1 }
    }
    if (legacy.prefix === '12') {
      if (legacy.step <= 2) return { phase: 'v', number: legacy.step }
      if (legacy.step === 3) return { phase: 'rv', number: 1 }
    }
    if (legacy.prefix === '13') {
      if (legacy.step <= 3) return { phase: 'v', number: legacy.step }
      if (legacy.step === 4) return { phase: 'rv', number: 1 }
    }
    if (legacy.step >= 1 && legacy.step <= 3) return { phase: 'v', number: legacy.step }
    if (legacy.step >= 4 && legacy.step <= 10) return { phase: 'rv', number: legacy.step - 3 }
  }

  const name = `${record.vaccineSchedule?.shortName ?? ''} ${record.vaccineSchedule?.name ?? ''}`.toLowerCase()
  const rv = /(?:^|\s)([1-4])?\s*rv|ревакц/.exec(name)
  if (rv) {
    const ordinal =
      /перв/.test(name) ? 1 :
      /втор/.test(name) ? 2 :
      /трет/.test(name) ? 3 :
      /четверт/.test(name) ? 4 :
      null
    return { phase: 'rv', number: rv[1] ? Number(rv[1]) : ordinal ?? 1 }
  }
  const v = /(?:^|\s)v\s*([1-4])|вакц/.exec(name)
  if (v) {
    const ordinal =
      /перв/.test(name) ? 1 :
      /втор/.test(name) ? 2 :
      /трет/.test(name) ? 3 :
      /четверт/.test(name) ? 4 :
      null
    return { phase: 'v', number: v[1] ? Number(v[1]) : ordinal }
  }
  return null
}

function form6Infections(record: Form6Record): Form6Infection[] {
  const legacy = form6Legacy(record)
  if (legacy) {
    const byPrefix: Record<string, Form6Infection | undefined> = {
      '1': 'tb',
      '2': 'diphtheria',
      '4': 'measles',
      '5': 'mumps',
      '6': 'rubella',
      '7': 'hepb',
      '9': 'pertussis',
      '10': 'polio',
      '12': 'pneumo',
      '13': 'hib',
    }
    const infection = byPrefix[legacy.prefix]
    return infection ? [infection] : []
  }

  const name = `${record.vaccineSchedule?.parent?.name ?? ''} ${record.vaccineSchedule?.name ?? ''}`.toLowerCase()
  const out: Form6Infection[] = []
  if (/дифтер/.test(name)) out.push('diphtheria')
  if (/коклюш/.test(name)) out.push('pertussis')
  if (/полио/.test(name)) out.push('polio')
  if (/туберкул|бцж/.test(name)) out.push('tb')
  if (/гепатит\s*[вb]|вирусн.+гепатит\s*[вb]/.test(name)) out.push('hepb')
  if (/(^|\s)кор[ьи]\b|корь/.test(name)) out.push('measles')
  if (/паротит/.test(name)) out.push('mumps')
  if (/краснух/.test(name)) out.push('rubella')
  if (/пневмокок/.test(name)) out.push('pneumo')
  if (/гемофил/.test(name)) out.push('hib')
  return Array.from(new Set(out))
}

function form6ColumnFor(infection: Form6Infection, stage: Form6Stage): Form6ColumnKey | null {
  if (infection === 'diphtheria') {
    if (stage.phase === 'v') return 'c04'
    if (stage.number === 1) return 'c05'
    if (stage.number === 2) return 'c06'
    if (stage.number === 3) return 'c07'
    return 'c08'
  }
  if (infection === 'pertussis') return stage.phase === 'v' ? 'c09' : 'c10'
  if (infection === 'polio') {
    if (stage.phase === 'v') return 'c11'
    if (stage.number === 1) return 'c12'
    if (stage.number === 2) return 'c13'
    return 'c14'
  }
  if (infection === 'tb') return stage.phase === 'v' ? 'c15' : 'c16'
  if (infection === 'hepb') return stage.phase === 'v' ? 'c17' : null
  if (infection === 'measles') return stage.phase === 'v' ? 'c20' : 'c21'
  if (infection === 'mumps') return stage.phase === 'v' ? 'c24' : 'c25'
  if (infection === 'rubella') return stage.phase === 'v' ? 'c28' : 'c29'
  if (infection === 'pneumo') return stage.phase === 'v' ? 'c30' : 'c31'
  if (infection === 'hib') return stage.phase === 'v' ? 'c32' : 'c33'
  return null
}

function hasForm6Dose(records: Form6Record[], infection: Form6Infection, phase: 'v' | 'rv', throughDate: Date, minNumber?: number): boolean {
  return records.some((record) => {
    if (record.vaccinationDate.getTime() > throughDate.getTime()) return false
    if (!form6Infections(record).includes(infection)) return false
    const stage = form6Stage(record)
    if (!stage || stage.phase !== phase) return false
    if (minNumber == null) return true
    return stage.number != null && stage.number >= minNumber
  })
}

function buildForm6Section1(patients: Form6Patient[], asOf: Date): Form6Section1Row[] {
  return FORM6_AGE_ROWS.map((ageRow) => {
    const rowPatients = patients.filter((p) => ageRow.match(p.birthday, asOf))
    const values = blankForm6Values()
    for (const col of FORM6_COLS) {
      values[col] = rowPatients.filter((p) => {
        return p.vaccinationRecords.some((record) => {
          const stage = form6Stage(record)
          if (!stage) return false
          return form6Infections(record).some((infection) => form6ColumnFor(infection, stage) === col)
        })
      }).length
    }
    return {
      line: ageRow.line,
      ageLabel: ageRow.label,
      registered: rowPatients.length,
      values,
    }
  })
}

function buildForm6Section2(patients: Form6Patient[], year: number): Form6Section2Row[] {
  const from = startOfReportYear(year)
  const to = endOfReportYear(year)
  return FORM6_SECTION2_ROWS.map((def) => {
    const milestonePatients = patients.filter((p) => {
      const milestone = addDateParts(p.birthday, def.milestone.years, def.milestone.months, def.milestone.days)
      return milestone.getTime() >= from.getTime() && milestone.getTime() <= to.getTime()
    })
    return {
      line: def.line,
      ageLabel: def.ageLabel,
      vaccineLabel: def.vaccineLabel,
      registered: milestonePatients.length,
      done: milestonePatients.filter((p) => {
        const milestone = addDateParts(p.birthday, def.milestone.years, def.milestone.months, def.milestone.days)
        return hasForm6Dose(p.vaccinationRecords, def.infection, def.phase, milestone, def.minNumber)
      }).length,
    }
  })
}

type Form5Record = Awaited<ReturnType<typeof loadForm5Records>>[number]
type Form5Bucket =
  | 'pertussis'
  | 'diphtheria'
  | 'tetanus'
  | 'polio'
  | 'measles'
  | 'mumps'
  | 'rubella'
  | 'typhoid'
  | 'tb'
  | 'hepb'
  | 'hepa'
  | 'tularemia'
  | 'brucella'
  | 'anthrax'
  | 'plague'
  | 'yellow'
  | 'influenza'
  | 'tickenc'
  | 'lepto'
  | 'meningo'
  | 'hib'
  | 'varicella'
  | 'pneumo'
  | 'hpv'
  | 'rabies'
  | 'qfever'
  | 'shigella'
  | 'rota'
  | 'covid'

const MONTH_NAMES_RU = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

const FORM5_ROWS: Array<{
  line: string
  label: string
  bucket?: Form5Bucket
  phase?: 'v' | 'rv' | 'any'
  childrenOnly?: boolean
  newbornOnly?: boolean
}> = [
  { line: '01', label: 'Вакцинация против коклюша', bucket: 'pertussis', phase: 'v' },
  { line: '02', label: 'Ревакцинация против коклюша', bucket: 'pertussis', phase: 'rv' },
  { line: '03', label: 'Вакцинация против дифтерии - всего', bucket: 'diphtheria', phase: 'v' },
  { line: '04', label: 'из них детей', bucket: 'diphtheria', phase: 'v', childrenOnly: true },
  { line: '05', label: 'Ревакцинация против дифтерии - всего', bucket: 'diphtheria', phase: 'rv' },
  { line: '06', label: 'из них детей', bucket: 'diphtheria', phase: 'rv', childrenOnly: true },
  { line: '07', label: 'Вакцинация против столбняка - всего', bucket: 'tetanus', phase: 'v' },
  { line: '08', label: 'из них детей', bucket: 'tetanus', phase: 'v', childrenOnly: true },
  { line: '09', label: 'Ревакцинация против столбняка - всего', bucket: 'tetanus', phase: 'rv' },
  { line: '10', label: 'из них детей', bucket: 'tetanus', phase: 'rv', childrenOnly: true },
  { line: '11', label: 'Вакцинация против полиомиелита', bucket: 'polio', phase: 'v' },
  { line: '12', label: 'Ревакцинация против полиомиелита', bucket: 'polio', phase: 'rv' },
  { line: '13', label: 'Вакцинация против кори - всего', bucket: 'measles', phase: 'v' },
  { line: '14', label: 'из них детей', bucket: 'measles', phase: 'v', childrenOnly: true },
  { line: '15', label: 'Ревакцинация против кори - всего', bucket: 'measles', phase: 'rv' },
  { line: '16', label: 'из них детей', bucket: 'measles', phase: 'rv', childrenOnly: true },
  { line: '17', label: 'Вакцинация против эпидемического паротита', bucket: 'mumps', phase: 'v' },
  { line: '18', label: 'Ревакцинация против эпидемического паротита', bucket: 'mumps', phase: 'rv' },
  { line: '19', label: 'Вакцинация против краснухи - всего', bucket: 'rubella', phase: 'v' },
  { line: '20', label: 'из них детей', bucket: 'rubella', phase: 'v', childrenOnly: true },
  { line: '21', label: 'Ревакцинация против краснухи - всего', bucket: 'rubella', phase: 'rv' },
  { line: '22', label: 'из них детей', bucket: 'rubella', phase: 'rv', childrenOnly: true },
  { line: '23', label: 'Прививки против брюшного тифа', bucket: 'typhoid', phase: 'any' },
  { line: '24', label: 'Прививки против туберкулеза - всего', bucket: 'tb', phase: 'any' },
  { line: '25', label: 'из них новорожденным', bucket: 'tb', phase: 'any', newbornOnly: true },
  { line: '26', label: 'Вакцинация против вирусного гепатита B - всего', bucket: 'hepb', phase: 'v' },
  { line: '27', label: 'из них детей', bucket: 'hepb', phase: 'v', childrenOnly: true },
  { line: '28', label: 'Прививки против вирусного гепатита A - всего', bucket: 'hepa', phase: 'any' },
  { line: '29', label: 'из них детей', bucket: 'hepa', phase: 'any', childrenOnly: true },
  { line: '30', label: 'Вакцинация против туляремии - всего', bucket: 'tularemia', phase: 'v' },
  { line: '31', label: 'из них детей', bucket: 'tularemia', phase: 'v', childrenOnly: true },
  { line: '32', label: 'Ревакцинация против туляремии - всего', bucket: 'tularemia', phase: 'rv' },
  { line: '33', label: 'из них детей', bucket: 'tularemia', phase: 'rv', childrenOnly: true },
  { line: '34', label: 'Вакцинация против бруцеллеза', bucket: 'brucella', phase: 'v' },
  { line: '35', label: 'Ревакцинация против бруцеллеза', bucket: 'brucella', phase: 'rv' },
  { line: '36', label: 'Вакцинация против сибирской язвы', bucket: 'anthrax', phase: 'v' },
  { line: '37', label: 'Ревакцинация против сибирской язвы', bucket: 'anthrax', phase: 'rv' },
  { line: '38', label: 'Прививки против чумы', bucket: 'plague', phase: 'any' },
  { line: '39', label: 'Прививки против желтой лихорадки', bucket: 'yellow', phase: 'any' },
  { line: '40', label: 'Прививки против гриппа - всего', bucket: 'influenza', phase: 'any' },
  { line: '41', label: 'из них детям', bucket: 'influenza', phase: 'any', childrenOnly: true },
  { line: '42', label: 'Вакцинация против клещевого энцефалита - всего', bucket: 'tickenc', phase: 'v' },
  { line: '43', label: 'из них детей', bucket: 'tickenc', phase: 'v', childrenOnly: true },
  { line: '44', label: 'Ревакцинация против клещевого энцефалита - всего', bucket: 'tickenc', phase: 'rv' },
  { line: '45', label: 'из них детей', bucket: 'tickenc', phase: 'rv', childrenOnly: true },
  { line: '46', label: 'Прививки против лептоспироза', bucket: 'lepto', phase: 'any' },
  { line: '47', label: 'Прививки против менингококковой инфекции - всего', bucket: 'meningo', phase: 'any' },
  { line: '48', label: 'из них детей', bucket: 'meningo', phase: 'any', childrenOnly: true },
  { line: '49', label: 'Вакцинация против гемофильной инфекции', bucket: 'hib', phase: 'v' },
  { line: '50', label: 'Ревакцинация против гемофильной инфекции', bucket: 'hib', phase: 'rv' },
  { line: '51', label: 'Прививки против ветряной оспы - всего', bucket: 'varicella', phase: 'any' },
  { line: '52', label: 'из них детей', bucket: 'varicella', phase: 'any', childrenOnly: true },
  { line: '53', label: 'Вакцинация против пневмококковой инфекции - всего', bucket: 'pneumo', phase: 'v' },
  { line: '54', label: 'из них детей', bucket: 'pneumo', phase: 'v', childrenOnly: true },
  { line: '55', label: 'Ревакцинация против пневмококковой инфекции - всего', bucket: 'pneumo', phase: 'rv' },
  { line: '56', label: 'из них детей', bucket: 'pneumo', phase: 'rv', childrenOnly: true },
  { line: '57', label: 'Прививки против вируса папилломы человека', bucket: 'hpv', phase: 'any' },
  { line: '58', label: 'Вакцинация против бешенства', bucket: 'rabies', phase: 'v' },
  { line: '59', label: 'Ревакцинация против бешенства', bucket: 'rabies', phase: 'rv' },
  { line: '60', label: 'Прививки против лихорадки Ку', bucket: 'qfever', phase: 'any' },
  { line: '61', label: 'Прививки против дизентерии Зонне', bucket: 'shigella', phase: 'any' },
  { line: '62', label: 'Вакцинация против ротавирусной инфекции', bucket: 'rota', phase: 'v' },
  { line: '63', label: 'Прививки против Covid 19', bucket: 'covid', phase: 'any' },
]

async function loadForm5Records(orgId: string, from: Date, to: Date) {
  return prisma.vaccinationRecord.findMany({
    where: {
      vaccinationDate: { gte: from, lte: to },
      patient: { organizationId: orgId, isAlive: true },
    },
    include: {
      patient: true,
      vaccineSchedule: { include: { parent: true } },
    },
    orderBy: { vaccinationDate: 'asc' },
  })
}

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month - 1, 1, 0, 0, 0, 0)
}

function endOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0, 23, 59, 59, 999)
}

function form5Legacy(record: Form5Record): { prefix: string; step: number } | null {
  const m = /^(\d+)_(\d+)$/.exec(record.vaccineSchedule?.code ?? '')
  if (!m) return null
  return { prefix: m[1], step: Number(m[2]) }
}

function form5Stage(record: Form5Record): 'v' | 'rv' {
  const legacy = form5Legacy(record)
  if (legacy && legacy.step >= 4) return 'rv'
  const name = `${record.vaccineSchedule?.shortName ?? ''} ${record.vaccineSchedule?.name ?? ''}`.toLowerCase()
  return /rv|ревакц/.test(name) ? 'rv' : 'v'
}

function form5Bucket(record: Form5Record): Form5Bucket | null {
  const legacy = form5Legacy(record)
  if (legacy) {
    const byPrefix: Record<string, Form5Bucket | undefined> = {
      '1': 'tb',
      '2': 'diphtheria',
      '3': 'tetanus',
      '4': 'measles',
      '5': 'mumps',
      '6': 'rubella',
      '7': 'hepb',
      '8': 'hepa',
      '9': 'pertussis',
      '10': 'polio',
      '11': 'influenza',
      '12': 'pneumo',
      '13': 'hib',
      '18': 'rota',
      '21': 'covid',
      '22': 'rota',
      '23': 'meningo',
    }
    return byPrefix[legacy.prefix] ?? null
  }

  const name = `${record.vaccineSchedule?.parent?.name ?? ''} ${record.vaccineSchedule?.name ?? ''}`.toLowerCase()
  if (/коклюш/.test(name)) return 'pertussis'
  if (/дифтер/.test(name)) return 'diphtheria'
  if (/столбняк/.test(name)) return 'tetanus'
  if (/полио/.test(name)) return 'polio'
  if (/(^|\s)кор[ьи]\b|корь/.test(name)) return 'measles'
  if (/паротит/.test(name)) return 'mumps'
  if (/краснух/.test(name)) return 'rubella'
  if (/брюшн.*тиф|тиф/.test(name)) return 'typhoid'
  if (/туберкул|бцж/.test(name)) return 'tb'
  if (/гепатит\s*[вb]|вирусн.+гепатит\s*[вb]/.test(name)) return 'hepb'
  if (/гепатит\s*[аa]/.test(name)) return 'hepa'
  if (/тулярем/.test(name)) return 'tularemia'
  if (/бруцел/.test(name)) return 'brucella'
  if (/сибир/.test(name)) return 'anthrax'
  if (/чум/.test(name)) return 'plague'
  if (/желт.*лихорад/.test(name)) return 'yellow'
  if (/грипп/.test(name)) return 'influenza'
  if (/клещ.*энцеф/.test(name)) return 'tickenc'
  if (/лептоспир/.test(name)) return 'lepto'
  if (/менингокок/.test(name)) return 'meningo'
  if (/гемофил/.test(name)) return 'hib'
  if (/ветрян/.test(name)) return 'varicella'
  if (/пневмокок/.test(name)) return 'pneumo'
  if (/папиллом|hpv|впч/.test(name)) return 'hpv'
  if (/бешен/.test(name)) return 'rabies'
  if (/ку\b|q fever|q-fever/.test(name)) return 'qfever'
  if (/дизентер|зонне|шигел/.test(name)) return 'shigella'
  if (/ротавирус/.test(name)) return 'rota'
  if (/covid|ковид|коронавирус/.test(name)) return 'covid'
  return null
}

function isChildOnDate(record: Form5Record): boolean {
  return ageYearsAt(record.patient.birthday, record.vaccinationDate) < 18
}

function isNewbornOnDate(record: Form5Record): boolean {
  return ageMonthsAt(record.patient.birthday, record.vaccinationDate) < 1
}

function buildForm5Rows(records: Form5Record[]): Form5Row[] {
  return FORM5_ROWS.map((row) => ({
    line: row.line,
    label: row.label,
    count: records.filter((record) => {
      if (!row.bucket) return false
      if (form5Bucket(record) !== row.bucket) return false
      if (row.phase !== 'any' && form5Stage(record) !== row.phase) return false
      if (row.childrenOnly && !isChildOnDate(record)) return false
      if (row.newbornOnly && !isNewbornOnDate(record)) return false
      return true
    }).length,
  }))
}

@Injectable()
export class DocumentsService {
  private async buildForm063uData(patientId: string, orgId: string): Promise<Form063Data> {
    const patient = await prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId } })
    if (!patient) throw new NotFoundException('Пациент не найден')
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })

    const records = await loadRecords(patientId, orgId)
    const buckets: Record<string, RecordWithRefs[]> = {
      tuberculosis: [], polio: [], dtk: [], mumps: [], measles: [], rubella: [], hepatitisB: [], other: [],
    }
    for (const r of records) buckets[sectionOf(r)].push(r)

    return {
      okud: org.okud ?? '',
      okpo: org.okpo ?? '',
      lpuName: org.name,
      dateBegin: ru(patient.createdAt),
      fullName: `${patient.lastName} ${patient.firstName} ${patient.middleName ?? ''}`.trim(),
      birthday: ru(patient.birthday),
      sex: patient.sex === 'MALE' ? 'М' : 'Ж',
      address: [patient.cityName, patient.streetName, patient.house, patient.apartment]
        .filter(Boolean).join(', '),
      policySerial: patient.policySerial ?? '',
      policyNumber: patient.policyNumber ?? '',
      tuberculosis: splitByVacRev(buckets.tuberculosis),
      tubeTests: [], // T_NOZ20 пока не импортируется (другой формат)
      polio: dedupRows(buckets.polio),
      dtk: splitByVacRev(buckets.dtk),
      mumps: dedupRows(buckets.mumps),
      measles: dedupRows(buckets.measles),
      rubella: dedupRows(buckets.rubella),
      hepatitisB: dedupRows(buckets.hepatitisB),
      other: dedupOther(buckets.other),
    }
  }

  async form063u(patientId: string, orgId: string): Promise<Buffer> {
    return generateForm063u(await this.buildForm063uData(patientId, orgId))
  }

  async form063uDocx(patientId: string, orgId: string): Promise<Buffer> {
    return generateForm063uDocx(await this.buildForm063uData(patientId, orgId))
  }

  async certificateDocx(patientId: string, orgId: string): Promise<Buffer> {
    return generateCertificateDocx(await this.buildCertificateData(patientId, orgId))
  }

  async form5Docx(year: number, month: number, orgId: string): Promise<Buffer> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new NotFoundException('Некорректный отчетный год')
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new NotFoundException('Некорректный отчетный месяц')
    }

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })
    const records = await loadForm5Records(orgId, startOfMonth(year, month), endOfMonth(year, month))
    const data: Form5Data = {
      lpuName: org.name,
      okpo: org.okpo ?? '',
      monthName: MONTH_NAMES_RU[month - 1],
      year,
      generatedAt: ru(new Date()),
      rows: buildForm5Rows(records),
    }
    return generateForm5Docx(data)
  }

  async form6Docx(year: number, orgId: string): Promise<Buffer> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new NotFoundException('Некорректный отчетный год')
    }

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })
    const asOf = endOfReportYear(year)
    const patients = await loadForm6Patients(orgId, asOf)
    const data: Form6Data = {
      lpuName: org.name,
      okpo: org.okpo ?? '',
      year,
      generatedAt: ru(new Date()),
      section1: buildForm6Section1(patients, asOf),
      section2: buildForm6Section2(patients, year),
    }
    return generateForm6Docx(data)
  }

  async planDocx(districtId: string, from: string, to: string, orgId: string, catalogId?: string | null): Promise<Buffer> {
    const fromDate = new Date(from)
    const toDate = new Date(to)
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new NotFoundException('Некорректные даты периода')
    }

    const district = await prisma.district.findFirst({
      where: { id: districtId, site: { organizationId: orgId } },
      include: { site: { include: { activeCatalog: true } } },
    })
    if (!district) throw new NotFoundException('Участок не найден')

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })
    let selectedCatalog: { id: string; name: string } | null = null
    if (catalogId) {
      selectedCatalog = await prisma.catalog.findFirst({
        where: { id: catalogId, scope: district.site.dept, isActive: true },
        select: { id: true, name: true },
      })
      if (!selectedCatalog) throw new NotFoundException('Календарь не найден')
    }

    const patients = await prisma.patient.findMany({
      where: { organizationId: orgId, districtId, isAlive: true },
      include: {
        vaccinationRecords: true,
        activeMedExemption: true,
        district: { include: { site: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    const rows: PlanRow[] = []
    for (const p of patients) {
      const all = await buildPlanForPatient(prisma, p, { catalogId: selectedCatalog?.id })
      const filtered = filterReportableItems(all, fromDate, toDate)
      if (filtered.length === 0) continue

      // Сворачиваем позиции в ячейки по группам. Если в одной группе несколько
      // позиций — стэкаем «V1 21.04 / V2 28.05» через перевод строки.
      const cells: Partial<Record<PlanGroupKey, string>> = {}
      for (const item of filtered) {
        const dueDdMm = formatDdMm(item.dueDate)
        const piece = `${item.shortCode} ${dueDdMm}`
        const key = item.group as PlanGroupKey
        cells[key] = cells[key] ? `${cells[key]}\n${piece}` : piece
      }
      rows.push({
        patientFio: `${p.lastName} ${p.firstName} ${p.middleName ?? ''}`.trim(),
        birthday: ru(p.birthday),
        cells,
      })
    }

    // Резолв имени каталога для шапки.
    let catalogName = '—'
    if (selectedCatalog) {
      catalogName = selectedCatalog.name
    } else if (district.site?.activeCatalog) {
      catalogName = district.site.activeCatalog.name
    } else {
      const fallback = await prisma.catalog.findFirst({
        where: { region: 'RU', scope: district.site?.dept ?? 'KID', isActive: true },
        select: { name: true },
      })
      if (fallback) catalogName = fallback.name
    }

    const data: PlanData = {
      lpuName: org.name,
      catalogName,
      district: district.code,
      fromDate: ru(fromDate),
      toDate: ru(toDate),
      rows,
    }
    return generatePlanDocx(data)
  }

  private async buildCertificateData(patientId: string, orgId: string): Promise<CertificateData> {
    const patient = await prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId } })
    if (!patient) throw new NotFoundException('Пациент не найден')
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })

    const records = await loadRecords(patientId, orgId)
    const buckets: Record<CertSectionKey, RecordWithRefs[]> = {
      reaction: [], bcg: [], diphtheria: [], tetanus: [],
      measles: [], mumps: [], rubella: [], hepb: [],
    }
    for (const r of records) {
      const k = certSectionOf(r)
      if (k) buckets[k].push(r)
    }

    const sections: CertificateSection[] = []
    for (const key of CERT_SECTION_ORDER) {
      const rows = buckets[key]
      if (rows.length === 0) continue // пустые секции не показываем
      sections.push(buildCertSection(key, rows))
    }

    return {
      fullName: `${patient.lastName} ${patient.firstName} ${patient.middleName ?? ''}`.trim(),
      birthday: ru(patient.birthday),
      city: patient.cityName ? `Город ${patient.cityName}` : '',
      issuedAt: ru(new Date()),
      lpuName: org.name,
      sections,
    }
  }
}

/* ——— Секции сертификата ——— */

type CertSectionKey =
  | 'reaction' | 'bcg' | 'diphtheria' | 'tetanus'
  | 'measles' | 'mumps' | 'rubella' | 'hepb'

const CERT_SECTION_ORDER: CertSectionKey[] = [
  'reaction', 'bcg', 'diphtheria', 'tetanus',
  'measles', 'mumps', 'rubella', 'hepb',
]

const CERT_SECTION_TITLE: Record<CertSectionKey, string> = {
  reaction: 'Реакция Манту',
  bcg: 'Туберкулёз',
  diphtheria: 'Дифтерия',
  tetanus: 'Столбняк',
  measles: 'Корь',
  mumps: 'Паротит',
  rubella: 'Краснуха',
  hepb: 'Вирусный гепатит В',
}

// «Корь» в parent.name мы матчим целиком, чтобы не зацепить «Краснуха».
function certSectionOf(r: RecordWithRefs): CertSectionKey | null {
  const parent = (r.vaccineSchedule?.parent?.name ?? r.vaccineSchedule?.name ?? '').toLowerCase()
  const own = (r.vaccineSchedule?.name ?? '').toLowerCase()
  if (/манту|диаскин|проб/.test(own) || /манту|диаскин/.test(parent)) return 'reaction'
  if (/туберкул/.test(parent)) return 'bcg'
  if (/дифтер/.test(parent)) return 'diphtheria'
  if (/столбняк/.test(parent)) return 'tetanus'
  if (/^корь$|^кор[еия]/.test(parent)) return 'measles'
  if (/паротит/.test(parent)) return 'mumps'
  if (/краснух/.test(parent)) return 'rubella'
  if (/гепатит\s*[вb]/.test(parent)) return 'hepb'
  return null
}

function doseStr(r: RecordWithRefs): string {
  if (r.doseNumber != null) return String(r.doseNumber)
  if (r.doseVolumeMl != null) return String(r.doseVolumeMl)
  return ''
}

function buildCertSection(key: CertSectionKey, rows: RecordWithRefs[]): CertificateSection {
  const title = CERT_SECTION_TITLE[key]

  if (key === 'reaction') {
    // Манту/Диаскинтест — у пробы своя структура колонок.
    return {
      title,
      columns: ['Наименование', 'Разведение', 'Возраст', 'Дата', 'Доза', 'Серия', 'Рез-т'],
      rows: rows.map((r) => [
        r.vaccineSchedule?.name ?? '',
        r.vaccine?.name ?? '',
        ageLabel(r),
        ru(r.vaccinationDate),
        doseStr(r),
        r.series ?? '',
        r.result ?? '',
      ]),
    }
  }

  if (key === 'bcg') {
    // У БЦЖ есть колонка «Рез-т».
    return {
      title,
      columns: ['Кратность прививки', 'Наименование препарата', 'Возраст', 'Дата', 'Доза', 'Серия', 'Рез-т'],
      rows: rows.map((r) => [
        r.vaccineSchedule?.name ?? '',
        r.vaccine?.name ?? '',
        ageLabel(r),
        ru(r.vaccinationDate),
        doseStr(r),
        r.series ?? '',
        r.result ?? '',
      ]),
    }
  }

  // Все остальные секции — без колонки результата.
  return {
    title,
    columns: ['Кратность прививки', 'Наименование препарата', 'Возраст', 'Дата', 'Доза', 'Серия'],
    rows: rows.map((r) => [
      r.vaccineSchedule?.name ?? '',
      r.vaccine?.name ?? '',
      ageLabel(r),
      ru(r.vaccinationDate),
      doseStr(r),
      r.series ?? '',
    ]),
  }
}

