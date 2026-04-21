import { useEffect, useMemo, useState } from 'react'
import { trpc } from '../lib/trpc'

type VaccineListItem = {
  id: string
  name: string
  tradeName: string | null
  producer: string | null
  country: string | null
  dosesMl: number | null
  scheduleLinks: {
    vaccineScheduleId: string
    vaccineSchedule: {
      id: string; name: string; code: string;
      minAgeYears: number; minAgeMonths: number; minAgeDays: number;
      maxAgeYears: number; maxAgeMonths: number; maxAgeDays: number;
      parent: { id: string; name: string } | null
    }
  }[]
}

type VaccineFields = {
  name: string
  producer: string
  country: string
  dosesMl: string
}

type ScheduleAge = {
  minAgeYears: number
  minAgeMonths: number
  minAgeDays: number
  maxAgeYears: number
  maxAgeMonths: number
  maxAgeDays: number
}

/* ————— Утилиты ————— */

function diseaseOf(s: { name: string; parent: { name: string } | null }): string {
  return s.parent?.name ?? s.name
}

function uniqueDiseases(vaccine: VaccineListItem | undefined): string[] {
  if (!vaccine) return []
  const set = new Set<string>()
  for (const l of vaccine.scheduleLinks) {
    set.add(diseaseOf(l.vaccineSchedule))
  }
  return Array.from(set)
}

