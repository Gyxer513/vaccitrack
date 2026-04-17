import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { trpc } from '../lib/trpc'
import { format } from 'date-fns'

type FormState = {
  vaccineScheduleId: string
  vaccineId: string
  vaccinationDate: string
  series: string
  doseNumber: string
  doctorId: string
  result: string
  isEpid: boolean
  isExternal: boolean
  isMedExempt: boolean
  medExemptionTypeId: string
  medExemptionDate: string
  nextScheduledDate: string
}

const INITIAL: FormState = {
  vaccineScheduleId: '',
  vaccineId: '',
  vaccinationDate: format(new Date(), 'yyyy-MM-dd'),
  series: '',
  doseNumber: '',
  doctorId: '',
  result: '',
  isEpid: false,
  isExternal: false,
  isMedExempt: false,
  medExemptionTypeId: '',
  medExemptionDate: '',
  nextScheduledDate: '',
}

export function RecordVaccinationPage() {
  const { id: patientId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(INITIAL)
  const [step, setStep] = useState<1 | 2>(1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const { data: patient } = trpc.patient.getById.useQuery({ id: patientId! })
  const { data: schedules } = trpc.reference.schedules.useQuery()
  const { data: vaccines } = trpc.reference.vaccines.useQuery()
  const { data: doctors } = trpc.reference.doctors.useQuery()
  const { data: exemptionTypes } = trpc.reference.medExemptionTypes.useQuery()

  const recordMutation = trpc.vaccination.record.useMutation({
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => navigate(`/patients/${patientId}`), 1200)
    },
  })

  // Фильтруем препараты по выбранной нозологии
  const filteredVaccines = form.vaccineScheduleId
    ? vaccines?.filter((v) =>
        v.scheduleLinks?.some((l: any) => l.vaccineScheduleId === form.vaccineScheduleId),
      ) ?? vaccines
    : vaccines

  const set = (key: keyof FormState, value: any) =>
    setForm((f) => ({ ...f, [key]: value }))

  const canProceed =
    form.vaccineScheduleId &&
    form.vaccinationDate &&
    (form.isMedExempt ? form.medExemptionTypeId : true)

  const handleSubmit = async () => {
    setSaving(true)
    await recordMutation.mutateAsync({
      patientId: patientId!,
      vaccineScheduleId: form.vaccineScheduleId || undefined,
      vaccineId: form.vaccineId || undefined,
      vaccinationDate: new Date(form.vaccinationDate),
      series: form.series || undefined,
      doseNumber: form.doseNumber ? parseFloat(form.doseNumber) : undefined,
      doctorId: form.doctorId || undefined,
      result: form.result || undefined,
      isEpid: form.isEpid,
      isExternal: form.isExternal,
      medExemptionTypeId: form.isMedExempt ? form.medExemptionTypeId : undefined,
      medExemptionDate: form.isMedExempt && form.medExemptionDate
        ? new Date(form.medExemptionDate)
        : undefined,
      nextScheduledDate: form.nextScheduledDate
        ? new Date(form.nextScheduledDate)
        : undefined,
    })
    setSaving(false)
  }

  const fullName = patient
    ? `${patient.lastName} ${patient.firstName} ${patient.middleName ?? ''}`.trim()
    : '...'

  const selectedSchedule = schedules?.find((s) => s.id === form.vaccineScheduleId)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=DM+Sans:wght@300;400;500&display=swap');

        .vt-root {
          font-family: 'DM Sans', sans-serif;
          min-height: 100vh;
          background: #f7f6f3;
        }

        .vt-header {
          background: #fff;
          border-bottom: 1px solid #e8e5df;
          padding: 20px 32px;
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .vt-back {
          width: 36px; height: 36px;
          border: 1.5px solid #ddd;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          color: #888;
          transition: all .15s;
          background: transparent;
          font-size: 16px;
          text-decoration: none;
        }
        .vt-back:hover { border-color: #999; color: #333; background: #f5f5f5; }

        .vt-patient-chip {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .vt-patient-avatar {
          width: 38px; height: 38px;
          border-radius: 50%;
          background: linear-gradient(135deg, #c8e6c9 0%, #a5d6a7 100%);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Lora', serif;
          font-size: 14px;
          font-weight: 600;
          color: #2e7d32;
          flex-shrink: 0;
        }

        .vt-patient-name {
          font-family: 'Lora', serif;
          font-size: 15px;
          font-weight: 500;
          color: #1a1a1a;
          line-height: 1.2;
        }

        .vt-patient-meta {
          font-size: 12px;
          color: #888;
          margin-top: 1px;
        }

        .vt-header-title {
          margin-left: auto;
          font-size: 12px;
          color: #aaa;
          letter-spacing: .05em;
          text-transform: uppercase;
        }

        /* Steps */
        .vt-steps {
          display: flex;
          align-items: center;
          gap: 0;
          padding: 0 32px;
          background: #fff;
          border-bottom: 1px solid #e8e5df;
        }

        .vt-step {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 0;
          position: relative;
          cursor: pointer;
          opacity: .45;
          transition: opacity .2s;
        }
        .vt-step.active { opacity: 1; }
        .vt-step.done { opacity: .7; }

        .vt-step-num {
          width: 26px; height: 26px;
          border-radius: 50%;
          border: 1.5px solid #ccc;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px;
          font-weight: 500;
          color: #999;
          transition: all .2s;
          flex-shrink: 0;
        }
        .vt-step.active .vt-step-num {
          border-color: #2e7d32;
          background: #2e7d32;
          color: #fff;
        }
        .vt-step.done .vt-step-num {
          border-color: #66bb6a;
          background: #e8f5e9;
          color: #2e7d32;
        }

        .vt-step-label {
          font-size: 13px;
          color: #555;
          font-weight: 400;
        }
        .vt-step.active .vt-step-label { color: #1a1a1a; font-weight: 500; }

        .vt-step-divider {
          width: 40px;
          height: 1px;
          background: #e0e0e0;
          margin: 0 12px;
        }

        /* Body */
        .vt-body {
          max-width: 680px;
          margin: 40px auto;
          padding: 0 24px;
        }

        .vt-section {
          background: #fff;
          border: 1px solid #e8e5df;
          border-radius: 16px;
          padding: 28px;
          margin-bottom: 16px;
          animation: vt-fadein .25s ease;
        }

        @keyframes vt-fadein {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .vt-section-title {
          font-family: 'Lora', serif;
          font-size: 15px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .vt-section-title::before {
          content: '';
          display: block;
          width: 3px; height: 16px;
          border-radius: 2px;
          background: #2e7d32;
          flex-shrink: 0;
        }

        /* Fields */
        .vt-field {
          margin-bottom: 18px;
        }
        .vt-field:last-child { margin-bottom: 0; }

        .vt-label {
          display: block;
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: .07em;
          color: #888;
          margin-bottom: 6px;
        }

        .vt-label span.req {
          color: #e53935;
          margin-left: 2px;
        }

        .vt-input, .vt-select, .vt-textarea {
          width: 100%;
          border: 1.5px solid #e0ddd7;
          border-radius: 10px;
          padding: 10px 14px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          color: #1a1a1a;
          background: #fafaf8;
          transition: border-color .15s, box-shadow .15s, background .15s;
          outline: none;
          box-sizing: border-box;
        }
        .vt-input:focus, .vt-select:focus, .vt-textarea:focus {
          border-color: #66bb6a;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(102,187,106,.12);
        }
        .vt-select { appearance: none; cursor: pointer; }

        .vt-select-wrap {
          position: relative;
        }
        .vt-select-wrap::after {
          content: '▾';
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #aaa;
          font-size: 12px;
          pointer-events: none;
        }

        .vt-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        /* Toggle switch */
        .vt-toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          background: #fafaf8;
          border: 1.5px solid #e0ddd7;
          border-radius: 10px;
          margin-bottom: 10px;
          cursor: pointer;
          transition: background .15s, border-color .15s;
        }
        .vt-toggle-row:hover { background: #f5f5f2; }
        .vt-toggle-row.on { border-color: #a5d6a7; background: #f1f8f1; }

        .vt-toggle-label {
          font-size: 13px;
          color: #444;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .vt-toggle-icon {
          font-size: 15px;
        }

        .vt-switch {
          width: 38px; height: 22px;
          background: #ddd;
          border-radius: 11px;
          position: relative;
          transition: background .2s;
          flex-shrink: 0;
        }
        .vt-switch.on { background: #43a047; }
        .vt-switch::after {
          content: '';
          position: absolute;
          width: 16px; height: 16px;
          border-radius: 50%;
          background: #fff;
          top: 3px; left: 3px;
          transition: transform .2s;
          box-shadow: 0 1px 3px rgba(0,0,0,.15);
        }
        .vt-switch.on::after { transform: translateX(16px); }

        /* Medexempt block */
        .vt-exempt-block {
          margin-top: 12px;
          padding: 16px;
          background: #fff8e1;
          border: 1.5px solid #ffe082;
          border-radius: 10px;
          animation: vt-fadein .2s ease;
        }

        .vt-exempt-block .vt-label { color: #b07c00; }
        .vt-exempt-block .vt-input,
        .vt-exempt-block .vt-select { background: #fffdf5; border-color: #ffd54f; }
        .vt-exempt-block .vt-input:focus,
        .vt-exempt-block .vt-select:focus {
          border-color: #f9a825;
          box-shadow: 0 0 0 3px rgba(249,168,37,.12);
        }

        /* Schedule card */
        .vt-schedule-card {
          margin-top: 10px;
          padding: 12px 16px;
          background: #e8f5e9;
          border: 1.5px solid #a5d6a7;
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          animation: vt-fadein .2s ease;
        }
        .vt-schedule-card-icon { font-size: 18px; }
        .vt-schedule-card-name {
          font-size: 13px;
          font-weight: 500;
          color: #1b5e20;
        }
        .vt-schedule-card-key {
          font-size: 11px;
          color: #66bb6a;
          background: #c8e6c9;
          padding: 2px 6px;
          border-radius: 4px;
          margin-left: auto;
          font-weight: 500;
        }

        /* Footer */
        .vt-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          max-width: 680px;
          margin: 0 auto;
        }

        .vt-btn {
          height: 44px;
          padding: 0 24px;
          border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all .15s;
          border: none;
          outline: none;
        }

        .vt-btn-ghost {
          background: transparent;
          border: 1.5px solid #ddd;
          color: #666;
        }
        .vt-btn-ghost:hover { border-color: #999; color: #333; background: #f5f5f5; }

        .vt-btn-primary {
          background: #2e7d32;
          color: #fff;
          min-width: 140px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .vt-btn-primary:hover:not(:disabled) { background: #1b5e20; }
        .vt-btn-primary:disabled { opacity: .45; cursor: not-allowed; }

        .vt-btn-primary.saving {
          background: #43a047;
        }

        /* Spinner */
        @keyframes spin { to { transform: rotate(360deg); } }
        .vt-spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin .6s linear infinite;
        }

        /* Success */
        .vt-success {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 24px;
          text-align: center;
          animation: vt-fadein .3s ease;
        }
        .vt-success-icon {
          width: 64px; height: 64px;
          border-radius: 50%;
          background: #e8f5e9;
          border: 2px solid #a5d6a7;
          display: flex; align-items: center; justify-content: center;
          font-size: 28px;
          margin-bottom: 16px;
        }
        .vt-success-title {
          font-family: 'Lora', serif;
          font-size: 20px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 6px;
        }
        .vt-success-sub {
          font-size: 13px;
          color: #888;
        }

        /* Hint */
        .vt-hint {
          font-size: 11px;
          color: #aaa;
          margin-top: 5px;
        }
      `}</style>

      <div className="vt-root">
        {/* Header */}
        <div className="vt-header">
          <a href={`/patients/${patientId}`} className="vt-back">←</a>
          <div className="vt-patient-chip">
            <div className="vt-patient-avatar">
              {patient ? patient.lastName[0] + patient.firstName[0] : '??'}
            </div>
            <div>
              <div className="vt-patient-name">{fullName}</div>
              <div className="vt-patient-meta">
                {patient
                  ? `${format(new Date(patient.birthday), 'dd.MM.yyyy')} · ${patient.district?.code ?? 'без участка'}`
                  : '...'}
              </div>
            </div>
          </div>
          <div className="vt-header-title">Запись прививки</div>
        </div>

        {/* Steps */}
        <div className="vt-steps">
          <div
            className={`vt-step ${step === 1 ? 'active' : 'done'}`}
            onClick={() => !saved && setStep(1)}
          >
            <div className="vt-step-num">{step > 1 ? '✓' : '1'}</div>
            <div className="vt-step-label">Прививка</div>
          </div>
          <div className="vt-step-divider" />
          <div className={`vt-step ${step === 2 ? 'active' : ''}`}>
            <div className="vt-step-num">2</div>
            <div className="vt-step-label">Препарат и врач</div>
          </div>
        </div>

        {/* Success */}
        {saved ? (
          <div className="vt-body">
            <div className="vt-success">
              <div className="vt-success-icon">✓</div>
              <div className="vt-success-title">Прививка записана</div>
              <div className="vt-success-sub">Возвращаемся к карточке пациента...</div>
            </div>
          </div>
        ) : (
          <>
            <div className="vt-body">

              {/* ШАГ 1 */}
              {step === 1 && (
                <>
                  <div className="vt-section">
                    <div className="vt-section-title">Нозология</div>

                    <div className="vt-field">
                      <label className="vt-label">Прививка по нацкалендарю <span className="req">*</span></label>
                      <div className="vt-select-wrap">
                        <select
                          className="vt-select"
                          value={form.vaccineScheduleId}
                          onChange={(e) => {
                            set('vaccineScheduleId', e.target.value)
                            set('vaccineId', '')
                          }}
                        >
                          <option value="">— выберите —</option>
                          {schedules?.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}{s.key ? ` (${s.key})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      {selectedSchedule && (
                        <div className="vt-schedule-card">
                          <span className="vt-schedule-card-icon">💉</span>
                          <span className="vt-schedule-card-name">{selectedSchedule.name}</span>
                          {selectedSchedule.key && (
                            <span className="vt-schedule-card-key">{selectedSchedule.key}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="vt-field">
                      <label className="vt-label">Дата введения <span className="req">*</span></label>
                      <input
                        type="date"
                        className="vt-input"
                        value={form.vaccinationDate}
                        max={format(new Date(), 'yyyy-MM-dd')}
                        onChange={(e) => set('vaccinationDate', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="vt-section">
                    <div className="vt-section-title">Флаги</div>

                    <div
                      className={`vt-toggle-row ${form.isMedExempt ? 'on' : ''}`}
                      onClick={() => set('isMedExempt', !form.isMedExempt)}
                    >
                      <span className="vt-toggle-label">
                        <span className="vt-toggle-icon">⚠️</span>
                        Медицинский отвод
                      </span>
                      <div className={`vt-switch ${form.isMedExempt ? 'on' : ''}`} />
                    </div>

                    {form.isMedExempt && (
                      <div className="vt-exempt-block">
                        <div className="vt-field">
                          <label className="vt-label">Причина отвода <span className="req">*</span></label>
                          <div className="vt-select-wrap">
                            <select
                              className="vt-select"
                              value={form.medExemptionTypeId}
                              onChange={(e) => set('medExemptionTypeId', e.target.value)}
                            >
                              <option value="">— выберите —</option>
                              {exemptionTypes?.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="vt-field">
                          <label className="vt-label">Дата отвода</label>
                          <input
                            type="date"
                            className="vt-input"
                            value={form.medExemptionDate}
                            onChange={(e) => set('medExemptionDate', e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    <div
                      className={`vt-toggle-row ${form.isEpid ? 'on' : ''}`}
                      onClick={() => set('isEpid', !form.isEpid)}
                    >
                      <span className="vt-toggle-label">
                        <span className="vt-toggle-icon">🦠</span>
                        По эпидемическим показаниям
                      </span>
                      <div className={`vt-switch ${form.isEpid ? 'on' : ''}`} />
                    </div>

                    <div
                      className={`vt-toggle-row ${form.isExternal ? 'on' : ''}`}
                      onClick={() => set('isExternal', !form.isExternal)}
                    >
                      <span className="vt-toggle-label">
                        <span className="vt-toggle-icon">🏥</span>
                        Сделана в другом ЛПУ
                      </span>
                      <div className={`vt-switch ${form.isExternal ? 'on' : ''}`} />
                    </div>
                  </div>
                </>
              )}

              {/* ШАГ 2 */}
              {step === 2 && (
                <>
                  <div className="vt-section">
                    <div className="vt-section-title">Препарат</div>

                    <div className="vt-field">
                      <label className="vt-label">Вакцина</label>
                      <div className="vt-select-wrap">
                        <select
                          className="vt-select"
                          value={form.vaccineId}
                          onChange={(e) => set('vaccineId', e.target.value)}
                        >
                          <option value="">— выберите —</option>
                          {filteredVaccines?.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}{v.producer ? ` (${v.producer})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="vt-row">
                      <div className="vt-field">
                        <label className="vt-label">Серия</label>
                        <input
                          className="vt-input"
                          placeholder="напр. XOC211M"
                          value={form.series}
                          onChange={(e) => set('series', e.target.value)}
                        />
                      </div>
                      <div className="vt-field">
                        <label className="vt-label">Доза (мл)</label>
                        <input
                          className="vt-input"
                          type="number"
                          step="0.1"
                          placeholder="0.5"
                          value={form.doseNumber}
                          onChange={(e) => set('doseNumber', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="vt-section">
                    <div className="vt-section-title">Врач и результат</div>

                    <div className="vt-field">
                      <label className="vt-label">Врач</label>
                      <div className="vt-select-wrap">
                        <select
                          className="vt-select"
                          value={form.doctorId}
                          onChange={(e) => set('doctorId', e.target.value)}
                        >
                          <option value="">— выберите —</option>
                          {doctors?.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.lastName} {d.firstName} {d.middleName ?? ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="vt-field">
                      <label className="vt-label">Реакция / результат</label>
                      <input
                        className="vt-input"
                        placeholder="напр. Без реакции"
                        value={form.result}
                        onChange={(e) => set('result', e.target.value)}
                      />
                    </div>

                    <div className="vt-field">
                      <label className="vt-label">Следующая прививка (план)</label>
                      <input
                        type="date"
                        className="vt-input"
                        value={form.nextScheduledDate}
                        onChange={(e) => set('nextScheduledDate', e.target.value)}
                      />
                      <div className="vt-hint">Заполните если известна дата следующей дозы</div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="vt-footer">
              {step === 1 ? (
                <>
                  <button
                    className="vt-btn vt-btn-ghost"
                    onClick={() => navigate(`/patients/${patientId}`)}
                  >
                    Отмена
                  </button>
                  <button
                    className="vt-btn vt-btn-primary"
                    disabled={!canProceed}
                    onClick={() => setStep(2)}
                  >
                    Далее →
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="vt-btn vt-btn-ghost"
                    onClick={() => setStep(1)}
                  >
                    ← Назад
                  </button>
                  <button
                    className={`vt-btn vt-btn-primary ${saving ? 'saving' : ''}`}
                    disabled={saving}
                    onClick={handleSubmit}
                  >
                    {saving ? (
                      <><div className="vt-spinner" /> Сохраняем...</>
                    ) : (
                      <>Записать прививку</>
                    )}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
