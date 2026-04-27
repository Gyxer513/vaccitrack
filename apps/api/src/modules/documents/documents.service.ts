import { Injectable, NotFoundException } from '@nestjs/common'
import { prisma } from '@vaccitrack/db'
import { generateForm063u, generateForm063uDocx, generateCertificateDocx, generatePlanDocx } from '@vaccitrack/pdf'
import type { Form063Data, CertificateData, CertificateSection, PlanData, PlanRow, PlanGroupKey } from '@vaccitrack/pdf'
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

  async planDocx(districtId: string, from: string, to: string, orgId: string): Promise<Buffer> {
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
      const all = await buildPlanForPatient(prisma, p)
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
    if (district.site?.activeCatalog) {
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
