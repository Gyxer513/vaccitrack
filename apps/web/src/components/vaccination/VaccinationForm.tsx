import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { trpc } from '../../lib/trpc'
import './VaccinationForm.css'
import {
  IconActivity,
  IconAlertCircle,
  IconArrowLeft,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconFileText,
  IconShieldAlert,
  IconSparkles,
  IconSyringe,
  IconTrendingUp,
} from './icons'
import {
  STATUS_LABEL,
  STATUS_ORDER,
  getLastDose,
  getScheduleDisplay,
  getScheduleStatus,
  suggestedDoseLabel,
  type CategoryColor,
  type ScheduleStatus,
} from './schedule-display'

type Mode = 'vaccination' | 'exemption'
type StatusFilter = 'all' | 'overdue' | 'due-soon' | 'planned' | 'never'

// Локальная дата (YYYY-MM-DD) без TZ-конверсии. toISOString даёт UTC и после 21:00 по МСК
// возвращает завтрашнюю дату — это ломало max={today()} и парсинг при submit.
const todayLocal = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Парсит YYYY-MM-DD как локальную полночь (не UTC). new Date('2026-04-20') даёт UTC-полночь,
// что в UTC+3 превращается в 03:00 локальных — при сохранении без времени всё ок,
// но для консистентности передаём локальную полночь.
const parseLocalDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const calcAge = (birthday: Date | string): number => {
  const b = new Date(birthday)
  const now = new Date()
  let y = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) y--
  return y
}

const formatDateRu = (d: Date | string | null | undefined): string => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const doctorName = (doc: {
  lastName: string
  firstName: string
  middleName: string | null
}): string => {
  const fi = doc.firstName[0] ? `${doc.firstName[0]}.` : ''
  const mi = doc.middleName?.[0] ? `${doc.middleName[0]}.` : ''
  return `${doc.lastName} ${fi}${mi}`.trim()
}

