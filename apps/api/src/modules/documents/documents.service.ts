import { Injectable, NotFoundException } from '@nestjs/common'
import { prisma } from '@vaccitrack/db'
import { generateForm063u, generateCertificate } from '@vaccitrack/pdf'

@Injectable()
export class DocumentsService {
  async form063u(patientId: string, orgId: string): Promise<Buffer> {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, organizationId: orgId },
      include: {
        vaccinationRecords: {
          include: { vaccine: true, vaccineSchedule: true, doctor: true },
          orderBy: { vaccinationDate: 'asc' },
        },
      },
    })
    if (!patient) throw new NotFoundException('Пациент не найден')

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })

    return generateForm063u({
      okud: org.okud ?? '',
      okpo: org.okpo ?? '',
      lpuName: org.name,
      dateBegin: patient.createdAt.toLocaleDateString('ru-RU'),
      fullName: `${patient.lastName} ${patient.firstName} ${patient.middleName ?? ''}`.trim(),
      birthday: patient.birthday.toLocaleDateString('ru-RU'),
      sex: patient.sex === 'MALE' ? 'М' : 'Ж',
      address: [patient.cityName, patient.streetName, patient.house, patient.apartment]
        .filter(Boolean)
        .join(', '),
      policySerial: patient.policySerial ?? '',
      policyNumber: patient.policyNumber ?? '',
      vaccinations: patient.vaccinationRecords.map((r) => ({
        scheduleName: r.vaccineSchedule?.name ?? r.vaccine?.name ?? '',
        doseKey: r.vaccineSchedule?.key ?? '',
        ageLabel: `${r.ageYears}л ${r.ageMonths}м`,
        date: r.vaccinationDate.toLocaleDateString('ru-RU'),
        series: r.series ?? '',
        doctorName: r.doctor
          ? `${r.doctor.lastName} ${r.doctor.firstName[0]}.${r.doctor.middleName?.[0] ?? ''}.`
          : '',
        result: r.result ?? '',
      })),
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
      birthday: patient.birthday.toLocaleDateString('ru-RU'),
      policyNumber: `${patient.policySerial ?? ''} ${patient.policyNumber ?? ''}`.trim(),
      lpuName: org.name,
      vaccinations: patient.vaccinationRecords.map((r) => ({
        name: r.vaccineSchedule?.name ?? r.vaccine?.name ?? '',
        date: r.vaccinationDate.toLocaleDateString('ru-RU'),
        series: r.series ?? '',
        dose: r.doseNumber?.toString() ?? '',
        nextDate: r.nextScheduledDate?.toLocaleDateString('ru-RU') ?? '',
      })),
    })
  }
}