export function VaccinesPage() {
  const vaccinesQ = trpc.vaccine.list.useQuery()
  const schedulesQ = trpc.schedule.list.useQuery()
  const utils = trpc.useUtils()

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)

  // Локальное состояние формы редактируемой вакцины
  const [fields, setFields] = useState<VaccineFields>({ name: '', producer: '', country: '', dosesMl: '' })
  const [linkedIds, setLinkedIds] = useState<string[]>([])
  const [scheduleAges, setScheduleAges] = useState<Record<string, ScheduleAge>>({})
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const vaccines = vaccinesQ.data ?? []
  const filteredVaccines = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return vaccines
    return vaccines.filter((v) =>
      v.name.toLowerCase().includes(needle) ||
      (v.producer ?? '').toLowerCase().includes(needle) ||
      (v.tradeName ?? '').toLowerCase().includes(needle),
    )
  }, [vaccines, search])

  const selected = vaccines.find((v) => v.id === selectedId)

  // При выборе — подтягиваем данные в локальное состояние
  useEffect(() => {
    if (!selected) return
    setFields({
      name: selected.name,
      producer: selected.producer ?? '',
      country: selected.country ?? '',
      dosesMl: selected.dosesMl != null ? String(selected.dosesMl) : '',
    })
    setLinkedIds(selected.scheduleLinks.map((l) => l.vaccineScheduleId))
    const ages: Record<string, ScheduleAge> = {}
    for (const l of selected.scheduleLinks) {
      const s = l.vaccineSchedule
      ages[s.id] = {
        minAgeYears: s.minAgeYears, minAgeMonths: s.minAgeMonths, minAgeDays: s.minAgeDays,
        maxAgeYears: s.maxAgeYears, maxAgeMonths: s.maxAgeMonths, maxAgeDays: s.maxAgeDays,
      }
    }
    setScheduleAges(ages)
    setDirty(false)
    setError(null)
    setEditMode(false)
  }, [selected?.id])

  // При выборе первой в списке, если ничего не выбрано
  useEffect(() => {
    if (!selectedId && filteredVaccines[0]) setSelectedId(filteredVaccines[0].id)
  }, [filteredVaccines, selectedId])

  const updateVaccine = trpc.vaccine.update.useMutation()
  const createVaccine = trpc.vaccine.create.useMutation()
  const deleteVaccine = trpc.vaccine.delete.useMutation()
  const setSchedules = trpc.vaccine.setSchedules.useMutation()
  const updateSchedule = trpc.schedule.update.useMutation()

  const busy = updateVaccine.isPending || createVaccine.isPending || deleteVaccine.isPending ||
    setSchedules.isPending || updateSchedule.isPending

  const setField = <K extends keyof VaccineFields>(k: K, v: VaccineFields[K]) => {
    setFields((p) => ({ ...p, [k]: v }))
    setDirty(true)
  }

  const setAge = (scheduleId: string, key: keyof ScheduleAge, value: number) => {
    setScheduleAges((p) => ({
      ...p,
      [scheduleId]: { ...p[scheduleId], [key]: value },
    }))
    setDirty(true)
  }

  const toggleLink = (scheduleId: string) => {
    setLinkedIds((p) =>
      p.includes(scheduleId) ? p.filter((id) => id !== scheduleId) : [...p, scheduleId],
    )
    // Инициализируем возраст по умолчанию из schedule (если только что добавили)
    if (!scheduleAges[scheduleId]) {
      const s = schedulesQ.data?.find((x) => x.id === scheduleId)
      if (s) {
        setScheduleAges((p) => ({
          ...p,
          [scheduleId]: {
            minAgeYears: s.minAgeYears, minAgeMonths: s.minAgeMonths, minAgeDays: s.minAgeDays,
            maxAgeYears: s.maxAgeYears, maxAgeMonths: s.maxAgeMonths, maxAgeDays: s.maxAgeDays,
          },
        }))
      }
    }
    setDirty(true)
  }

  const handleSave = async () => {
    if (!selected) return
    setError(null)
    try {
      // 1. Обновляем поля вакцины
      await updateVaccine.mutateAsync({
        id: selected.id,
        data: {
          name: fields.name.trim(),
          producer: fields.producer.trim() || null,
          country: fields.country.trim() || null,
          dosesMl: fields.dosesMl.trim() ? Number(fields.dosesMl) : null,
        },
      })
      // 2. Перезаписываем связи
      await setSchedules.mutateAsync({
        vaccineId: selected.id,
        scheduleIds: linkedIds,
      })
      // 3. Обновляем возрастные поля всех связанных schedule
      for (const sid of linkedIds) {
        const age = scheduleAges[sid]
        if (age) {
          await updateSchedule.mutateAsync({ id: sid, data: age })
        }
      }
      await utils.vaccine.list.invalidate()
      await utils.schedule.list.invalidate()
      setDirty(false)
      setEditMode(false)
    } catch (e: any) {
      setError(e.message ?? 'Ошибка сохранения')
    }
  }

  const handleCancelEdit = () => {
    if (dirty && !confirm('Отбросить несохранённые изменения?')) return
    // Восстановить поля из selected
    if (selected) {
      setFields({
        name: selected.name,
        producer: selected.producer ?? '',
        country: selected.country ?? '',
        dosesMl: selected.dosesMl != null ? String(selected.dosesMl) : '',
      })
      setLinkedIds(selected.scheduleLinks.map((l) => l.vaccineScheduleId))
      const ages: Record<string, ScheduleAge> = {}
      for (const l of selected.scheduleLinks) {
        const s = l.vaccineSchedule
        ages[s.id] = {
          minAgeYears: s.minAgeYears, minAgeMonths: s.minAgeMonths, minAgeDays: s.minAgeDays,
          maxAgeYears: s.maxAgeYears, maxAgeMonths: s.maxAgeMonths, maxAgeDays: s.maxAgeDays,
        }
      }
      setScheduleAges(ages)
    }
    setDirty(false)
    setEditMode(false)
    setError(null)
  }

  const handleCreate = async () => {
    setError(null)
    try {
      const created = await createVaccine.mutateAsync({ name: 'Новая вакцина' })
      await utils.vaccine.list.invalidate()
      setSelectedId(created.id)
      setEditMode(true) // сразу в режим редактирования
    } catch (e: any) {
      setError(e.message ?? 'Ошибка создания')
    }
  }

  const handleDelete = async () => {
    if (!selected) return
    if (!confirm(`Удалить вакцину «${selected.name}»? Связи и ссылки из записей о прививках будут разорваны.`)) return
    setError(null)
    try {
      await deleteVaccine.mutateAsync({ id: selected.id })
      await utils.vaccine.list.invalidate()
      setSelectedId(null)
    } catch (e: any) {
      setError(e.message ?? 'Ошибка удаления')
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 22, alignItems: 'start' }}>
      {/* ЛЕВАЯ КОЛОНКА — СПИСОК */}
      <aside style={{ position: 'sticky', top: 20 }}>
        <div className="vt-page-head" style={{ marginBottom: 14 }}>
          <h1 className="vt-page-title" style={{ fontSize: 20 }}>Вакцины</h1>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'stretch' }}>
          <input
            className="vt-input"
            placeholder="Поиск…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="vt-btn vt-btn-primary"
            onClick={handleCreate}
            disabled={busy}
            title="Создать новую вакцину"
            style={{ width: 40, padding: 0, flexShrink: 0 }}
          >
            +
          </button>
        </div>

        <div
          className="vt-card"
          style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto', padding: 2 }}
        >
          {filteredVaccines.length === 0 ? (
            <div className="vt-empty" style={{ padding: 20 }}>Ничего не найдено</div>
          ) : filteredVaccines.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                if (dirty && !confirm('Есть несохранённые изменения. Отбросить?')) return
                setSelectedId(v.id)
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                background: v.id === selectedId ? 'var(--vt-accent-bg)' : 'transparent',
                border: 'none',
                borderLeft: v.id === selectedId ? '3px solid var(--vt-primary)' : '3px solid transparent',
                padding: '10px 14px',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                color: 'var(--vt-text)',
                display: 'block',
              }}
            >
              <div style={{ fontWeight: v.id === selectedId ? 500 : 400 }}>{v.name}</div>
              {v.producer && <div className="vt-hint" style={{ fontSize: 11 }}>{v.producer}</div>}
            </button>
          ))}
        </div>
      </aside>

      {/* ПРАВАЯ КОЛОНКА — ДЕТАЛИ */}
      <main style={{ display: 'grid', gap: 18 }}>
        {!selected ? (
          <div className="vt-empty">Выбери вакцину слева или создай новую.</div>
        ) : (
          <>
            {/* Характеристика */}
            <div className="vt-card" style={{ padding: 22, display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="vt-section-title">Характеристика</div>
                {!editMode && (
                  <button
                    type="button"
                    className="vt-btn vt-btn-ghost vt-btn-sm"
                    onClick={() => setEditMode(true)}
                    title="Включить редактирование"
                  >
                    ✎ Редактировать
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <LabeledField label="Наименование" required>
                  <input
                    className="vt-input"
                    value={fields.name}
                    onChange={(e) => setField('name', e.target.value)}
                    readOnly={!editMode}
                  />
                </LabeledField>
                <LabeledField label="Доза, мл">
                  <input
                    className="vt-input vt-mono"
                    value={fields.dosesMl}
                    onChange={(e) => setField('dosesMl', e.target.value)}
                    placeholder="0.5"
                    readOnly={!editMode}
                  />
                </LabeledField>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <LabeledField label="Изготовитель">
                  <input
                    className="vt-input"
                    value={fields.producer}
                    onChange={(e) => setField('producer', e.target.value)}
                    readOnly={!editMode}
                  />
                </LabeledField>
                <LabeledField label="Страна">
                  <input
                    className="vt-input"
                    value={fields.country}
                    onChange={(e) => setField('country', e.target.value)}
                    readOnly={!editMode}
                  />
                </LabeledField>
              </div>

              <LabeledField label="Нозология (вычисляется из назначений)">
                <div
                  className="vt-input"
                  style={{
                    minHeight: 38, cursor: 'default', background: 'var(--vt-surface-tint)',
                    display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
                  }}
                >
                  {uniqueDiseases(selected).length === 0 ? (
                    <span className="vt-hint">нет связанных процедур</span>
                  ) : (
                    uniqueDiseases(selected).map((d) => (
                      <span key={d} className="vt-badge vt-badge-accent">{d}</span>
                    ))
                  )}
                </div>
              </LabeledField>
            </div>

            {/* Назначение */}
            <div className="vt-card" style={{ padding: 0 }}>
              <div style={{
                padding: '14px 22px',
                borderBottom: '1px solid var(--vt-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div className="vt-section-title" style={{ margin: 0 }}>Назначение</div>
                <span className="vt-hint">
                  {linkedIds.length} {linkedIds.length === 1 ? 'процедура' : 'процедур'}
                </span>
              </div>

              <AssignmentsTable
                allSchedules={schedulesQ.data ?? []}
                linkedIds={linkedIds}
                ages={scheduleAges}
                readOnly={!editMode}
                onToggle={toggleLink}
                onAgeChange={setAge}
                onCreated={(s) => {
                  // Добавляем созданную процедуру как связанную + подтянем её возраст
                  setScheduleAges((p) => ({
                    ...p,
                    [s.id]: {
                      minAgeYears: s.minAgeYears, minAgeMonths: s.minAgeMonths, minAgeDays: s.minAgeDays,
                      maxAgeYears: s.maxAgeYears, maxAgeMonths: s.maxAgeMonths, maxAgeDays: s.maxAgeDays,
                    },
                  }))
                  setLinkedIds((p) => [...p, s.id])
                  setDirty(true)
                }}
              />
            </div>

            {error && (
              <div className="vt-badge vt-badge-warn" style={{ padding: '10px 14px', fontSize: 13, borderRadius: 10 }}>
                {error}
              </div>
            )}

            {editMode && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                <button
                  className="vt-btn vt-btn-ghost"
                  onClick={handleDelete}
                  disabled={busy}
                  style={{ color: 'var(--vt-danger-text)', borderColor: 'var(--vt-danger-border)' }}
                >
                  Удалить вакцину
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="vt-btn vt-btn-ghost"
                    onClick={handleCancelEdit}
                    disabled={busy}
                  >
                    Отмена
                  </button>
                  <button
                    className="vt-btn vt-btn-primary"
                    onClick={handleSave}
                    disabled={!dirty || busy || !fields.name.trim()}
                  >
                    {busy ? 'Сохраняем…' : 'Сохранить'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

/* ————— Таблица назначений ————— */

type Schedule = { id: string; name: string; code: string; parent: { id: string; name: string } | null }

type CreatedSchedule = Schedule & ScheduleAge

function AssignmentsTable({
  allSchedules,
  linkedIds,
  ages,
  readOnly,
  onToggle,
  onAgeChange,
  onCreated,
}: {
  allSchedules: Schedule[]
  linkedIds: string[]
  ages: Record<string, ScheduleAge>
  readOnly: boolean
  onToggle: (id: string) => void
  onAgeChange: (id: string, key: keyof ScheduleAge, value: number) => void
  onCreated: (s: CreatedSchedule) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [q, setQ] = useState('')

  const linked = allSchedules.filter((s) => linkedIds.includes(s.id))
  const unlinked = allSchedules
    // Корни (сами нозологии, без parent) — это категории, не процедуры. Не показываем.
    .filter((s) => s.parent)
    .filter((s) => !linkedIds.includes(s.id))
    .filter((s) => {
      const needle = q.trim().toLowerCase()
      if (!needle) return true
      return (
        s.name.toLowerCase().includes(needle) ||
        (s.parent?.name ?? '').toLowerCase().includes(needle)
      )
    })

  return (
    <>
      {linked.length === 0 ? (
        <div className="vt-empty" style={{ padding: 30 }}>
          Процедуры ещё не добавлены.
          <br />
          <button
            className="vt-btn vt-btn-ghost vt-btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => setShowAll(true)}
          >
            + Добавить процедуру
          </button>
        </div>
      ) : (
        <table className="vt-table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ width: 200 }}>Нозология</th>
              <th>Наименование процедуры</th>
              <th colSpan={3} style={{ textAlign: 'center', borderLeft: '1px solid var(--vt-border)' }}>
                Минимальный возраст
              </th>
              <th colSpan={3} style={{ textAlign: 'center', borderLeft: '1px solid var(--vt-border)' }}>
                Максимальный возраст
              </th>
              <th style={{ width: 60 }}></th>
            </tr>
            <tr>
              <th></th>
              <th></th>
              <SubTh>Год</SubTh>
              <SubTh>Мес</SubTh>
              <SubTh>Дн</SubTh>
              <SubTh borderLeft>Год</SubTh>
              <SubTh>Мес</SubTh>
              <SubTh>Дн</SubTh>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {linked.map((s) => {
              const a = ages[s.id] ?? zeroAge()
              return (
                <tr key={s.id}>
                  <td className="vt-muted">{s.parent?.name ?? '—'}</td>
                  <td>{s.name}</td>
                  <AgeCell value={a.minAgeYears} onChange={(v) => onAgeChange(s.id, 'minAgeYears', v)} readOnly={readOnly} />
                  <AgeCell value={a.minAgeMonths} max={11} onChange={(v) => onAgeChange(s.id, 'minAgeMonths', v)} readOnly={readOnly} />
                  <AgeCell value={a.minAgeDays} max={31} onChange={(v) => onAgeChange(s.id, 'minAgeDays', v)} readOnly={readOnly} />
                  <AgeCell value={a.maxAgeYears} onChange={(v) => onAgeChange(s.id, 'maxAgeYears', v)} borderLeft readOnly={readOnly} />
                  <AgeCell value={a.maxAgeMonths} max={11} onChange={(v) => onAgeChange(s.id, 'maxAgeMonths', v)} readOnly={readOnly} />
                  <AgeCell value={a.maxAgeDays} max={31} onChange={(v) => onAgeChange(s.id, 'maxAgeDays', v)} readOnly={readOnly} />
                  <td style={{ textAlign: 'center' }}>
                    {!readOnly && (
                      <button
                        type="button"
                        className="vt-btn vt-btn-icon"
                        onClick={() => onToggle(s.id)}
                        title="Удалить из назначения"
                        style={{ color: 'var(--vt-danger-text)' }}
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Добавить процедуру — только в режиме редактирования */}
      {!readOnly && (
      <div style={{ padding: '12px 22px', borderTop: '1px solid var(--vt-border)' }}>
        {!showAll && !showNew ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="vt-btn vt-btn-ghost vt-btn-sm"
              onClick={() => setShowAll(true)}
            >
              + Добавить процедуру
            </button>
            <button
              type="button"
              className="vt-btn vt-btn-ghost vt-btn-sm"
              onClick={() => setShowNew(true)}
            >
              + Создать новую процедуру
            </button>
          </div>
        ) : showAll ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <input
              className="vt-input"
              placeholder="Поиск по названию или нозологии…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
            <div style={{
              maxHeight: 200, overflowY: 'auto',
              border: '1px solid var(--vt-border)', borderRadius: 8,
              background: 'var(--vt-surface)',
            }}>
              {unlinked.length === 0 ? (
                <div className="vt-empty" style={{ padding: 16, fontSize: 12 }}>Ничего не найдено</div>
              ) : unlinked.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onToggle(s.id); setQ('') }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 12px', background: 'transparent',
                    border: 'none', borderBottom: '1px solid var(--vt-border)',
                    fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
                    color: 'var(--vt-text)',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{s.parent?.name ?? '—'}</span>
                  <span className="vt-hint"> · {s.name}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="vt-btn vt-btn-ghost vt-btn-sm"
                onClick={() => { setShowAll(false); setQ('') }}
              >
                Закрыть
              </button>
            </div>
          </div>
        ) : (
          <NewScheduleForm
            allSchedules={allSchedules}
            onCancel={() => setShowNew(false)}
            onCreated={(s) => { setShowNew(false); onCreated(s) }}
          />
        )}
      </div>
      )}
    </>
  )
}

/* ————— Форма создания новой процедуры ————— */

function NewScheduleForm({
  allSchedules,
  onCancel,
  onCreated,
}: {
  allSchedules: Schedule[]
  onCancel: () => void
  onCreated: (s: CreatedSchedule) => void
}) {
  // Все корневые записи = нозологии (parentId = null)
  const roots = useMemo(
    () => allSchedules.filter((s) => !s.parent).sort((a, b) => a.name.localeCompare(b.name)),
    [allSchedules],
  )

  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [parentId, setParentId] = useState<string>(roots[0]?.id ?? '')
  const [newDiseaseName, setNewDiseaseName] = useState('')
  const [name, setName] = useState('')
  const [minY, setMinY] = useState(0)
  const [minM, setMinM] = useState(0)
  const [minD, setMinD] = useState(0)
  const [maxY, setMaxY] = useState(99)
  const [maxM, setMaxM] = useState(0)
  const [maxD, setMaxD] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const createSchedule = trpc.schedule.create.useMutation()
  const utils = trpc.useUtils()

  const canCreate = !!name.trim() &&
    (mode === 'existing' ? !!parentId : !!newDiseaseName.trim())

  const handleCreate = async () => {
    setError(null)
    try {
      let finalParentId = mode === 'existing' ? parentId : null
      // Если создаём новую нозологию — сначала root-запись
      if (mode === 'new') {
        const rootCreated = await createSchedule.mutateAsync({
          name: newDiseaseName.trim(),
          parentId: null,
        })
        finalParentId = rootCreated.id
      }
      // Теперь создаём саму процедуру-этап
      const created = await createSchedule.mutateAsync({
        name: name.trim(),
        parentId: finalParentId,
        minAgeYears: minY, minAgeMonths: minM, minAgeDays: minD,
        maxAgeYears: maxY, maxAgeMonths: maxM, maxAgeDays: maxD,
      })
      await utils.schedule.list.invalidate()
      onCreated({
        id: created.id,
        name: created.name,
        code: created.code,
        parent: finalParentId ? { id: finalParentId, name: mode === 'new' ? newDiseaseName.trim() : roots.find((r) => r.id === finalParentId)?.name ?? '' } : null,
        minAgeYears: minY, minAgeMonths: minM, minAgeDays: minD,
        maxAgeYears: maxY, maxAgeMonths: maxM, maxAgeDays: maxD,
      })
    } catch (e: any) {
      setError(e.message ?? 'Не удалось создать')
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--vt-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Новая процедура
      </div>

      {/* Переключатель нозологии */}
      <div
        style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 4,
          background: 'var(--vt-bg-warm)', borderRadius: 10,
        }}
      >
        <TabBtn active={mode === 'existing'} onClick={() => setMode('existing')}>Выбрать нозологию</TabBtn>
        <TabBtn active={mode === 'new'} onClick={() => setMode('new')}>Новая нозология</TabBtn>
      </div>

      {mode === 'existing' ? (
        <LabeledField label="Нозология">
          <select
            className="vt-select"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            {roots.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </LabeledField>
      ) : (
        <LabeledField label="Название нозологии">
          <input
            className="vt-input"
            value={newDiseaseName}
            onChange={(e) => setNewDiseaseName(e.target.value)}
            placeholder="например, Менингококковая инфекция"
            autoFocus
          />
        </LabeledField>
      )}

      <LabeledField label="Название этапа" required>
        <input
          className="vt-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Первая вакцинация / Ревакцинация / …"
        />
      </LabeledField>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <LabeledField label="Минимальный возраст (Год / Мес / Дн)">
          <div style={{ display: 'flex', gap: 6 }}>
            <TinyNumber value={minY} onChange={setMinY} />
            <TinyNumber value={minM} max={11} onChange={setMinM} />
            <TinyNumber value={minD} max={31} onChange={setMinD} />
          </div>
        </LabeledField>
        <LabeledField label="Максимальный возраст (Год / Мес / Дн)">
          <div style={{ display: 'flex', gap: 6 }}>
            <TinyNumber value={maxY} onChange={setMaxY} />
            <TinyNumber value={maxM} max={11} onChange={setMaxM} />
            <TinyNumber value={maxD} max={31} onChange={setMaxD} />
          </div>
        </LabeledField>
      </div>

      {error && (
        <div className="vt-badge vt-badge-warn" style={{ padding: '8px 12px', fontSize: 12, borderRadius: 8 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="vt-btn vt-btn-ghost vt-btn-sm" onClick={onCancel} disabled={createSchedule.isPending}>
          Отмена
        </button>
        <button
          type="button"
          className="vt-btn vt-btn-primary vt-btn-sm"
          onClick={handleCreate}
          disabled={!canCreate || createSchedule.isPending}
        >
          {createSchedule.isPending ? 'Создаём…' : 'Создать и связать'}
        </button>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 12px', fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
        border: 'none', borderRadius: 7, cursor: 'pointer',
        background: active ? 'var(--vt-surface)' : 'transparent',
        color: active ? 'var(--vt-primary-hover)' : 'var(--vt-muted)',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
      }}
    >
      {children}
    </button>
  )
}

function TinyNumber({ value, max, onChange }: { value: number; max?: number; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      value={value}
      onChange={(e) => onChange(Math.max(0, Math.min(max ?? 99, Number(e.target.value) || 0)))}
      style={{
        width: 54, padding: '6px 8px', fontSize: 12,
        fontFamily: 'var(--vt-font-mono)',
        border: '1px solid var(--vt-input-border)',
        borderRadius: 6, background: 'var(--vt-surface)', color: 'var(--vt-text)',
        textAlign: 'center',
      }}
    />
  )
}

/* ————— вспомогательные ————— */

function LabeledField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
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

function SubTh({ children, borderLeft }: { children: React.ReactNode; borderLeft?: boolean }) {
  return (
    <th
      style={{
        fontSize: 10, textAlign: 'center', padding: '8px 6px',
        borderLeft: borderLeft ? '1px solid var(--vt-border)' : undefined,
      }}
    >
      {children}
    </th>
  )
}

function AgeCell({
  value, onChange, max, borderLeft, readOnly,
}: { value: number; onChange: (n: number) => void; max?: number; borderLeft?: boolean; readOnly?: boolean }) {
  return (
    <td
      style={{
        padding: 4,
        borderLeft: borderLeft ? '1px solid var(--vt-border)' : undefined,
        textAlign: 'center',
      }}
    >
      {readOnly ? (
        <span className="vt-mono" style={{ fontSize: 12 }}>{value}</span>
      ) : (
        <input
          type="number"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.min(max ?? 99, Number(e.target.value) || 0)))}
          style={{
            width: 48, padding: '4px 6px', fontSize: 12,
            fontFamily: 'var(--vt-font-mono)',
            border: '1px solid var(--vt-input-border)',
            borderRadius: 6, background: 'var(--vt-surface)', color: 'var(--vt-text)',
            textAlign: 'center',
          }}
        />
      )}
    </td>
  )
}

function zeroAge(): ScheduleAge {
  return { minAgeYears: 0, minAgeMonths: 0, minAgeDays: 0, maxAgeYears: 99, maxAgeMonths: 0, maxAgeDays: 0 }
}
