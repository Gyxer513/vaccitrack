import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { trpc } from '../../lib/trpc'
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
  getLastDose,
  getScheduleDisplay,
  getScheduleStatus,
  suggestedDoseLabel,
  type CategoryColor,
  type ScheduleStatus,
} from './schedule-display'

type Mode = 'vaccination' | 'exemption'

const today = () => new Date().toISOString().split('T')[0]

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

  const recordMutation = trpc.vaccination.record.useMutation({
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => navigate(`/patients/${patientId}`), 1200)
    },
  })

  const [mode, setMode] = useState<Mode>('vaccination')
  const [scheduleId, setScheduleId] = useState<string>('')
  const [vaccineId, setVaccineId] = useState<string>('')
  const [date, setDate] = useState<string>(today())
  const [series, setSeries] = useState<string>('')
  const [doseMl, setDoseMl] = useState<string>('0.5')
  const [doctorId, setDoctorId] = useState<string>('')
  const [result, setResult] = useState<string>('Реакции нет')
  const [exemptionTypeId, setExemptionTypeId] = useState<string>('')
  const [exemptionUntil, setExemptionUntil] = useState<string>('') // TODO(api): medExemptionDateTo не поддержан
  const [notes, setNotes] = useState<string>('') // TODO(api): note не поддержан record'ом
  const [saved, setSaved] = useState(false)

  const patient = patientQ.data
  const schedules = schedulesQ.data
  const vaccines = vaccinesQ.data
  const doctors = doctorsQ.data
  const exemptionTypes = exemptionTypesQ.data

  useEffect(() => {
    if (!scheduleId && schedules?.[0]) setScheduleId(schedules[0].id)
  }, [schedules, scheduleId])
  useEffect(() => {
    if (!doctorId && doctors?.[0]) setDoctorId(doctors[0].id)
  }, [doctors, doctorId])
  useEffect(() => {
    if (!exemptionTypeId && exemptionTypes?.[0]) setExemptionTypeId(exemptionTypes[0].id)
  }, [exemptionTypes, exemptionTypeId])
  // TODO(api): reference.vaccines не фильтруется по nosology — пока показываем все.
  useEffect(() => {
    if (!vaccineId && vaccines?.[0]) setVaccineId(vaccines[0].id)
  }, [vaccines, vaccineId])

  const schedule = useMemo(
    () => schedules?.find((s) => s.id === scheduleId),
    [schedules, scheduleId],
  )
  const display = schedule ? getScheduleDisplay(schedule) : { color: 'teal' as const, subtitle: '' }

  const stats = useMemo(() => {
    if (!schedules || !patient) return { overdue: 0, dueSoon: 0, total: 0 }
    let overdue = 0
    let dueSoon = 0
    for (const s of schedules) {
      const st = getScheduleStatus(s.id, patient.planItems, patient.vaccinationRecords)
      if (st === 'overdue') overdue++
      else if (st === 'due-soon') dueSoon++
    }
    return { overdue, dueSoon, total: patient.vaccinationRecords.length }
  }, [schedules, patient])

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
      : !!(scheduleId && date && exemptionTypeId && doctorId)

  const handleSave = async () => {
    if (!canSave || saved) return
    await recordMutation.mutateAsync({
      patientId,
      vaccineScheduleId: scheduleId,
      vaccinationDate: new Date(date),
      doctorId: doctorId || undefined,
      ...(mode === 'vaccination'
        ? {
            vaccineId: vaccineId || undefined,
            series: series || undefined,
            doseNumber: doseMl ? parseFloat(doseMl) : undefined,
            result: result || undefined,
          }
        : {
            medExemptionTypeId: exemptionTypeId,
            medExemptionDate: new Date(date),
          }),
    })
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
      <FormStyles />

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

            <div className="vt-vac-schedule-section">
              <div className="vt-vac-schedule-head">
                <span className="vt-label" style={{ margin: 0 }}>Нозология из нацкалендаря</span>
                <div className="vt-vac-legend">
                  <LegendDot color="var(--vt-cat-coral-deep)" label="просрочено" />
                  <LegendDot color="var(--vt-cat-amber-deep)" label="скоро" />
                  <LegendDot color="var(--vt-primary)" label="в плане" />
                  <LegendDot color="var(--vt-cat-violet-deep)" label="не делали" />
                </div>
              </div>

              {schedulesQ.isLoading ? (
                <div className="vt-loading">Загрузка нозологий…</div>
              ) : schedules && schedules.length > 0 ? (
                <div className="vt-vac-schedule-grid">
                  {schedules.map((s) => {
                    const d = getScheduleDisplay(s)
                    const st = getScheduleStatus(s.id, patient.planItems, patient.vaccinationRecords)
                    const active = scheduleId === s.id
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={`vt-vac-card ${active ? 'active' : ''}`}
                        data-cat={d.color}
                        onClick={() => {
                          setScheduleId(s.id)
                          setVaccineId('') // сбросим, чтобы auto-select сработал
                        }}
                      >
                        <div className="vt-vac-card-row">
                          <div className="vt-display vt-vac-card-title">{s.name}</div>
                          {active && <IconCheck size={15} />}
                        </div>
                        {d.subtitle && <div className="vt-vac-card-sub">{d.subtitle}</div>}
                        <StatusPill status={st} />
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="vt-empty">Нет доступных нозологий</div>
              )}
            </div>

            {mode === 'vaccination' ? (
              <div className="vt-card vt-vac-form" data-cat={display.color}>
                <div className="vt-vac-form-head">
                  <IconSparkles size={14} />
                  <span>{schedule?.name ?? '—'}</span>
                </div>

                <div className="vt-vac-cols-2-tight">
                  <Field label="Препарат">
                    <select
                      className="vt-select vt-vac-select-accent"
                      value={vaccineId}
                      onChange={(e) => setVaccineId(e.target.value)}
                    >
                      <option value="">— выберите —</option>
                      {vaccines?.map((v) => (
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
                      value={doseMl}
                      onChange={(e) => setDoseMl(e.target.value)}
                    />
                  </Field>
                </div>

                <div className="vt-vac-cols-3">
                  <Field label="Дата">
                    <input type="date" className="vt-input" value={date} onChange={(e) => setDate(e.target.value)} max={today()} />
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
                  disabled={!canSave || recordMutation.isPending || saved}
                  onClick={handleSave}
                  type="button"
                >
                  {recordMutation.isPending
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
                  <PreviewRow label="Нозология" value={schedule?.name ?? '—'} accent />
                  <PreviewRow label="Препарат" value={currentVaccine?.name ?? '—'} strong />
                  <PreviewRow label="Дата" value={formatDateRu(date)} mono />
                  <PreviewRow label="Серия" value={series || '—'} mono />
                  <PreviewRow label="Доза" value={`${doseMl} мл`} mono />
                  <PreviewRow label="Тип" value={doseTypeLabel} accent />
                  {age != null && <PreviewRow label="Возраст" value={`${age} лет`} />}
                  <PreviewRow label="Врач" value={currentDoctor ? doctorName(currentDoctor) : '—'} />
                  <PreviewRow label="Результат" value={result} />
                </div>
              ) : (
                <div className="vt-vac-preview-body">
                  <PreviewRow label="Отвод от" value={schedule?.name ?? '—'} accent />
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
  badge?: 'violet' | 'accent'
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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="vt-vac-legend-item">
      <span className="vt-vac-legend-dot" style={{ background: color }} />
      {label}
    </span>
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

/* ——— scoped styles ——— */

function FormStyles() {
  return (
    <style>{`
      .vt-vac { min-height: 100vh; background: var(--vt-bg); }
      .vt-vac-inner { max-width: 1280px; margin: 0 auto; padding: 28px 32px; }

      .vt-vac-head {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 6px;
      }
      .vt-vac-title {
        font-family: var(--vt-font-display);
        font-size: 34px;
        font-weight: 500;
        margin: 0;
        letter-spacing: -0.03em;
      }
      .vt-vac-title em { color: var(--vt-primary-hover); font-style: italic; }
      .vt-vac-id {
        font-family: var(--vt-font-mono);
        font-size: 12px;
        color: var(--vt-hint);
        background: var(--vt-bg-warm);
        padding: 3px 9px;
        border-radius: 6px;
      }
      .vt-vac-date {
        margin-left: auto;
        font-family: var(--vt-font-mono);
        font-size: 13px;
        color: var(--vt-muted);
      }
      .vt-vac-sub {
        color: var(--vt-muted);
        margin: 0 0 28px;
        font-size: 14px;
      }

      .vt-vac-grid {
        display: grid;
        grid-template-columns: 340px 1fr 320px;
        gap: 22px;
      }
      @media (max-width: 1100px) {
        .vt-vac-grid { grid-template-columns: 1fr; }
      }

      .vt-vac-aside { display: flex; flex-direction: column; gap: 14px; }

      .vt-vac-patient {
        background: linear-gradient(180deg, var(--vt-surface) 0%, var(--vt-surface-tint) 100%);
        border: 1.5px solid var(--vt-border);
        border-radius: 16px;
        padding: 20px;
      }
      .vt-vac-patient-top {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }
      .vt-vac-avatar-lg { width: 50px; height: 50px; font-size: 16px; }
      .vt-vac-patient-name-wrap { flex: 1; min-width: 0; }
      .vt-vac-patient-name {
        font-size: 17px;
        font-weight: 500;
        line-height: 1.2;
        letter-spacing: -0.01em;
      }
      .vt-vac-patient-meta { font-size: 13px; color: var(--vt-muted); margin-top: 2px; }

      .vt-vac-stats { display: flex; gap: 6px; margin-bottom: 16px; }
      .vt-vac-stat { flex: 1; padding: 10px 12px; border-radius: 10px; display: flex; flex-direction: column; gap: 2px; }
      .vt-vac-stat-value { font-size: 20px; font-weight: 600; line-height: 1; }
      .vt-vac-stat-label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        opacity: 0.8;
      }
      .vt-vac-stat-coral { background: var(--vt-danger-bg); color: var(--vt-danger-text); }
      .vt-vac-stat-amber { background: var(--vt-warning-bg); color: var(--vt-warning-text); }
      .vt-vac-stat-accent { background: var(--vt-accent-bg); color: var(--vt-accent-text); }

      .vt-vac-rows { display: grid; gap: 9px; font-size: 13px; }
      .vt-vac-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
      .vt-vac-row > span:first-child { font-size: 12px; }

      .vt-vac-history { padding: 20px; }
      .vt-vac-history-head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; color: var(--vt-muted); }
      .vt-vac-timeline { position: relative; padding-left: 16px; }
      .vt-vac-timeline-rail {
        position: absolute;
        left: 4px;
        top: 8px;
        bottom: 8px;
        width: 2px;
        background: linear-gradient(180deg, var(--vt-primary) 0%, var(--vt-border) 100%);
        border-radius: 2px;
      }
      .vt-vac-timeline-item { position: relative; margin-bottom: 14px; }
      .vt-vac-timeline-item:last-child { margin-bottom: 0; }
      .vt-vac-timeline-dot {
        position: absolute;
        left: -16px;
        top: 4px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--dot, var(--vt-primary));
        border: 2px solid var(--vt-surface);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--dot, var(--vt-primary)) 25%, transparent);
      }
      .vt-vac-timeline-title { font-size: 13px; font-weight: 500; }
      .vt-vac-timeline-meta {
        font-size: 11px;
        color: var(--vt-hint);
        margin-top: 2px;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .vt-vac-toggle-row { display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
      .vt-vac-mode {
        display: inline-flex;
        background: var(--vt-bg-warm);
        padding: 4px;
        border-radius: 12px;
        gap: 2px;
      }
      .vt-vac-mode button {
        background: transparent;
        border: none;
        padding: 9px 18px;
        font-family: inherit;
        font-size: 14px;
        font-weight: 500;
        color: var(--vt-muted);
        border-radius: 9px;
        cursor: pointer;
        transition: all 0.15s;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .vt-vac-mode button.on {
        background: linear-gradient(180deg, var(--vt-surface) 0%, var(--vt-surface-tint) 100%);
        color: var(--vt-primary-hover);
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      }
      .vt-vac-mode button.on-exempt {
        background: linear-gradient(180deg, var(--vt-surface) 0%, var(--vt-danger-bg) 100%);
        color: var(--vt-danger-text);
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      }
      .vt-vac-exempt-hint {
        font-size: 13px;
        color: var(--vt-danger-text);
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 500;
      }

      .vt-vac-schedule-section { margin-bottom: 22px; }
      .vt-vac-schedule-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .vt-vac-legend { display: flex; gap: 10px; font-size: 11px; color: var(--vt-muted); }
      .vt-vac-legend-item { display: inline-flex; align-items: center; gap: 4px; }
      .vt-vac-legend-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }

      .vt-vac-schedule-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
      }
      @media (max-width: 900px) {
        .vt-vac-schedule-grid { grid-template-columns: repeat(2, 1fr); }
      }

      .vt-vac-card {
        text-align: left;
        background: var(--vt-surface);
        border: 1.5px solid var(--vt-border);
        border-radius: 14px;
        padding: 14px 16px;
        cursor: pointer;
        transition: all 0.18s cubic-bezier(.4,0,.2,1);
        position: relative;
        overflow: hidden;
        font-family: inherit;
      }
      .vt-vac-card::before {
        content: '';
        position: absolute;
        left: 0; top: 0; bottom: 0;
        width: 4px;
        transition: width 0.18s ease;
      }
      .vt-vac-card[data-cat="amber"]::before { background: var(--vt-cat-amber-deep); }
      .vt-vac-card[data-cat="teal"]::before { background: var(--vt-cat-teal-deep); }
      .vt-vac-card[data-cat="coral"]::before { background: var(--vt-cat-coral-deep); }
      .vt-vac-card[data-cat="violet"]::before { background: var(--vt-cat-violet-deep); }
      .vt-vac-card[data-cat="blue"]::before { background: var(--vt-cat-blue-deep); }
      .vt-vac-card[data-cat="rose"]::before { background: var(--vt-cat-rose-deep); }

      .vt-vac-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px -4px rgba(0,0,0,0.06); }
      .vt-vac-card:hover::before { width: 6px; }
      .vt-vac-card.active::before { width: 6px; }
      .vt-vac-card.active[data-cat="amber"] { background: var(--vt-cat-amber-tint); border-color: var(--vt-cat-amber-border); }
      .vt-vac-card.active[data-cat="teal"] { background: var(--vt-cat-teal-tint); border-color: var(--vt-cat-teal-border); }
      .vt-vac-card.active[data-cat="coral"] { background: var(--vt-cat-coral-tint); border-color: var(--vt-cat-coral-border); }
      .vt-vac-card.active[data-cat="violet"] { background: var(--vt-cat-violet-tint); border-color: var(--vt-cat-violet-border); }
      .vt-vac-card.active[data-cat="blue"] { background: var(--vt-cat-blue-tint); border-color: var(--vt-cat-blue-border); }
      .vt-vac-card.active[data-cat="rose"] { background: var(--vt-cat-rose-tint); border-color: var(--vt-cat-rose-border); }

      .vt-vac-card-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; color: var(--vt-primary-hover); }
      .vt-vac-card-title { font-size: 16px; font-weight: 600; color: var(--vt-text); letter-spacing: -0.01em; }
      .vt-vac-card-sub { font-size: 11px; color: var(--vt-muted); margin-bottom: 10px; }

      .vt-vac-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
      }
      .vt-vac-pill-dot { width: 5px; height: 5px; border-radius: 50%; display: inline-block; }
      .vt-vac-pill-overdue { background: var(--vt-danger-bg); color: var(--vt-danger-text); }
      .vt-vac-pill-overdue .vt-vac-pill-dot { background: var(--vt-cat-coral-deep); }
      .vt-vac-pill-due-soon { background: var(--vt-warning-bg); color: var(--vt-warning-text); }
      .vt-vac-pill-due-soon .vt-vac-pill-dot { background: var(--vt-cat-amber-deep); }
      .vt-vac-pill-planned { background: var(--vt-accent-bg); color: var(--vt-accent-text); }
      .vt-vac-pill-planned .vt-vac-pill-dot { background: var(--vt-primary); }
      .vt-vac-pill-never { background: var(--vt-violet-bg); color: var(--vt-violet-text); }
      .vt-vac-pill-never .vt-vac-pill-dot { background: var(--vt-cat-violet-deep); }

      .vt-vac-form {
        padding: 22px;
        display: grid;
        gap: 18px;
      }
      .vt-vac-form-head {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .vt-vac-form[data-cat="amber"] .vt-vac-form-head { color: var(--vt-cat-amber-text); }
      .vt-vac-form[data-cat="teal"] .vt-vac-form-head { color: var(--vt-cat-teal-text); }
      .vt-vac-form[data-cat="coral"] .vt-vac-form-head { color: var(--vt-cat-coral-text); }
      .vt-vac-form[data-cat="violet"] .vt-vac-form-head { color: var(--vt-cat-violet-text); }
      .vt-vac-form[data-cat="blue"] .vt-vac-form-head { color: var(--vt-cat-blue-text); }
      .vt-vac-form[data-cat="rose"] .vt-vac-form-head { color: var(--vt-cat-rose-text); }

      .vt-vac-form-exempt { border-color: var(--vt-danger-border); }
      .vt-vac-exempt-note {
        background: linear-gradient(135deg, var(--vt-danger-bg) 0%, var(--vt-warning-bg) 100%);
        border: 1.5px solid var(--vt-danger-border);
        border-radius: 12px;
        padding: 14px;
        display: flex;
        gap: 10px;
        align-items: flex-start;
        color: var(--vt-danger-text);
        font-size: 13px;
        line-height: 1.5;
      }

      .vt-vac-field { display: flex; flex-direction: column; }
      .vt-vac-cols-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .vt-vac-cols-2-1 { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; }
      .vt-vac-cols-2-tight { display: grid; grid-template-columns: 1fr 120px; gap: 12px; }
      .vt-vac-cols-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }

      .vt-vac-select-accent {
        background-color: var(--vt-surface-tint);
      }
      .vt-vac-readonly {
        background-color: var(--vt-surface-tint);
        font-weight: 500;
      }

      .vt-vac-footer {
        margin-top: 22px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .vt-vac-footer-hint {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--vt-muted);
      }
      .vt-vac-footer-actions { display: flex; gap: 10px; align-items: center; }
      .vt-vac-toast {
        font-size: 13px;
        color: var(--vt-accent-text);
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        background: var(--vt-accent-bg);
        padding: 8px 12px;
        border-radius: 8px;
      }

      .vt-vac-preview { position: sticky; top: 20px; overflow: hidden; padding: 0; }
      .vt-vac-preview-head {
        padding: 12px 20px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        border-bottom: 1.5px solid var(--vt-border);
      }
      .vt-vac-preview[data-cat="amber"] .vt-vac-preview-head { background: linear-gradient(90deg, var(--vt-cat-amber-tint), var(--vt-cat-amber-bg)); color: var(--vt-cat-amber-text); border-bottom-color: var(--vt-cat-amber-border); }
      .vt-vac-preview[data-cat="teal"] .vt-vac-preview-head { background: linear-gradient(90deg, var(--vt-cat-teal-tint), var(--vt-cat-teal-bg)); color: var(--vt-cat-teal-text); border-bottom-color: var(--vt-cat-teal-border); }
      .vt-vac-preview[data-cat="coral"] .vt-vac-preview-head { background: linear-gradient(90deg, var(--vt-cat-coral-tint), var(--vt-cat-coral-bg)); color: var(--vt-cat-coral-text); border-bottom-color: var(--vt-cat-coral-border); }
      .vt-vac-preview[data-cat="violet"] .vt-vac-preview-head { background: linear-gradient(90deg, var(--vt-cat-violet-tint), var(--vt-cat-violet-bg)); color: var(--vt-cat-violet-text); border-bottom-color: var(--vt-cat-violet-border); }
      .vt-vac-preview[data-cat="blue"] .vt-vac-preview-head { background: linear-gradient(90deg, var(--vt-cat-blue-tint), var(--vt-cat-blue-bg)); color: var(--vt-cat-blue-text); border-bottom-color: var(--vt-cat-blue-border); }
      .vt-vac-preview[data-cat="rose"] .vt-vac-preview-head { background: linear-gradient(90deg, var(--vt-cat-rose-tint), var(--vt-cat-rose-bg)); color: var(--vt-cat-rose-text); border-bottom-color: var(--vt-cat-rose-border); }

      .vt-vac-preview-body { padding: 16px 20px 0; font-size: 13px; line-height: 1.6; }
      .vt-vac-preview-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
        margin-bottom: 7px;
        padding-bottom: 7px;
        border-bottom: 1px dotted var(--vt-border);
      }
      .vt-vac-preview-label {
        color: var(--vt-hint);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 500;
      }
      .vt-vac-preview-value {
        text-align: right;
        color: var(--vt-text);
        font-size: 13px;
        font-weight: 500;
      }
      .vt-vac-preview-value.strong { font-weight: 600; }
      .vt-vac-preview-value.accent { font-weight: 600; }
      .vt-vac-preview[data-cat="amber"] .vt-vac-preview-value.accent { color: var(--vt-cat-amber-text); }
      .vt-vac-preview[data-cat="teal"] .vt-vac-preview-value.accent { color: var(--vt-cat-teal-text); }
      .vt-vac-preview[data-cat="coral"] .vt-vac-preview-value.accent { color: var(--vt-cat-coral-text); }
      .vt-vac-preview[data-cat="violet"] .vt-vac-preview-value.accent { color: var(--vt-cat-violet-text); }
      .vt-vac-preview[data-cat="blue"] .vt-vac-preview-value.accent { color: var(--vt-cat-blue-text); }
      .vt-vac-preview[data-cat="rose"] .vt-vac-preview-value.accent { color: var(--vt-cat-rose-text); }

      .vt-vac-next {
        margin: 14px 20px 20px;
        padding: 12px;
        background: var(--vt-surface-tint);
        border-radius: 10px;
        border: 1px dashed var(--vt-border-strong);
        font-size: 12px;
        line-height: 1.5;
      }
      .vt-vac-next-label {
        font-weight: 600;
        color: var(--vt-primary-hover);
        margin-bottom: 5px;
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
    `}</style>
  )
}
