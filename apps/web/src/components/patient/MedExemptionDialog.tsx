import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { trpc } from '../../lib/trpc'
import { useToast } from '../ui/Dialog'

type Props = {
  patientId: string
  open: boolean
  onClose: () => void
}

type Kind = 'temporary' | 'permanent'

// Локальная дата (YYYY-MM-DD) без TZ-конверсии — иначе после 21:00 МСК
// toISOString() уже возвращает завтрашний день.
const todayLocal = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Парсит YYYY-MM-DD как локальную полночь.
const parseLocalDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const doctorName = (doc: {
  lastName: string
  firstName: string
  middleName: string | null
}) => {
  const fi = doc.firstName[0] ? `${doc.firstName[0]}.` : ''
  const mi = doc.middleName?.[0] ? `${doc.middleName[0]}.` : ''
  return `${doc.lastName} ${fi}${mi}`.trim()
}

export function MedExemptionDialog({ patientId, open, onClose }: Props) {
  const toast = useToast()
  const utils = trpc.useUtils()

  const exemptionTypesQ = trpc.reference.medExemptionTypes.useQuery(undefined, { enabled: open })
  const doctorsQ = trpc.reference.doctors.useQuery(undefined, { enabled: open })

  const [typeId, setTypeId] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>(todayLocal())
  const [kind, setKind] = useState<Kind>('temporary')
  const [dateTo, setDateTo] = useState<string>('')
  const [doctorId, setDoctorId] = useState<string>('')
  const [note, setNote] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  // Сброс формы при открытии.
  useEffect(() => {
    if (!open) return
    setTypeId('')
    setDateFrom(todayLocal())
    setKind('temporary')
    setDateTo('')
    setDoctorId('')
    setNote('')
    setError(null)
  }, [open])

  // Преселект первого варианта типа отвода — как только пришли данные и поле пустое.
  useEffect(() => {
    if (!open) return
    if (!typeId && exemptionTypesQ.data?.[0]) setTypeId(exemptionTypesQ.data[0].id)
  }, [open, exemptionTypesQ.data, typeId])

  // Esc для закрытия.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const exemptMutation = trpc.vaccination.exempt.useMutation({
    onSuccess: async () => {
      await utils.patient.getById.invalidate({ id: patientId })
      toast.success('Медотвод оформлён')
      onClose()
    },
    onError: (e) => {
      setError(e.message || 'Не удалось оформить медотвод')
    },
  })

  if (!open) return null

  const canSave =
    !!typeId && !!dateFrom && (kind === 'permanent' || !!dateTo) && !exemptMutation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!typeId) {
      setError('Выберите тип медотвода')
      return
    }
    if (!dateFrom) {
      setError('Укажите дату начала')
      return
    }
    if (kind === 'temporary') {
      if (!dateTo) {
        setError('Для срочного медотвода укажите дату окончания')
        return
      }
      if (parseLocalDate(dateTo) < parseLocalDate(dateFrom)) {
        setError('Дата окончания не может быть раньше даты начала')
        return
      }
    }

    exemptMutation.mutate({
      patientId,
      medExemptionTypeId: typeId,
      dateFrom: parseLocalDate(dateFrom),
      dateTo: kind === 'temporary' ? parseLocalDate(dateTo) : undefined,
      note: note.trim() || undefined,
      doctorId: doctorId || undefined,
    })
  }

  const exemptionTypes = exemptionTypesQ.data ?? []
  const doctors = doctorsQ.data ?? []

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(20, 20, 20, 0.45)',
        backdropFilter: 'blur(2px)',
        animation: 'vt-fade-in .12s ease',
      }}
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          background: 'var(--vt-surface)',
          borderRadius: 14,
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          maxWidth: 520, width: 'calc(100% - 48px)',
          padding: 24,
          display: 'grid', gap: 14,
          animation: 'vt-pop-in .16s cubic-bezier(.2,.9,.4,1)',
          maxHeight: 'calc(100vh - 48px)',
          overflow: 'auto',
        }}
      >
        <div style={{
          fontFamily: 'var(--vt-font-display)',
          fontSize: 18, fontWeight: 600,
          color: 'var(--vt-text)',
          letterSpacing: '-0.01em',
        }}>
          Оформить медотвод
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label className="vt-label" htmlFor="me-type">Тип медотвода *</label>
          <select
            id="me-type"
            className="vt-select"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            disabled={exemptionTypesQ.isLoading}
            required
          >
            <option value="" disabled>
              {exemptionTypesQ.isLoading ? 'Загрузка…' : 'Выберите тип'}
            </option>
            {exemptionTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label className="vt-label">Срок</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`vt-btn ${kind === 'temporary' ? 'vt-btn-primary' : 'vt-btn-ghost'}`}
              onClick={() => setKind('temporary')}
              style={{ flex: 1 }}
            >
              Срочный
            </button>
            <button
              type="button"
              className={`vt-btn ${kind === 'permanent' ? 'vt-btn-primary' : 'vt-btn-ghost'}`}
              onClick={() => setKind('permanent')}
              style={{ flex: 1 }}
            >
              Бессрочный
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: kind === 'temporary' ? '1fr 1fr' : '1fr' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="vt-label" htmlFor="me-from">Дата начала *</label>
            <input
              id="me-from"
              type="date"
              className="vt-input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              required
            />
          </div>
          {kind === 'temporary' && (
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="vt-label" htmlFor="me-to">Дата окончания *</label>
              <input
                id="me-to"
                type="date"
                className="vt-input"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                required
              />
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label className="vt-label" htmlFor="me-doctor">Врач</label>
          <select
            id="me-doctor"
            className="vt-select"
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            disabled={doctorsQ.isLoading}
          >
            <option value="">— Не указан —</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{doctorName(d)}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label className="vt-label" htmlFor="me-note">Заметка / обоснование</label>
          <textarea
            id="me-note"
            className="vt-textarea"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Например: после перенесённого ОРВИ"
          />
        </div>

        {error && (
          <div style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--vt-danger-bg)',
            color: 'var(--vt-danger-text)',
            border: '1px solid var(--vt-danger-border)',
            fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            type="button"
            className="vt-btn vt-btn-ghost"
            onClick={onClose}
            disabled={exemptMutation.isPending}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="vt-btn vt-btn-primary"
            disabled={!canSave}
          >
            {exemptMutation.isPending ? 'Сохранение…' : 'Оформить медотвод'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
