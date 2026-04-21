import { Injectable, NotFoundException } from '@nestjs/common'
import { prisma } from '@vaccitrack/db'
import { generateForm063u, generateCertificate } from '@vaccitrack/pdf'
import type { Form063Row, Form063OtherRow } from '@vaccitrack/pdf'

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

@Injectable()
export class DocumentsService {
  async form063u(patientId: string, orgId: string): Promise<Buffer> {
    const patient = await prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId } })
    if (!patient) throw new NotFoundException('Пациент не найден')
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })

    const records = await loadRecords(patientId, orgId)
    const buckets: Record<string, RecordWithRefs[]> = {
      tuberculosis: [], polio: [], dtk: [], mumps: [], measles: [], rubella: [], hepatitisB: [], other: [],
    }
    for (const r of records) buckets[sectionOf(r)].push(r)

    return generateForm063u({
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
      tuberculosis: dedupRows(buckets.tuberculosis),
      polio: dedupRows(buckets.polio),
      dtk: dedupRows(buckets.dtk),
      mumps: dedupRows(buckets.mumps),
      measles: dedupRows(buckets.measles),
      rubella: dedupRows(buckets.rubella),
      hepatitisB: dedupRows(buckets.hepatitisB),
      other: dedupOther(buckets.other),
    })
  }

  async certificate(patientId: string, orgId: string): Promise<Buffer> {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, organizationId: orgId },
      include: {
        vaccinationRecords: {
          include: { vaccine: true, vaccineSchedule: true },
          orderBy: { vaccinationDate: 'asc' },
        },
      },
    })
    if (!patient) throw new NotFoundException('Пациент не найден')
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })

    return generateCertificate({
      fullName: `${patient.lastName} ${patient.firstName} ${patient.middleName ?? ''}`.trim(),
      birthday: ru(patient.birthday),
      policyNumber: `${patient.policySerial ?? ''} ${patient.policyNumber ?? ''}`.trim(),
      lpuName: org.name,
      vaccinations: patient.vaccinationRecords.map((r) => ({
        name: r.vaccineSchedule?.name ?? r.vaccine?.name ?? '',
        date: ru(r.vaccinationDate),
        series: r.series ?? '',
        dose: r.doseNumber?.toString() ?? '',
        nextDate: r.nextScheduledDate ? ru(r.nextScheduledDate) : '',
      })),
    })
  }
}
