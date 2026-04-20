import { useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { trpc } from '../lib/trpc'
import { format, differenceInMonths, differenceInYears } from 'date-fns'

const STATUS_LABEL: Record<string, string> = {
  PLANNED: 'Запланировано',
  OVERDUE: 'Просрочено',
  DONE: 'Выполнено',
  EXEMPTED: 'Медотвод',
  REFUSED: 'Отказ',
}
const STATUS_PILL: Record<string, string> = {
  PLANNED: 'vt-vac-pill-planned',
  OVERDUE: 'vt-vac-pill-overdue',
  DONE: 'vt-vac-pill-done',
  EXEMPTED: 'vt-vac-pill-exempt',
  REFUSED: 'vt-vac-pill-never',
}

function formatAge(birthday: string | Date) {
  const bd = new Date(birthday)
  const now = new Date()
  const years = differenceInYears(now, bd)
  if (years >= 1) return `${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}`
  const months = differenceInMonths(now, bd)
  return `${months} мес.`
}

function ageAt(birthday: string | Date, at: string | Date) {
  const bd = new Date(birthday)
  const d = new Date(at)
  const y = differenceInYears(d, bd)
  if (y >= 1) return `${y} ${y === 1 ? 'год' : y < 5 ? 'года' : 'лет'}`
  const m = differenceInMonths(d, bd)
  return `${m} мес.`
}

// Записи в FoxPro хранятся по одной на каждую защищаемую нозологию.
// Одна инъекция Пентаксима = 5 строк. Группируем по реальной инъекции.
type ScheduleInfo = {
  id: string
  name: string
  key: string | null
  parent: { id: string; name: string } | null
}

type RawRecord = {
  id: string
  vaccinationDate: string | Date
  doseVolumeMl: number | null
  doseNumber: number | null
  series: string | null
  result: string | null
  note: string | null
  vaccineId: string | null
  vaccine: { id: string; name: string; producer: string | null } | null
  vaccineSchedule: ScheduleInfo | null
  doctor: { lastName: string; firstName: string; middleName: string | null } | null
  medExemptionTypeId: string | null
}

type Disease = { id: string; name: string; doseLabel: string | null }

type Injection = {
  key: string
  date: Date
  vaccineName: string
  producer: string | null
  series: string | null
  doseMl: number | null
  doctor: RawRecord['doctor']
  diseases: Disease[]
  isExemption: boolean
}

// Имя нозологии живёт на parent-record в T_PRIV (например "Дифтерия"),
// а сам vaccineSchedule — это этап ("Первая вакцинация"). Если parent есть —
// используем его. Если нет (корневая запись сама нозология) — берём её name.
function nosologyInfo(s: ScheduleInfo): Disease {
  if (s.parent) {
    return { id: s.parent.id, name: s.parent.name, doseLabel: s.name }
  }
  return { id: s.id, name: s.name, doseLabel: null }
}

function groupInjections(records: RawRecord[]): Injection[] {
  const groups = new Map<string, Injection>()
  for (const r of records) {
    const dateStr = format(new Date(r.vaccinationDate), 'yyyy-MM-dd')
    const vaccineKey = r.vaccineId ?? 'none'
    const seriesKey = r.series ?? 'none'
    const key = `${dateStr}|${vaccineKey}|${seriesKey}`
    const existing = groups.get(key)
    const disease = r.vaccineSchedule ? nosologyInfo(r.vaccineSchedule) : null
    if (existing) {
      if (disease && !existing.diseases.some((d) => d.id === disease.id)) {
        existing.diseases.push(disease)
      }
    } else {
      groups.set(key, {
        key,
        date: new Date(r.vaccinationDate),
        vaccineName: r.vaccine?.name ?? '—',
        producer: r.vaccine?.producer ?? null,
        series: r.series,
        doseMl: r.doseVolumeMl ?? null,
        doctor: r.doctor,
        diseases: disease ? [disease] : [],
        isExemption: !!r.medExemptionTypeId,
      })
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.date.getTime() - a.date.getTime())
}

const doctorShort = (d: RawRecord['doctor']) =>
  d ? `${d.lastName} ${d.firstName[0] ?? ''}.${d.middleName?.[0] ? d.middleName[0] + '.' : ''}`.trim() : '—'

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: patient, isLoading } = trpc.patient.getById.useQuery({ id: id! })

  const injections = useMemo(
    () => (patient ? groupInjections(patient.vaccinationRecords as RawRecord[]) : []),
    [patient],
  )

  if (isLoading) return <div className="vt-loading">Загрузка…</div>
  if (!patient) return <div className="vt-empty">Пациент не найден</div>

  const fullName = `${patient.lastName} ${patient.firstName} ${patient.middleName ?? ''}`.trim()

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            <Link to="/patients" className="vt-muted" style={{ textDecoration: 'none' }}>← Пациенты</Link>
          </div>
          <h1 className="vt-page-title">{fullName}</h1>
          <p className="vt-page-sub">
            {format(new Date(patient.birthday), 'dd.MM.yyyy')}
            {' · '}{formatAge(patient.birthday)}
            {' · '}{patient.sex === 'MALE' ? 'Муж.' : 'Жен.'}
            {' · '}Участок: {patient.district?.code ?? '—'}
          </p>
          {patient.activeMedExemption && (
            <div style={{ marginTop: 8 }}>
              <span className="vt-badge vt-badge-warn">
                Медотвод: {patient.activeMedExemption.medExemptionType.name}
                {patient.activeMedExemption.dateTo
                  ? ` до ${format(new Date(patient.activeMedExemption.dateTo), 'dd.MM.yyyy')}`
                  : ' (бессрочно)'}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => navigate(`/vaccination/new?patientId=${id}`)}
            className="vt-btn vt-btn-primary"
          >
            Записать прививку
          </button>
          <a
            href={`/api/v1/documents/patients/${id}/form063u`}
            target="_blank"
            rel="noreferrer"
            className="vt-btn vt-btn-ghost"
          >
            063/у ↓
          </a>
          <a
            href={`/api/v1/documents/patients/${id}/certificate`}
            target="_blank"
            rel="noreferrer"
            className="vt-btn vt-btn-ghost"
          >
            Сертификат ↓
          </a>
        </div>
      </div>

      {/* ЖУРНАЛ */}
      <div className="vt-card">
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--vt-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span className="vt-section-title" style={{ margin: 0 }}>
            Журнал прививок
          </span>
          <span className="vt-hint">
            {injections.length} {injections.length === 1 ? 'инъекция' : 'инъекций'} · {patient.vaccinationRecords.length} записей о нозологиях
          </span>
        </div>
        {injections.length === 0 ? (
          <div className="vt-empty">
            Прививок нет —{' '}
            <button
              onClick={() => navigate(`/vaccination/new?patientId=${id}`)}
              className="vt-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              записать первую
            </button>
          </div>
        ) : (
          <table className="vt-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Возраст</th>
                <th>Препарат</th>
                <th>Серия</th>
                <th>Защищает от</th>
                <th>Доза</th>
                <th>Врач</th>
              </tr>
            </thead>
            <tbody>
              {injections.map((inj) => (
                <tr key={inj.key}>
                  <td className="vt-mono">{format(inj.date, 'dd.MM.yyyy')}</td>
                  <td className="vt-muted">{ageAt(patient.birthday, inj.date)}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{inj.vaccineName}</div>
                    {inj.producer && <div className="vt-hint">{inj.producer}</div>}
                  </td>
                  <td className="vt-mono vt-muted">{inj.series ?? '—'}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {inj.diseases.length === 0 ? (
                        <span className="vt-hint">—</span>
                      ) : (
                        inj.diseases.map((d) => (
                          <span
                            key={d.id}
                            className="vt-badge vt-badge-accent"
                            title={d.doseLabel ? `${d.name} · ${d.doseLabel}` : d.name}
                          >
                            {d.name}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="vt-mono vt-muted">{inj.doseMl ? `${inj.doseMl} мл` : '—'}</td>
                  <td className="vt-muted">{doctorShort(inj.doctor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ПЛАН */}
      {patient.planItems.length > 0 && (
        <div className="vt-card">
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--vt-border)' }}>
            <span className="vt-section-title" style={{ margin: 0 }}>План прививок</span>
          </div>
          <table className="vt-table">
            <thead>
              <tr>
                <th>Прививка</th>
                <th>Плановая дата</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {patient.planItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.vaccineSchedule.name}</td>
                  <td className="vt-mono">{format(new Date(item.plannedDate), 'dd.MM.yyyy')}</td>
                  <td>
                    <span className={`vt-vac-pill ${STATUS_PILL[item.status] ?? ''}`}>
                      <span className="vt-vac-pill-dot" />
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
