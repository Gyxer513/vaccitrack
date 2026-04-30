import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { trpc } from '../../lib/trpc'
import { useConfirm, useToast } from '../ui/Dialog'
import { useDepartment } from '../DepartmentProvider'
import { DEPT_LABELS } from '../../lib/dept'

/**
 * Детальная страница каталога прививок: список всех его позиций
 * (VaccineSchedule) с inline-редактором условий применимости.
 *
 * Каждая строка раскрывается в форму с полями: имя/коротк. имя,
 * нозология (parentId — другая позиция этого же каталога без parent),
 * возрастные рамки, интервал между дозами, чекбоксы (epid/epid-contact/
 * catch-up + верхний возраст для catch-up), пол, активна.
 *
 * Список плоский, упорядочен по parent (нозология), потом по коду —
 * как сидер кладёт. Дочерние позиции визуально сдвинуты отступом.
 */

type Sex = 'MALE' | 'FEMALE'

type ScheduleRow = {
  id: string
  name: string
  shortName: string | null
  code: string
  parentId: string | null
  parent: { id: string; name: string } | null
  isActive: boolean
  isEpid: boolean
  isEpidContact: boolean
  isCatchUp: boolean
  catchUpMaxAgeYears: number | null
  appliesToSex: Sex | null
  minAgeYears: number
  minAgeMonths: number
  minAgeDays: number
  maxAgeYears: number
  maxAgeMonths: number
  maxAgeDays: number
  intervalYears: number
  intervalMonths: number
  intervalDays: number
}

type FormState = {
  name: string
  shortName: string
  parentId: string
  isActive: boolean
  isEpid: boolean
  isEpidContact: boolean
  isCatchUp: boolean
  catchUpMaxAgeYears: string
  appliesToSex: '' | Sex
  minAgeYears: string
  minAgeMonths: string
  minAgeDays: string
  maxAgeYears: string
  maxAgeMonths: string
  maxAgeDays: string
  intervalYears: string
  intervalMonths: string
  intervalDays: string
}

const emptyForm = (): FormState => ({
  name: '',
  shortName: '',
  parentId: '',
  isActive: true,
  isEpid: false,
  isEpidContact: false,
  isCatchUp: false,
  catchUpMaxAgeYears: '',
  appliesToSex: '',
  minAgeYears: '0',
  minAgeMonths: '0',
  minAgeDays: '0',
  maxAgeYears: '99',
  maxAgeMonths: '0',
  maxAgeDays: '0',
  intervalYears: '0',
  intervalMonths: '0',
  intervalDays: '0',
})

const fromRow = (s: ScheduleRow): FormState => ({
  name: s.name,
  shortName: s.shortName ?? '',
  parentId: s.parentId ?? '',
  isActive: s.isActive,
  isEpid: s.isEpid,
  isEpidContact: s.isEpidContact,
  isCatchUp: s.isCatchUp,
  catchUpMaxAgeYears:
    s.catchUpMaxAgeYears == null ? '' : String(s.catchUpMaxAgeYears),
  appliesToSex: s.appliesToSex ?? '',
  minAgeYears: String(s.minAgeYears),
  minAgeMonths: String(s.minAgeMonths),
  minAgeDays: String(s.minAgeDays),
  maxAgeYears: String(s.maxAgeYears),
  maxAgeMonths: String(s.maxAgeMonths),
  maxAgeDays: String(s.maxAgeDays),
  intervalYears: String(s.intervalYears),
  intervalMonths: String(s.intervalMonths),
  intervalDays: String(s.intervalDays),
})

