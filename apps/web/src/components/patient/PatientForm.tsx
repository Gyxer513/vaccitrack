import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { trpc } from '../../lib/trpc'
import { useToast } from '../ui/Dialog'
import { useDepartment } from '../DepartmentProvider'

type Sex = 'MALE' | 'FEMALE'

type Form = {
  lastName: string
  firstName: string
  middleName: string
  sex: Sex
  birthday: string
  phone: string
  districtId: string
  insuranceId: string
  riskGroupId: string
  policySerial: string
  policyNumber: string
  hasDirectContract: boolean
  directContractNumber: string
  isDecret: boolean
  isSelfOrganized: boolean
}

const EMPTY: Form = {
  lastName: '',
  firstName: '',
  middleName: '',
  sex: 'MALE',
  birthday: '',
  phone: '',
  districtId: '',
  insuranceId: '',
  riskGroupId: '',
  policySerial: '',
  policyNumber: '',
  hasDirectContract: false,
  directContractNumber: '',
  isDecret: false,
  isSelfOrganized: false,
}

const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const parseLocalDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Минимально необходимый «срез» пациента, который умеет принять форма
// в режиме редактирования. Шире не делаем, чтобы не тащить связи и записи.
export type PatientFormInitial = {
  id: string
  lastName: string
  firstName: string
  middleName: string | null
  sex: Sex
  birthday: string | Date
  phone: string | null
  districtId: string | null
  insuranceId: string | null
  riskGroupId: string | null
  policySerial: string | null
  policyNumber: string | null
  hasDirectContract: boolean
  directContractNumber: string | null
  isDecret: boolean
  isSelfOrganized: boolean
}

function fromInitial(p: PatientFormInitial): Form {
  return {
    lastName: p.lastName,
    firstName: p.firstName,
    middleName: p.middleName ?? '',
    sex: p.sex,
    birthday: format(new Date(p.birthday), 'yyyy-MM-dd'),
    phone: p.phone ?? '',
    districtId: p.districtId ?? '',
    insuranceId: p.insuranceId ?? '',
    riskGroupId: p.riskGroupId ?? '',
    policySerial: p.policySerial ?? '',
    policyNumber: p.policyNumber ?? '',
    hasDirectContract: p.hasDirectContract,
    directContractNumber: p.directContractNumber ?? '',
    isDecret: p.isDecret,
    isSelfOrganized: p.isSelfOrganized,
  }
}

type Props =
  | { mode: 'create'; initialData?: undefined }
  | { mode: 'edit'; initialData: PatientFormInitial }