export function VaccinationForm({ patientId }: { patientId: string }) {
  const navigate = useNavigate()

  const patientQ = trpc.patient.getById.useQuery({ id: patientId })
  const schedulesQ = trpc.reference.schedules.useQuery()
  const vaccinesQ = trpc.reference.vaccines.useQuery()
  const doctorsQ = trpc.reference.doctors.useQuery()
  const exemptionTypesQ = trpc.reference.medExemptionTypes.useQuery()

  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMounted = useRef(true)

  useEffect(() => {
    return () => {
      isMounted.current = false
      if (redirectTimer.current) clearTimeout(redirectTimer.current)
    }
  }, [])

  const onSuccessCommon = () => {
    if (!isMounted.current) return
    setSaved(true)
    redirectTimer.current = setTimeout(() => {
      if (isMounted.current) navigate(`/patients/${patientId}`)
    }, 1200)
  }

  const recordMutation = trpc.vaccination.record.useMutation({ onSuccess: onSuccessCommon })
  const exemptMutation = trpc.vaccination.exempt.useMutation({ onSuccess: onSuccessCommon })
  const isPending = recordMutation.isPending || exemptMutation.isPending

  const [mode, setMode] = useState<Mode>('vaccination')
  const [scheduleId, setScheduleId] = useState<string>('')
  const [vaccineId, setVaccineId] = useState<string>('')
  const [date, setDate] = useState<string>(todayLocal())
  const [series, setSeries] = useState<string>('')
  const [doseVolumeMl, setDoseVolumeMl] = useState<string>('0.5')
  const [doctorId, setDoctorId] = useState<string>('')
  const [result, setResult] = useState<string>('Реакции нет')
  const [exemptionTypeId, setExemptionTypeId] = useState<string>('')
  const [exemptionUntil, setExemptionUntil] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [saved, setSaved] = useState(false)

  // Поиск и фильтрация списка нозологий
  const [scheduleSearch, setScheduleSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const patient = patientQ.data
  const schedules = schedulesQ.data
  const vaccines = vaccinesQ.data
  const doctors = doctorsQ.data
  const exemptionTypes = exemptionTypesQ.data

  useEffect(() => {
    if (!doctorId && doctors?.[0]) setDoctorId(doctors[0].id)
  }, [doctors, doctorId])
  useEffect(() => {
    if (!exemptionTypeId && exemptionTypes?.[0]) setExemptionTypeId(exemptionTypes[0].id)
  }, [exemptionTypes, exemptionTypeId])

  // Фильтр препаратов по выбранной нозологии. Если связей нет вообще —
  // fallback показывает все (чтобы не блокировать запись).
  const filteredVaccines = useMemo(() => {
    if (!vaccines) return []
    if (!scheduleId) return vaccines
    const linked = vaccines.filter((v) =>
      (v as any).scheduleLinks?.some((l: any) => l.vaccineScheduleId === scheduleId),
    )
    return linked.length > 0 ? linked : vaccines
  }, [vaccines, scheduleId])

  // Если текущий vaccineId не подходит новому scheduleId — сбросить и выбрать первый из отфильтрованных
  useEffect(() => {
    if (!filteredVaccines.length) return
    if (!vaccineId || !filteredVaccines.some((v) => v.id === vaccineId)) {
      setVaccineId(filteredVaccines[0].id)
    }
  }, [filteredVaccines, vaccineId])

  const schedule = useMemo(
    () => schedules?.find((s) => s.id === scheduleId),
    [schedules, scheduleId],
  )
  const display = schedule ? getScheduleDisplay(schedule) : { color: 'teal' as const, subtitle: '' }

  // Обогащённый список schedules со статусом для сортировки/фильтрации/рендера
  const enrichedSchedules = useMemo(() => {
    if (!schedules || !patient) return []
    return schedules.map((s) => {
      const status = getScheduleStatus(s.id, patient.planItems, patient.vaccinationRecords)
      const last = getLastDose(s.id, patient.vaccinationRecords)
      const disp = getScheduleDisplay(s)
      return { schedule: s, status, lastDose: last, display: disp }
    })
  }, [schedules, patient])

  // Счётчики для табов
  const statusCounts = useMemo(() => {
    const c = { all: enrichedSchedules.length, overdue: 0, 'due-soon': 0, planned: 0, never: 0 }
    for (const e of enrichedSchedules) {
      if (e.status === 'overdue') c.overdue++
      else if (e.status === 'due-soon') c['due-soon']++
      else if (e.status === 'planned') c.planned++
      else if (e.status === 'never') c.never++
    }
    return c
  }, [enrichedSchedules])

  // Отсортированный + отфильтрованный список
  const visibleSchedules = useMemo(() => {
    const needle = scheduleSearch.trim().toLowerCase()
    return enrichedSchedules
      .filter((e) => {
        if (statusFilter !== 'all' && e.status !== statusFilter) return false
        if (!needle) return true
        return (
          e.schedule.name.toLowerCase().includes(needle) ||
          (e.schedule.parent?.name ?? '').toLowerCase().includes(needle)
        )
      })
      .sort((a, b) => {
        // 1) приоритет по статусу
        const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        if (byStatus !== 0) return byStatus
        // 2) внутри — алфавитом по нозологии (parent.name), fallback — сам name
        const aDisease = a.schedule.parent?.name ?? a.schedule.name
        const bDisease = b.schedule.parent?.name ?? b.schedule.name
        const byDisease = aDisease.localeCompare(bDisease)
        if (byDisease !== 0) return byDisease
        // 3) внутри одной нозологии — по имени этапа
        return a.schedule.name.localeCompare(b.schedule.name)
      })
  }, [enrichedSchedules, statusFilter, scheduleSearch])

  // Авто-выбор первой записи в видимом списке, если ничего не выбрано
  useEffect(() => {
    if (!scheduleId && visibleSchedules[0]) setScheduleId(visibleSchedules[0].schedule.id)
  }, [visibleSchedules, scheduleId])

  const stats = useMemo(() => {
    return {
      overdue: statusCounts.overdue,
      dueSoon: statusCounts['due-soon'],
      total: patient?.vaccinationRecords.length ?? 0,
    }
  }, [statusCounts, patient])

  const lastDose = schedule
    ? getLastDose(schedule.id, patient?.vaccinationRecords)
    : null
  const doseTypeLabel = schedule ? suggestedDoseLabel(schedule.name, lastDose) : ''

  const age = patient ? calcAge(patient.birthday) : null
  const fullName = patient
    ? `${patient.lastName} ${patient.firstName}${patient.middleName ? ' ' + patient.middleName : ''}`
    : ''
  const initials = patient
    ? `${patient.lastName[0] ?? ''}${patient.firstName[0] ?? ''}`.toUpperCase()
    : '…'
  const idChip = patient ? patient.id.slice(-6).toUpperCase() : ''
  const policy = patient
    ? [patient.policySerial, patient.policyNumber].filter(Boolean).join(' ') || '—'
    : '—'

  const canSave =
    mode === 'vaccination'
      ? !!(scheduleId && vaccineId && date && series && doctorId)
      : !!(scheduleId && date && exemptionTypeId)

  const handleSave = async () => {
    if (!canSave || saved || isPending) return
    if (mode === 'vaccination') {
      await recordMutation.mutateAsync({
        patientId,
        vaccineScheduleId: scheduleId,
        vaccinationDate: parseLocalDate(date),
        doctorId: doctorId || undefined,
        vaccineId: vaccineId || undefined,
        series: series || undefined,
        doseVolumeMl: doseVolumeMl ? parseFloat(doseVolumeMl) : undefined,
        result: result || undefined,
        note: notes || undefined,
      })
    } else {
      await exemptMutation.mutateAsync({
        patientId,
        vaccineScheduleId: scheduleId,
        medExemptionTypeId: exemptionTypeId,
        dateFrom: parseLocalDate(date),
        dateTo: exemptionUntil ? parseLocalDate(exemptionUntil) : undefined,
        note: notes || undefined,
        doctorId: doctorId || undefined,
      })
    }
  }

  if (patientQ.isLoading || !patient) {
    return <div className="vt-loading">Загрузка пациента…</div>
  }
  if (patientQ.isError) {
    return <div className="vt-empty">Пациент не найден.</div>
  }

  const currentDoctor = doctors?.find((d) => d.id === doctorId)
  const currentVaccine = vaccines?.find((v) => v.id === vaccineId)
  const currentExemption = exemptionTypes?.find((t) => t.id === exemptionTypeId)

  return (
    <div className="vt-vac">
      <div className="vt-vac-inner">
        {/* HEADER */}
        <div className="vt-vac-head">
          <button className="vt-btn-icon" onClick={() => navigate(`/patients/${patientId}`)} aria-label="Назад">
            <IconArrowLeft size={16} />
          </button>
          <h1 className="vt-vac-title">
            Запись <em>прививки</em>
          </h1>
          <span className="vt-vac-id">{idChip}</span>
          <span className="vt-vac-date">
            {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>
        <p className="vt-vac-sub">Национальный календарь РФ · Приказ МЗ №1122н</p>

        <div className="vt-vac-grid">
          {/* LEFT: PATIENT */}
          <aside className="vt-vac-aside">
            <div className="vt-vac-patient">
              <div className="vt-vac-patient-top">
                <div className="vt-avatar vt-vac-avatar-lg">{initials || '?'}</div>
                <div className="vt-vac-patient-name-wrap">
                  <div className="vt-display vt-vac-patient-name">{fullName}</div>
                  <div className="vt-vac-patient-meta">
                    {age != null ? `${age} лет` : ''} · {patient.sex === 'FEMALE' ? 'женщина' : 'мужчина'}
                  </div>
                </div>
              </div>

              <div className="vt-vac-stats">
                <StatChip tone="coral" value={stats.overdue} label="просрочено" />
                <StatChip tone="amber" value={stats.dueSoon} label="скоро" />
                <StatChip tone="accent" value={stats.total} label="всего" />
              </div>

              <div className="vt-vac-rows">
                <InfoRow label="Полис" value={policy} mono />
                <InfoRow label="Участок" value={patient.district?.name ?? '—'} />
                {patient.riskGroup?.name && (
                  <InfoRow label="Группа риска" value={patient.riskGroup.name} badge="violet" />
                )}
                <InfoRow label="Телефон" value={patient.phone || '—'} mono />
                {patient.activeMedExemption && (
                  <InfoRow
                    label="Медотвод"
                    value={`${patient.activeMedExemption.medExemptionType.name}${
                      patient.activeMedExemption.dateTo
                        ? ' до ' + formatDateRu(patient.activeMedExemption.dateTo)
                        : ' (бессрочно)'
                    }`}
                    badge="warn"
                  />
                )}
              </div>
            </div>

            <div className="vt-card vt-vac-history">
              <div className="vt-vac-history-head">
                <IconClock size={14} />
                <span className="vt-label" style={{ margin: 0 }}>История прививок</span>
              </div>
              {patient.vaccinationRecords.length === 0 ? (
                <div className="vt-hint">Записей нет</div>
              ) : (
                <div className="vt-vac-timeline">
                  <div className="vt-vac-timeline-rail" />
                  {patient.vaccinationRecords.slice(0, 6).map((r) => {
                    const cat: CategoryColor = r.vaccineSchedule
                      ? getScheduleDisplay(r.vaccineSchedule).color
                      : 'teal'
                    const titleParts = [
                      r.vaccineSchedule?.name,
                      r.vaccine?.name,
                    ].filter(Boolean)
                    const dose = r.doseNumber
                      ? `№${r.doseNumber}`
                      : r.medExemptionTypeId
                        ? 'отвод'
                        : '—'
                    return (
                      <div key={r.id} className="vt-vac-timeline-item">
                        <div
                          className="vt-vac-timeline-dot"
                          style={{ '--dot': `var(--vt-cat-${cat}-deep)` } as React.CSSProperties}
                        />
                        <div className="vt-vac-timeline-title">{titleParts.join(' · ') || '—'}</div>
                        <div className="vt-vac-timeline-meta">
                          <span className="vt-mono">{formatDateRu(r.vaccinationDate)}</span>
                          <span>·</span>
                          <span style={{ color: `var(--vt-cat-${cat}-text)`, fontWeight: 500 }}>{dose}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </aside>

          {/* CENTER: FORM */}
          <main>
            <div className="vt-vac-toggle-row">
              <div className="vt-vac-mode">
                <button
                  className={mode === 'vaccination' ? 'on' : ''}
                  onClick={() => setMode('vaccination')}
                  type="button"
                >
                  <IconSyringe size={14} /> Вакцинация
                </button>
                <button
                  className={mode === 'exemption' ? 'on-exempt' : ''}
                  onClick={() => setMode('exemption')}
                  type="button"
                >
                  <IconShieldAlert size={14} /> Медотвод
                </button>
              </div>
              {mode === 'exemption' && (
                <div className="vt-vac-exempt-hint">
                  <IconAlertCircle size={14} /> Прививка не ставится — оформляется отвод
                </div>
              )}
            </div>

            {/* ————— Список нозологий с поиском и фильтрами ————— */}
            <div className="vt-vac-schedule-section">
              <div className="vt-vac-schedule-head">
                <span className="vt-label" style={{ margin: 0 }}>Нозология из нацкалендаря</span>
                <span className="vt-hint">{visibleSchedules.length} из {enrichedSchedules.length}</span>
              </div>

              <div className="vt-vac-schedule-controls">
                <input
                  className="vt-input vt-vac-search"
                  placeholder="Поиск по названию или коду…"
                  value={scheduleSearch}
                  onChange={(e) => setScheduleSearch(e.target.value)}
                />
                <div className="vt-vac-tabs">
                  {(
                    [
                      { k: 'all', label: 'Все', count: statusCounts.all, tone: 'neutral' },
                      { k: 'overdue', label: 'Просрочено', count: statusCounts.overdue, tone: 'coral' },
                      { k: 'due-soon', label: 'Скоро', count: statusCounts['due-soon'], tone: 'amber' },
                      { k: 'planned', label: 'В плане', count: statusCounts.planned, tone: 'accent' },
                      { k: 'never', label: 'Не делали', count: statusCounts.never, tone: 'violet' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.k}
                      type="button"
                      className={`vt-vac-tab vt-vac-tab-${t.tone} ${statusFilter === t.k ? 'active' : ''}`}
                      onClick={() => setStatusFilter(t.k as StatusFilter)}
                    >
                      {t.label}
                      {t.count > 0 && <span className="vt-vac-tab-count">{t.count}</span>}
                    </button>
                  ))}
                </div>
              </div>

              {schedulesQ.isLoading ? (
                <div className="vt-loading">Загрузка нозологий…</div>
              ) : visibleSchedules.length === 0 ? (
                <div className="vt-empty">
                  {scheduleSearch ? 'Ничего не найдено по запросу' : 'Нет нозологий в этой категории'}
                </div>
              ) : (
                <div className="vt-vac-list" role="listbox" aria-label="Нозологии">
                  {visibleSchedules.map(({ schedule: s, status, lastDose: last, display: d }) => {
                    const active = scheduleId === s.id
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`vt-vac-item ${active ? 'active' : ''}`}
                        data-cat={d.color}
                        data-status={status}
                        onClick={() => {
                          setScheduleId(s.id)
                          setVaccineId('')
                        }}
                      >
                        <div className="vt-vac-item-main">
                          {s.parent ? (
                            <>
                              <div className="vt-vac-item-title">{s.parent.name}</div>
                              <div className="vt-vac-item-sub">{s.name}</div>
                            </>
                          ) : (
                            <>
                              <div className="vt-vac-item-title">{s.name}</div>
                              {d.subtitle && <div className="vt-vac-item-sub">{d.subtitle}</div>}
                            </>
                          )}
                        </div>
                        <div className="vt-vac-item-meta">
                          {last && (
                            <span className="vt-vac-item-last" title="Последняя запись">
                              <IconClock size={11} /> {formatDateRu(last)}
                            </span>
                          )}
                          <StatusPill status={status} />
                          {active && <IconCheck size={14} />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {mode === 'vaccination' ? (
              <div className="vt-card vt-vac-form" data-cat={display.color}>
                <div className="vt-vac-form-head">
                  <IconSparkles size={14} />
                  <span>
                    {schedule?.parent
                      ? `${schedule.parent.name} · ${schedule.name}`
                      : schedule?.name ?? '—'}
                  </span>
                </div>

                <div className="vt-vac-cols-2-tight">
                  <Field label={`Препарат${filteredVaccines.length !== vaccines?.length ? ` · подходит ${filteredVaccines.length}` : ''}`}>
                    <select
                      className="vt-select vt-vac-select-accent"
                      value={vaccineId}
                      onChange={(e) => setVaccineId(e.target.value)}
                    >
                      <option value="">— выберите —</option>
                      {filteredVaccines.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                          {v.producer ? ` (${v.producer})` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Доза, мл">
                    <input
                      className="vt-input vt-mono"
                      value={doseVolumeMl}
                      onChange={(e) => setDoseVolumeMl(e.target.value)}
                    />
                  </Field>
                </div>

                <div className="vt-vac-cols-3">
                  <Field label="Дата">
                    <input type="date" className="vt-input" value={date} onChange={(e) => setDate(e.target.value)} max={todayLocal()} />
                  </Field>
                  <Field label="Серия">
                    <input
                      className="vt-input vt-mono"
                      placeholder="241108-А"
                      value={series}
                      onChange={(e) => setSeries(e.target.value)}
                    />
                  </Field>
                  <Field label="Тип дозы">
                    <input className="vt-input vt-vac-readonly" value={doseTypeLabel} readOnly />
                  </Field>
                </div>

                <div className="vt-vac-cols-2">
                  <Field label="Врач / медсестра">
                    <select className="vt-select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                      <option value="">— выберите —</option>
                      {doctors?.map((d) => (
                        <option key={d.id} value={d.id}>
                          {doctorName(d)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Результат / реакция">
                    <input className="vt-input" value={result} onChange={(e) => setResult(e.target.value)} />
                  </Field>
                </div>

                <Field label="Заметки (необязательно)">
                  <textarea
                    className="vt-textarea"
                    rows={2}
                    placeholder="Особенности, замечания, согласие на плановую ревакцинацию…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </Field>
              </div>
            ) : (
              <div className="vt-card vt-vac-form vt-vac-form-exempt">
                <div className="vt-vac-exempt-note">
                  <IconAlertCircle size={16} />
                  <div>
                    Медотвод учитывается в плановом календаре. По истечении срока пациент автоматически
                    попадёт в список ожидающих прививку.
                  </div>
                </div>

                <div className="vt-vac-cols-2-1">
                  <Field label="Причина отвода">
                    <select
                      className="vt-select"
                      value={exemptionTypeId}
                      onChange={(e) => setExemptionTypeId(e.target.value)}
                    >
                      <option value="">— выберите —</option>
                      {exemptionTypes?.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Дата отвода">
                    <input type="date" className="vt-input" value={date} onChange={(e) => setDate(e.target.value)} />
                  </Field>
                </div>

                <div className="vt-vac-cols-2">
                  <Field label="Действует до">
                    <input type="date" className="vt-input" value={exemptionUntil} onChange={(e) => setExemptionUntil(e.target.value)} />
                  </Field>
                  <Field label="Оформил">
                    <select className="vt-select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                      <option value="">— выберите —</option>
                      {doctors?.map((d) => (
                        <option key={d.id} value={d.id}>
                          {doctorName(d)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Обоснование">
                  <textarea
                    className="vt-textarea"
                    rows={3}
                    placeholder="Диагноз, данные осмотра, ссылка на направление…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </Field>
              </div>
            )}

            <div className="vt-vac-footer">
              <div className="vt-vac-footer-hint">
                <IconFileText size={14} /> Запись будет внесена в форму 063
              </div>
              <div className="vt-vac-footer-actions">
                {saved && (
                  <div className="vt-vac-toast">
                    <IconCheck size={14} /> Сохранено
                  </div>
                )}
                <button
                  className={`vt-btn ${mode === 'exemption' ? 'vt-btn-danger' : 'vt-btn-primary'}`}
                  disabled={!canSave || isPending || saved}
                  onClick={handleSave}
                  type="button"
                >
                  {isPending
                    ? 'Сохраняем…'
                    : mode === 'vaccination'
                      ? 'Записать прививку'
                      : 'Оформить медотвод'}
                  <IconChevronRight size={16} />
                </button>
              </div>
            </div>
          </main>

          {/* RIGHT: PREVIEW */}
          <aside className="vt-vac-aside">
            <div className="vt-card vt-vac-preview" data-cat={mode === 'exemption' ? 'coral' : display.color}>
              <div className="vt-vac-preview-head">
                <IconActivity size={14} />
                <span>Превью записи · ф063</span>
              </div>

              {mode === 'vaccination' ? (
                <div className="vt-vac-preview-body">
                  <PreviewRow
                    label="Нозология"
                    value={schedule?.parent ? schedule.parent.name : schedule?.name ?? '—'}
                    accent
                  />
                  {schedule?.parent && (
                    <PreviewRow label="Этап" value={schedule.name} />
                  )}
                  <PreviewRow label="Препарат" value={currentVaccine?.name ?? '—'} strong />
                  <PreviewRow label="Дата" value={formatDateRu(date)} mono />
                  <PreviewRow label="Серия" value={series || '—'} mono />
                  <PreviewRow label="Доза" value={`${doseVolumeMl} мл`} mono />
                  <PreviewRow label="Тип" value={doseTypeLabel} accent />
                  {age != null && <PreviewRow label="Возраст" value={`${age} лет`} />}
                  <PreviewRow label="Врач" value={currentDoctor ? doctorName(currentDoctor) : '—'} />
                  <PreviewRow label="Результат" value={result} />
                </div>
              ) : (
                <div className="vt-vac-preview-body">
                  <PreviewRow
                    label="Отвод от"
                    value={schedule?.parent ? schedule.parent.name : schedule?.name ?? '—'}
                    accent
                  />
                  {schedule?.parent && (
                    <PreviewRow label="Этап" value={schedule.name} />
                  )}
                  <PreviewRow label="Причина" value={currentExemption?.name ?? '—'} strong />
                  <PreviewRow label="С" value={formatDateRu(date)} mono />
                  <PreviewRow
                    label="До"
                    value={exemptionUntil ? formatDateRu(exemptionUntil) : 'бессрочно'}
                    mono
                  />
                  <PreviewRow label="Оформил" value={currentDoctor ? doctorName(currentDoctor) : '—'} />
                </div>
              )}

              <div className="vt-vac-next">
                <div className="vt-vac-next-label">
                  <IconTrendingUp size={12} /> Следующий шаг
                </div>
                <div>
                  {mode === 'exemption'
                    ? 'После окончания отвода — автовключение в план'
                    : 'Будет добавлено в прививочный план'}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

/* ——— sub-components ——— */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="vt-vac-field">
      <label className="vt-label">{label}</label>
      {children}
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono,
  badge,
}: {
  label: string
  value: string
  mono?: boolean
  badge?: 'violet' | 'accent' | 'warn'
}) {
  return (
    <div className="vt-vac-row">
      <span className="vt-hint">{label}</span>
      {badge ? (
        <span className={`vt-badge vt-badge-${badge}`}>{value}</span>
      ) : (
        <span className={mono ? 'vt-mono' : ''} style={{ fontSize: 13 }}>{value}</span>
      )}
    </div>
  )
}

function StatChip({
  tone,
  value,
  label,
}: {
  tone: 'coral' | 'amber' | 'accent'
  value: number
  label: string
}) {
  return (
    <div className={`vt-vac-stat vt-vac-stat-${tone}`}>
      <div className="vt-mono vt-vac-stat-value">{value}</div>
      <div className="vt-vac-stat-label">{label}</div>
    </div>
  )
}

function StatusPill({ status }: { status: ScheduleStatus }) {
  return (
    <div className={`vt-vac-pill vt-vac-pill-${status}`}>
      <span className="vt-vac-pill-dot" />
      {STATUS_LABEL[status]}
    </div>
  )
}

function PreviewRow({
  label,
  value,
  mono,
  strong,
  accent,
}: {
  label: string
  value: string
  mono?: boolean
  strong?: boolean
  accent?: boolean
}) {
  return (
    <div className="vt-vac-preview-row">
      <span className="vt-vac-preview-label">{label}</span>
      <span
        className={`vt-vac-preview-value ${mono ? 'vt-mono' : ''} ${strong ? 'strong' : ''} ${accent ? 'accent' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}