const toInt = (v: string): number => {
  const n = parseInt(v, 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}
const toIntOrNull = (v: string): number | null => {
  const t = v.trim()
  if (!t) return null
  const n = parseInt(t, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function formatAgeRange(s: ScheduleRow): string {
  const min = formatAge(s.minAgeYears, s.minAgeMonths, s.minAgeDays)
  const max = formatAge(s.maxAgeYears, s.maxAgeMonths, s.maxAgeDays)
  if (!min && !max) return '—'
  if (!min) return `до ${max}`
  if (!max || max === '99 л') return `от ${min}`
  return `${min} – ${max}`
}

function formatAge(y: number, m: number, d: number): string {
  const parts: string[] = []
  if (y) parts.push(`${y} л`)
  if (m) parts.push(`${m} мес`)
  if (d) parts.push(`${d} дн`)
  return parts.join(' ') || '0'
}

function formatInterval(s: ScheduleRow): string {
  const parts: string[] = []
  if (s.intervalYears) parts.push(`${s.intervalYears} л`)
  if (s.intervalMonths) parts.push(`${s.intervalMonths} мес`)
  if (s.intervalDays) parts.push(`${s.intervalDays} дн`)
  return parts.join(' ') || '—'
}

export function SettingsCatalogDetail() {
  const { catalogId } = useParams<{ catalogId: string }>()
  const { dept } = useDepartment()
  const utils = trpc.useUtils()
  const toast = useToast()
  const confirm = useConfirm()

  const catalogQ = trpc.catalog.getById.useQuery(
    { id: catalogId ?? '' },
    { enabled: !!catalogId },
  )
  const districtsQ = trpc.reference.districts.useQuery()

  const createMut = trpc.schedule.create.useMutation()
  const updateMut = trpc.schedule.update.useMutation()
  const deleteMut = trpc.schedule.delete.useMutation()
  const setActiveMut = trpc.catalog.setActiveForSite.useMutation()

  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState<FormState>(emptyForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(emptyForm())

  const catalog = catalogQ.data
  const schedules = (catalog?.schedules ?? []) as ScheduleRow[]
  const districts = districtsQ.data ?? []
  const currentSiteId = districts[0]?.site?.id ?? null

  const busy =
    createMut.isPending || updateMut.isPending || deleteMut.isPending ||
    setActiveMut.isPending

  // Кандидаты для select «Нозология» — только корневые позиции (без parent),
  // того же каталога, исключая саму редактируемую.
  const parentOptions = useMemo(() => {
    return schedules.filter((s) => !s.parentId)
  }, [schedules])

  const isActiveForSite =
    !!catalog &&
    !!currentSiteId &&
    catalog.activeForSites?.some((site) => site.id === currentSiteId) === true

  const refetchAll = async () => {
    if (catalogId) {
      await utils.catalog.getById.invalidate({ id: catalogId })
    }
    await utils.catalog.list.invalidate()
  }

  const buildPayload = (f: FormState) => ({
    name: f.name.trim(),
    shortName: f.shortName.trim() || null,
    parentId: f.parentId || null,
    isActive: f.isActive,
    isEpid: f.isEpid,
    isEpidContact: f.isEpidContact,
    isCatchUp: f.isCatchUp,
    catchUpMaxAgeYears: f.isCatchUp ? toIntOrNull(f.catchUpMaxAgeYears) : null,
    appliesToSex: f.appliesToSex === '' ? null : (f.appliesToSex as Sex),
    minAgeYears: toInt(f.minAgeYears),
    minAgeMonths: toInt(f.minAgeMonths),
    minAgeDays: toInt(f.minAgeDays),
    maxAgeYears: toInt(f.maxAgeYears),
    maxAgeMonths: toInt(f.maxAgeMonths),
    maxAgeDays: toInt(f.maxAgeDays),
    intervalYears: toInt(f.intervalYears),
    intervalMonths: toInt(f.intervalMonths),
    intervalDays: toInt(f.intervalDays),
  })

  const startAdd = () => {
    setAddForm(emptyForm())
    setAdding(true)
    setEditingId(null)
  }

  const cancelAdd = () => {
    setAdding(false)
    setAddForm(emptyForm())
  }

  const submitAdd = async () => {
    if (!catalogId) return
    if (!addForm.name.trim()) {
      toast.error('Укажите название позиции')
      return
    }
    try {
      await createMut.mutateAsync({
        catalogId,
        ...buildPayload(addForm),
      })
      await refetchAll()
      toast.success('Позиция создана')
      cancelAdd()
    } catch (e: any) {
      toast.error(e?.message ?? 'Ошибка сохранения')
    }
  }

  const startEdit = (s: ScheduleRow) => {
    setEditingId(s.id)
    setEditForm(fromRow(s))
    setAdding(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(emptyForm())
  }

  const submitEdit = async () => {
    if (!editingId) return
    if (!editForm.name.trim()) {
      toast.error('Укажите название позиции')
      return
    }
    try {
      await updateMut.mutateAsync({
        id: editingId,
        data: buildPayload(editForm),
      })
      await refetchAll()
      toast.success('Сохранено')
      cancelEdit()
    } catch (e: any) {
      toast.error(e?.message ?? 'Ошибка сохранения')
    }
  }

  const handleDelete = async (s: ScheduleRow) => {
    const ok = await confirm({
      title: `Удалить позицию «${s.name}»?`,
      message: 'Действие необратимо.',
      confirmLabel: 'Удалить',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync({ id: s.id })
      await refetchAll()
      toast.success('Удалено')
    } catch (e: any) {
      toast.error(e?.message ?? 'Ошибка удаления')
    }
  }

  const handleSetActive = async () => {
    if (!catalogId || !currentSiteId) return
    try {
      await setActiveMut.mutateAsync({ siteId: currentSiteId, catalogId })
      await refetchAll()
      toast.success('Каталог активирован для отделения')
    } catch (e: any) {
      toast.error(e?.message ?? 'Ошибка активации')
    }
  }

  if (!catalogId) {
    return <div className="vt-empty">Не указан id каталога</div>
  }

  if (catalogQ.isLoading) {
    return <div className="vt-loading">Загрузка…</div>
  }

  if (catalogQ.isError || !catalog) {
    return (
      <div className="vt-empty">
        Не удалось загрузить каталог.
        <div className="vt-hint" style={{ marginTop: 8 }}>
          <Link to="/settings/catalogs">← Назад к календарям</Link>
        </div>
      </div>
    )
  }

  return (
    <section>
      <div style={{ marginBottom: 10 }}>
        <Link
          to="/settings/catalogs"
          className="vt-hint"
          style={{ textDecoration: 'none' }}
        >
          ← Назад к календарям
        </Link>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 className="vt-section-title" style={{ margin: 0 }}>
            {catalog.name}
          </h2>
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              flexWrap: 'wrap',
              marginTop: 6,
            }}
          >
            <span className="vt-badge vt-badge-neutral">{catalog.region}</span>
            <span className="vt-badge vt-badge-neutral">
              {DEPT_LABELS[dept]}
            </span>
            {catalog.isActive ? (
              <span className="vt-badge vt-badge-accent">активен</span>
            ) : (
              <span className="vt-badge vt-badge-neutral">архив</span>
            )}
            {catalog.isLegacy && (
              <span className="vt-badge vt-badge-neutral">legacy</span>
            )}
            {catalog.parentCatalog && (
              <span className="vt-hint">
                расширяет: <strong>{catalog.parentCatalog.name}</strong>
              </span>
            )}
            {catalog.approvalRef && (
              <span className="vt-hint">{catalog.approvalRef}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!isActiveForSite && (
            <button
              type="button"
              className="vt-btn vt-btn-ghost vt-btn-sm"
              onClick={handleSetActive}
              disabled={busy || !currentSiteId}
              title={
                currentSiteId
                  ? 'Сделать активным календарём отделения'
                  : 'Нет сайта вашего отделения'
              }
            >
              Сделать активным
            </button>
          )}
          {isActiveForSite && (
            <span className="vt-badge vt-badge-accent">
              Активный для отделения
            </span>
          )}
          {!adding && (
            <button
              type="button"
              className="vt-btn vt-btn-primary vt-btn-sm"
              onClick={startAdd}
              disabled={busy}
            >
              + Добавить позицию
            </button>
          )}
        </div>
      </div>

      <div className="vt-card" style={{ padding: 0, overflow: 'hidden' }}>
        {schedules.length === 0 && !adding ? (
          <div className="vt-empty" style={{ padding: '40px 24px' }}>
            В каталоге «{catalog.name}» ещё нет позиций.
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="vt-btn vt-btn-primary vt-btn-sm"
                onClick={startAdd}
                disabled={busy}
              >
                + Добавить позицию
              </button>
            </div>
          </div>
        ) : (
          <table className="vt-table">
            <thead>
              <tr>
                <th>Название</th>
                <th style={{ width: 160 }}>Возраст</th>
                <th style={{ width: 130 }}>Интервал</th>
                <th style={{ width: 200 }}>Тип</th>
                <th style={{ width: 230, textAlign: 'right' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {adding && (
                <tr>
                  <td colSpan={5} style={{ padding: 0 }}>
                    <div
                      style={{
                        padding: 16,
                        background: 'var(--vt-surface-alt, #f6f7f9)',
                      }}
                    >
                      <PositionForm
                        form={addForm}
                        setForm={setAddForm}
                        parentOptions={parentOptions}
                        excludeId={null}
                        onCancel={cancelAdd}
                        onSubmit={submitAdd}
                        submitLabel={
                          createMut.isPending
                            ? 'Сохраняем…'
                            : 'Сохранить новую позицию'
                        }
                        busy={busy}
                      />
                    </div>
                  </td>
                </tr>
              )}

              {schedules.map((s) => {
                const isChild = !!s.parentId
                if (editingId === s.id) {
                  return (
                    <tr key={s.id}>
                      <td colSpan={5} style={{ padding: 0 }}>
                        <div
                          style={{
                            padding: 16,
                            background: 'var(--vt-surface-alt, #f6f7f9)',
                          }}
                        >
                          <PositionForm
                            form={editForm}
                            setForm={setEditForm}
                            parentOptions={parentOptions}
                            excludeId={s.id}
                            onCancel={cancelEdit}
                            onSubmit={submitEdit}
                            submitLabel={
                              updateMut.isPending ? 'Сохраняем…' : 'Сохранить'
                            }
                            busy={busy}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={s.id}>
                    <td>
                      <div
                        style={{
                          paddingLeft: isChild ? 18 : 0,
                          fontWeight: isChild ? 400 : 600,
                        }}
                      >
                        {s.name}
                        {s.shortName && (
                          <span
                            className="vt-hint"
                            style={{ marginLeft: 8 }}
                          >
                            ({s.shortName})
                          </span>
                        )}
                      </div>
                      {s.parent && (
                        <div className="vt-hint" style={{ marginTop: 2 }}>
                          {s.parent.name}
                        </div>
                      )}
                    </td>
                    <td className="vt-mono">{formatAgeRange(s)}</td>
                    <td className="vt-mono">{formatInterval(s)}</td>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          gap: 4,
                          flexWrap: 'wrap',
                        }}
                      >
                        {s.isEpid && (
                          <span className="vt-badge vt-badge-neutral">
                            эпид
                          </span>
                        )}
                        {s.isEpidContact && (
                          <span className="vt-badge vt-badge-neutral">
                            контакт
                          </span>
                        )}
                        {s.isCatchUp && (
                          <span className="vt-badge vt-badge-neutral">
                            вдогонку
                            {s.catchUpMaxAgeYears
                              ? ` ≤${s.catchUpMaxAgeYears}л`
                              : ''}
                          </span>
                        )}
                        {s.appliesToSex === 'MALE' && (
                          <span className="vt-badge vt-badge-neutral">
                            только М
                          </span>
                        )}
                        {s.appliesToSex === 'FEMALE' && (
                          <span className="vt-badge vt-badge-neutral">
                            только Ж
                          </span>
                        )}
                        {!s.isActive && (
                          <span className="vt-badge vt-badge-neutral">
                            архив
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          gap: 6,
                          justifyContent: 'flex-end',
                        }}
                      >
                        <button
                          type="button"
                          className="vt-btn vt-btn-ghost vt-btn-sm"
                          onClick={() => startEdit(s)}
                          disabled={busy}
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          className="vt-btn vt-btn-ghost vt-btn-sm"
                          onClick={() => handleDelete(s)}
                          disabled={busy}
                          style={{
                            color: 'var(--vt-danger-text)',
                            borderColor: 'var(--vt-danger-border)',
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

/* ————— Inline form для одной позиции ————— */

type PositionFormProps = {
  form: FormState
  setForm: (next: FormState) => void
  parentOptions: ScheduleRow[]
  excludeId: string | null
  onCancel: () => void
  onSubmit: () => void
  submitLabel: string
  busy: boolean
}

function PositionForm({
  form,
  setForm,
  parentOptions,
  excludeId,
  onCancel,
  onSubmit,
  submitLabel,
  busy,
}: PositionFormProps) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm({ ...form, [k]: v })

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Базовые поля */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr',
          gap: 10,
        }}
      >
        <div>
          <label className="vt-hint">Название</label>
          <input
            className="vt-input"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Например: V3 Полиомиелит"
            autoFocus
          />
        </div>
        <div>
          <label className="vt-hint">Краткое имя</label>
          <input
            className="vt-input"
            value={form.shortName}
            onChange={(e) => set('shortName', e.target.value)}
            placeholder="V3"
          />
        </div>
        <div>
          <label className="vt-hint">Нозология (parent)</label>
          <select
            className="vt-input"
            value={form.parentId}
            onChange={(e) => set('parentId', e.target.value)}
          >
            <option value="">— нет (корневая) —</option>
            {parentOptions
              .filter((p) => p.id !== excludeId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Возрастные рамки */}
      <div>
        <div className="vt-hint" style={{ marginBottom: 6 }}>
          Возрастные рамки
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
          }}
        >
          <AgeFieldGroup
            label="Минимум"
            years={form.minAgeYears}
            months={form.minAgeMonths}
            days={form.minAgeDays}
            onYears={(v) => set('minAgeYears', v)}
            onMonths={(v) => set('minAgeMonths', v)}
            onDays={(v) => set('minAgeDays', v)}
          />
          <AgeFieldGroup
            label="Максимум"
            years={form.maxAgeYears}
            months={form.maxAgeMonths}
            days={form.maxAgeDays}
            onYears={(v) => set('maxAgeYears', v)}
            onMonths={(v) => set('maxAgeMonths', v)}
            onDays={(v) => set('maxAgeDays', v)}
          />
        </div>
      </div>

      {/* Интервал */}
      <div>
        <div className="vt-hint" style={{ marginBottom: 6 }}>
          Интервал между дозами
        </div>
        <AgeFieldGroup
          label=""
          years={form.intervalYears}
          months={form.intervalMonths}
          days={form.intervalDays}
          onYears={(v) => set('intervalYears', v)}
          onMonths={(v) => set('intervalMonths', v)}
          onDays={(v) => set('intervalDays', v)}
        />
      </div>

      {/* Условия применимости */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 14,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: 8 }}>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <input
              type="checkbox"
              checked={form.isEpid}
              onChange={(e) => set('isEpid', e.target.checked)}
            />
            <span>Эпидемическая</span>
          </label>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <input
              type="checkbox"
              checked={form.isEpidContact}
              onChange={(e) => set('isEpidContact', e.target.checked)}
            />
            <span>По контакту (из очагов)</span>
          </label>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <input
              type="checkbox"
              checked={form.isCatchUp}
              onChange={(e) => set('isCatchUp', e.target.checked)}
            />
            <span>Вдогонку (catch-up)</span>
          </label>
          {form.isCatchUp && (
            <div style={{ paddingLeft: 24 }}>
              <label className="vt-hint">
                Верхний возраст для catch-up (лет)
              </label>
              <input
                className="vt-input"
                type="number"
                min={0}
                value={form.catchUpMaxAgeYears}
                onChange={(e) =>
                  set('catchUpMaxAgeYears', e.target.value)
                }
                placeholder="напр. 17"
                style={{ maxWidth: 120 }}
              />
            </div>
          )}
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
            />
            <span>Активна</span>
          </label>
        </div>

        <div>
          <label className="vt-hint">Применимый пол</label>
          <select
            className="vt-input"
            value={form.appliesToSex}
            onChange={(e) =>
              set('appliesToSex', e.target.value as '' | Sex)
            }
            style={{ maxWidth: 220 }}
          >
            <option value="">— любой —</option>
            <option value="MALE">Мужской</option>
            <option value="FEMALE">Женский</option>
          </select>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
          marginTop: 4,
        }}
      >
        <button
          type="button"
          className="vt-btn vt-btn-ghost vt-btn-sm"
          onClick={onCancel}
          disabled={busy}
        >
          Отмена
        </button>
        <button
          type="button"
          className="vt-btn vt-btn-primary vt-btn-sm"
          onClick={onSubmit}
          disabled={busy || !form.name.trim()}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}

type AgeFieldGroupProps = {
  label: string
  years: string
  months: string
  days: string
  onYears: (v: string) => void
  onMonths: (v: string) => void
  onDays: (v: string) => void
}

function AgeFieldGroup({
  label,
  years,
  months,
  days,
  onYears,
  onMonths,
  onDays,
}: AgeFieldGroupProps) {
  return (
    <div>
      {label && (
        <div className="vt-hint" style={{ marginBottom: 4 }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="vt-input"
          type="number"
          min={0}
          value={years}
          onChange={(e) => onYears(e.target.value)}
          placeholder="лет"
          style={{ width: 70 }}
        />
        <input
          className="vt-input"
          type="number"
          min={0}
          max={11}
          value={months}
          onChange={(e) => onMonths(e.target.value)}
          placeholder="мес"
          style={{ width: 70 }}
        />
        <input
          className="vt-input"
          type="number"
          min={0}
          max={31}
          value={days}
          onChange={(e) => onDays(e.target.value)}
          placeholder="дн"
          style={{ width: 70 }}
        />
      </div>
    </div>
  )
}
