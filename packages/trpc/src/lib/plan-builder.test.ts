import assert from 'node:assert/strict'
import test from 'node:test'
import type { Patient, PatientMedExemption, VaccineSchedule, VaccinationRecord } from '@vaccitrack/db'
import { evaluateSchedule } from './plan-builder'

type TestPatient = Patient & {
  activeMedExemption?: PatientMedExemption | null
  riskGroup?: { name: string } | null
}

type TestRecord = VaccinationRecord & {
  vaccineSchedule?: Pick<VaccineSchedule, 'id' | 'code' | 'name' | 'shortName' | 'catalogId'> | null
}

const today = new Date('2026-05-05T12:00:00.000Z')
type ApplicableStatus = Extract<ReturnType<typeof evaluateSchedule>, { ok: true }>['status']

function assertStatus(result: ReturnType<typeof evaluateSchedule>, status: ApplicableStatus) {
  assert.ok(result.ok)
  assert.equal(result.status, status)
}

function patient(overrides: Partial<TestPatient> = {}): TestPatient {
  const base: TestPatient = {
    id: 'patient-1',
    organizationId: 'org-1',
    districtId: null,
    riskGroupId: null,
    insuranceId: null,
    lastName: 'Test',
    firstName: 'Patient',
    middleName: null,
    sex: 'FEMALE',
    birthday: new Date('2025-05-05T00:00:00.000Z'),
    regionId: null,
    cityName: null,
    streetName: null,
    house: null,
    building: null,
    structure: null,
    apartment: null,
    phone: null,
    extraAddress: null,
    policySerial: null,
    policyNumber: null,
    hasDirectContract: false,
    directContractNumber: null,
    isResident: true,
    isAlive: true,
    isDecret: false,
    isGkdc: false,
    isOrganized: false,
    activeMedExemptionId: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    createdByLogin: null,
    activeMedExemption: null,
    riskGroup: null,
  }
  return { ...base, ...overrides }
}

function schedule(overrides: Partial<VaccineSchedule> = {}): VaccineSchedule {
  const base: VaccineSchedule = {
    id: 'schedule-1',
    parentId: null,
    code: '1_1',
    key: null,
    name: 'Первая вакцинация',
    shortName: 'V1',
    isActive: true,
    isEpid: false,
    targetDept: 'BOTH',
    catalogId: 'catalog-1',
    appliesToSex: null,
    isEpidContact: false,
    isCatchUp: false,
    catchUpMaxAgeYears: null,
    minAgeYears: 1,
    minAgeMonths: 0,
    minAgeDays: 0,
    maxAgeYears: 99,
    maxAgeMonths: 0,
    maxAgeDays: 0,
    intervalDays: 0,
    intervalMonths: 0,
    intervalYears: 0,
    medExemptionLimitDays: 0,
    medExemptionLimitMonths: 0,
    medExemptionLimitYears: 0,
    nextScheduleId: null,
  }
  return { ...base, ...overrides }
}

function record(overrides: Partial<TestRecord> = {}): TestRecord {
  const base: TestRecord = {
    id: 'record-1',
    patientId: 'patient-1',
    vaccineScheduleId: null,
    vaccineId: null,
    doctorId: null,
    createdById: null,
    isEpid: false,
    isExternal: false,
    ageYears: 0,
    ageMonths: 0,
    ageDays: 0,
    vaccinationDate: new Date('2025-01-01T00:00:00.000Z'),
    doseNumber: null,
    doseVolumeMl: null,
    series: null,
    checkNumber: null,
    result: null,
    medExemptionTypeId: null,
    medExemptionDate: null,
    nextScheduledDate: null,
    nextScheduleId: null,
    note: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    vaccineSchedule: null,
  }
  return { ...base, ...overrides }
}

test('epid schedule returns epid', () => {
  const result = evaluateSchedule(schedule({ isEpid: true }), patient(), [], today)
  assertStatus(result, 'epid')
})

test('sex mismatch is not applicable', () => {
  const result = evaluateSchedule(schedule({ appliesToSex: 'MALE' }), patient({ sex: 'FEMALE' }), [], today)
  assert.deepEqual(result, { ok: false })
})

test('catch-up above max age is not applicable', () => {
  const result = evaluateSchedule(
    schedule({ isCatchUp: true, catchUpMaxAgeYears: 1 }),
    patient({ birthday: new Date('2024-05-04T00:00:00.000Z') }),
    [],
    today,
  )
  assert.deepEqual(result, { ok: false })
})

test('active med exemption after due date returns exempt', () => {
  const activeMedExemption: PatientMedExemption = {
    id: 'exemption-1',
    patientId: 'patient-1',
    medExemptionTypeId: 'type-1',
    dateFrom: new Date('2026-01-01T00:00:00.000Z'),
    dateTo: new Date('2026-12-31T00:00:00.000Z'),
    note: null,
  }
  const result = evaluateSchedule(
    schedule({ minAgeYears: 1 }),
    patient({ activeMedExemption }),
    [],
    today,
  )
  assertStatus(result, 'exempt')
})

test('after max age without catch-up returns never', () => {
  const result = evaluateSchedule(
    schedule({ minAgeYears: 0, maxAgeYears: 0, maxAgeMonths: 6 }),
    patient({ birthday: new Date('2025-05-05T00:00:00.000Z') }),
    [],
    today,
  )
  assertStatus(result, 'never')
})

test('legacy matching record returns done', () => {
  const result = evaluateSchedule(
    schedule({ id: 'schedule-1', name: 'Гепатит B первая вакцинация', shortName: 'V1' }),
    patient(),
    [record({
      vaccineSchedule: {
        id: 'legacy-1',
        code: '7_1',
        name: 'Вирусный гепатит B',
        shortName: null,
        catalogId: 'legacy',
      },
    })],
    today,
  )
  assertStatus(result, 'done')
})

test('today equal due date returns overdue', () => {
  const result = evaluateSchedule(schedule({ minAgeYears: 1 }), patient(), [], today)
  assertStatus(result, 'overdue')
})

test('due date within 30 days returns due-soon', () => {
  const result = evaluateSchedule(
    schedule({ minAgeYears: 1, minAgeMonths: 0, minAgeDays: 20 }),
    patient(),
    [],
    today,
  )
  assertStatus(result, 'due-soon')
})

test('due date after 30 days returns planned', () => {
  const result = evaluateSchedule(
    schedule({ minAgeYears: 1, minAgeMonths: 2 }),
    patient(),
    [],
    today,
  )
  assertStatus(result, 'planned')
})

test('influenza after first year returns never', () => {
  const result = evaluateSchedule(
    schedule({ name: 'Вакцинация против гриппа', minAgeYears: 0, maxAgeYears: 99 }),
    patient({ birthday: new Date('2024-05-05T00:00:00.000Z') }),
    [],
    today,
  )
  assertStatus(result, 'never')
})
