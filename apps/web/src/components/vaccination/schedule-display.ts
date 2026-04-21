// TODO(mock): пока метаданные по нозологиям (цвет/подпись) хардкодом на клиенте.
// Завтра заменим на данные из API или отдельный справочник.

export type CategoryColor = 'amber' | 'teal' | 'coral' | 'violet' | 'blue' | 'rose'

export type ScheduleStatus = 'overdue' | 'due-soon' | 'planned' | 'exempt' | 'done' | 'never'

export type ScheduleDisplay = {
  color: CategoryColor
  subtitle: string
}

const DEFAULT: ScheduleDisplay = { color: 'teal', subtitle: '' }

export function getScheduleDisplay(schedule: {
  code?: string | null
  key?: string | null
  name: string
}): ScheduleDisplay {
  const name = schedule.name.toLowerCase()
  if (name.includes('грипп')) return { color: 'amber', subtitle: 'Ежегодно' }
  if (name.includes('covid') || name.includes('коронавирус'))
    return { color: 'teal', subtitle: 'По эпид. показаниям' }
  if (name.includes('адс') || name.includes('столбняк') || name.includes('дифтер'))
    return { color: 'coral', subtitle: 'Каждые 10 лет' }
  if (name.includes('корь') || name.includes('краснух') || name.includes('паротит'))
    return { color: 'violet', subtitle: 'До 35 лет / группы риска' }
  if (name.includes('гепатит')) return { color: 'blue', subtitle: 'Трёхкратно по схеме' }
  if (name.includes('пневмо')) return { color: 'rose', subtitle: 'Группы риска, 65+' }
  return DEFAULT
}

export const STATUS_LABEL: Record<ScheduleStatus, string> = {
  overdue: 'просрочено',
  'due-soon': 'скоро',
  planned: 'в плане',
  exempt: 'медотвод',
  done: 'выполнено',
  never: 'не делали',
}

export const STATUS_ORDER: Record<ScheduleStatus, number> = {
  overdue: 0,
  'due-soon': 1,
  planned: 2,
  never: 3,
  exempt: 4,
  done: 5,
}

type ScheduleAgeInfo = {
  id: string
  minAgeYears: number
  minAgeMonths: number
  minAgeDays: number
  maxAgeYears: number
  maxAgeMonths: number
  maxAgeDays: number
}

type RecordLike = { vaccineScheduleId: string | null; vaccinationDate: Date | string }

// Грубая конвертация возраста в дни. Для задачи «пора ли» точности хватает.
function ageToDays(years: number, months: number, days: number): number {
  return Math.round(years * 365.25) + Math.round(months * 30.5) + days
}

function daysBetween(from: Date | string, to: Date | string): number {
  return Math.floor(
    (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24),
  )
}

// Окно «скоро»: за сколько дней ДО минимального возраста считать прививку как due-soon.
const DUE_SOON_WINDOW_DAYS = 30

export function getScheduleStatus(
  schedule: ScheduleAgeInfo,
  birthday: Date | string,
  records: RecordLike[] | undefined,
): ScheduleStatus {
  // 1. Уже сделана?
  if (records?.some((r) => r.vaccineScheduleId === schedule.id)) return 'done'

  const ageDays = daysBetween(birthday, new Date())
  const minDays = ageToDays(schedule.minAgeYears, schedule.minAgeMonths, schedule.minAgeDays)
  const maxDays = schedule.maxAgeYears >= 99
    ? Number.POSITIVE_INFINITY
    : ageToDays(schedule.maxAgeYears, schedule.maxAgeMonths, schedule.maxAgeDays)

  if (ageDays > maxDays) return 'never'       // окно пропущено
  if (ageDays >= minDays) return 'overdue'    // пора, но не сделано
  if (minDays - ageDays <= DUE_SOON_WINDOW_DAYS) return 'due-soon'
  return 'planned'
}

export function getLastDose(
  scheduleId: string,
  records: RecordLike[] | undefined,
): Date | null {
  const rec = records?.find((r) => r.vaccineScheduleId === scheduleId)
  return rec ? new Date(rec.vaccinationDate) : null
}

export function suggestedDoseLabel(
  scheduleName: string,
  lastDose: Date | null,
): string {
  if (!lastDose) return 'Первичная вакцинация'
  const n = scheduleName.toLowerCase()
  if (n.includes('грипп') || n.includes('covid')) return 'Ревакцинация'
  const years = (Date.now() - lastDose.getTime()) / (1000 * 60 * 60 * 24 * 365)
  return years > 5 ? 'Ревакцинация' : 'Следующая доза'
}
