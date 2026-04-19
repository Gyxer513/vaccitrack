// TODO(mock): пока метаданные по нозологиям (цвет/подпись) хардкодом на клиенте.
// Завтра заменим на данные из API или отдельный справочник.

export type CategoryColor = 'amber' | 'teal' | 'coral' | 'violet' | 'blue' | 'rose'

export type ScheduleStatus = 'overdue' | 'due-soon' | 'planned' | 'never'

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
  never: 'не делали',
}

type PlanItemLike = { vaccineScheduleId: string; status: string; plannedDate: Date | string }
type RecordLike = { vaccineScheduleId: string | null; vaccinationDate: Date | string }

export function getScheduleStatus(
  scheduleId: string,
  planItems: PlanItemLike[] | undefined,
  records: RecordLike[] | undefined,
): ScheduleStatus {
  const plan = planItems?.find((p) => p.vaccineScheduleId === scheduleId)
  if (plan) {
    if (plan.status === 'OVERDUE') return 'overdue'
    if (plan.status === 'PLANNED') {
      const days = (new Date(plan.plannedDate).getTime() - Date.now()) / 86_400_000
      return days <= 30 ? 'due-soon' : 'planned'
    }
    if (plan.status === 'EXEMPTED' || plan.status === 'DONE') return 'planned'
  }
  const hasRecord = records?.some((r) => r.vaccineScheduleId === scheduleId)
  return hasRecord ? 'planned' : 'never'
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