export function PatientForm(props: Props) {
  const { mode } = props
  const navigate = useNavigate()
  const toast = useToast()
  const utils = trpc.useUtils()
  const { dept } = useDepartment()
  const [f, setF] = useState<Form>(
    mode === 'edit' ? fromInitial(props.initialData) : EMPTY,
  )
  const [error, setError] = useState<string | null>(null)

  const districtsQ = trpc.reference.districts.useQuery()
  const insurancesQ = trpc.reference.insurances.useQuery()
  const riskGroupsQ = trpc.reference.riskGroups.useQuery()

  const createMutation = trpc.patient.create.useMutation({
    onSuccess: (patient) => {
      toast.success('Пациент создан')
      navigate(`/patients/${patient.id}`)
    },
    onError: (err) => setError(err.message),
  })

  const updateMutation = trpc.patient.update.useMutation({
    onSuccess: async (patient) => {
      // Инвалидируем карточку и список, чтобы они подхватили изменения.
      await Promise.all([
        utils.patient.getById.invalidate({ id: patient.id }),
        utils.patient.list.invalidate(),
      ])
      toast.success('Сохранено')
      navigate(`/patients/${patient.id}`)
    },
    onError: (err) => setError(err.message),
  })

  const isPending = createMutation.isPending || updateMutation.isPending
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setF((prev) => ({ ...prev, [key]: value }))

  const canSave = !!(f.lastName.trim() && f.firstName.trim() && f.birthday)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setError(null)
    const payload = {
      lastName: f.lastName.trim(),
      firstName: f.firstName.trim(),
      middleName: f.middleName.trim() || undefined,
      sex: f.sex,
      birthday: parseLocalDate(f.birthday),
      phone: f.phone.trim() || undefined,
      districtId: f.districtId || undefined,
      insuranceId: f.hasDirectContract ? undefined : (f.insuranceId || undefined),
      hasDirectContract: f.hasDirectContract,
      directContractNumber: f.hasDirectContract
        ? (f.directContractNumber.trim() || undefined)
        : undefined,
      riskGroupId: f.riskGroupId || undefined,
      policySerial: f.hasDirectContract ? undefined : (f.policySerial.trim() || undefined),
      policyNumber: f.hasDirectContract ? undefined : (f.policyNumber.trim() || undefined),
      isDecret: f.isDecret,
      isSelfOrganized: f.isSelfOrganized,
    }

    if (mode === 'create') {
      await createMutation.mutateAsync(payload)
    } else {
      await updateMutation.mutateAsync({ id: props.initialData.id, data: payload })
    }
  }

  const cancelHref = mode === 'edit' ? `/patients/${props.initialData.id}` : '/patients'
  const title = mode === 'edit' ? 'Редактирование пациента' : 'Новый пациент'
  const submitLabel = mode === 'edit' ? 'Сохранить' : 'Создать пациента'
  const pendingLabel = mode === 'edit' ? 'Сохраняем…' : 'Сохраняем…'

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'grid', gap: 22, maxWidth: 880, margin: '0 auto', width: '100%' }}
    >
      <div>
        <div style={{ fontSize: 13, marginBottom: 6 }}>
          <Link to={cancelHref} className="vt-muted" style={{ textDecoration: 'none' }}>
            ← {mode === 'edit' ? 'К карточке' : 'Пациенты'}
          </Link>
        </div>
        <h1 className="vt-page-title">{title}</h1>
        <p className="vt-page-sub">Обязательные поля помечены звёздочкой.</p>
      </div>

      {/* ЛИЧНЫЕ ДАННЫЕ */}
      <div className="vt-card" style={{ padding: 22, display: 'grid', gap: 16 }}>
        <div className="vt-section-title">Личные данные</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Фамилия" required>
            <input
              className="vt-input"
              value={f.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Имя" required>
            <input
              className="vt-input"
              value={f.firstName}
              onChange={(e) => set('firstName', e.target.value)}
            />
          </Field>
          <Field label="Отчество">
            <input
              className="vt-input"
              value={f.middleName}
              onChange={(e) => set('middleName', e.target.value)}
            />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Пол" required>
            <select
              className="vt-select"
              value={f.sex}
              onChange={(e) => set('sex', e.target.value as Sex)}
            >
              <option value="MALE">Мужской</option>
              <option value="FEMALE">Женский</option>
            </select>
          </Field>
          <Field label="Дата рождения" required>
            <input
              type="date"
              className="vt-input"
              value={f.birthday}
              max={todayLocal()}
              onChange={(e) => set('birthday', e.target.value)}
            />
          </Field>
          <Field label="Телефон">
            <input
              className="vt-input vt-mono"
              placeholder="+7 ..."
              value={f.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          </Field>
        </div>
      </div>

      {/* ПРИКРЕПЛЕНИЕ И СТРАХОВАНИЕ */}
      <div className="vt-card" style={{ padding: 22, display: 'grid', gap: 16 }}>
        <div className="vt-section-title">Прикрепление и страховка</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Участок">
            <select className="vt-select" value={f.districtId} onChange={(e) => set('districtId', e.target.value)}>
              <option value="">— не указан —</option>
              {districtsQ.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Группа риска">
            <select className="vt-select" value={f.riskGroupId} onChange={(e) => set('riskGroupId', e.target.value)}>
              <option value="">— нет —</option>
              {riskGroupsQ.data?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Переключатель ОМС / прямой договор */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 4,
            padding: 4,
            background: 'var(--vt-bg-warm)',
            borderRadius: 10,
          }}
        >
          <TabBtn
            active={!f.hasDirectContract}
            onClick={() => set('hasDirectContract', false)}
          >
            По ОМС
          </TabBtn>
          <TabBtn
            active={f.hasDirectContract}
            onClick={() => set('hasDirectContract', true)}
          >
            Прямой договор
          </TabBtn>
        </div>

        {f.hasDirectContract ? (
          <Field label="Номер прямого договора">
            <input
              className="vt-input vt-mono"
              value={f.directContractNumber}
              onChange={(e) => set('directContractNumber', e.target.value)}
              placeholder="например, ЛРЦ-2026/0423"
            />
          </Field>
        ) : (
          <>
            <Field label="Страховая компания">
              <select className="vt-select" value={f.insuranceId} onChange={(e) => set('insuranceId', e.target.value)}>
                <option value="">— не указана —</option>
                {insurancesQ.data?.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
              <Field label="Серия полиса">
                <input className="vt-input vt-mono" value={f.policySerial} onChange={(e) => set('policySerial', e.target.value)} />
              </Field>
              <Field label="Номер полиса">
                <input className="vt-input vt-mono" value={f.policyNumber} onChange={(e) => set('policyNumber', e.target.value)} />
              </Field>
            </div>
          </>
        )}

        <label
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', border: '1.5px solid var(--vt-input-border)',
            borderRadius: 10, background: 'var(--vt-input-bg)', cursor: 'pointer',
            fontSize: 13,
          }}
        >
          <input
            type="checkbox"
            checked={f.isDecret}
            onChange={(e) => set('isDecret', e.target.checked)}
          />
          Декретированная группа
        </label>

        {dept === 'KID' && (
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', border: '1.5px solid var(--vt-input-border)',
              borderRadius: 10, background: 'var(--vt-input-bg)', cursor: 'pointer',
              fontSize: 13,
            }}
          >
            <input
              type="checkbox"
              checked={f.isSelfOrganized}
              onChange={(e) => set('isSelfOrganized', e.target.checked)}
            />
            <span>
              Самоорганизованный{' '}
              <span className="vt-hint">(прививается в саду / школе)</span>
            </span>
          </label>
        )}
      </div>

      {error && (
        <div
          className="vt-badge vt-badge-warn"
          style={{ padding: '10px 14px', fontSize: 13, borderRadius: 10 }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Link to={cancelHref} className="vt-btn vt-btn-ghost">
          Отмена
        </Link>
        <button
          type="submit"
          className="vt-btn vt-btn-primary"
          disabled={!canSave || isPending}
        >
          {isPending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label className="vt-label">
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '9px 14px',
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: 500,
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        background: active ? 'var(--vt-surface)' : 'transparent',
        color: active ? 'var(--vt-primary-hover)' : 'var(--vt-muted)',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
        transition: 'all .15s',
      }}
    >
      {children}
    </button>
  )
}
