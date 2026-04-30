import { useState } from 'react'
import { trpc } from '../../lib/trpc'
import { useConfirm, useToast } from '../ui/Dialog'
import { useDepartment } from '../DepartmentProvider'
import { DEPT_LABELS } from '../../lib/dept'

/**
 * Раздел «Участки» страницы настроек.
 * Логика идентична исходной DistrictsSection из SettingsPage —
 * вынесено в отдельный файл при переходе settings на sidebar-меню.
 */
export function SettingsDistricts() {
  const { dept } = useDepartment()
  const districtsQ = trpc.reference.districts.useQuery()
  const utils = trpc.useUtils()
  const toast = useToast()
  const confirm = useConfirm()

  const createMut = trpc.reference.districtCreate.useMutation()
  const updateMut = trpc.reference.districtUpdate.useMutation()
  const deleteMut = trpc.reference.districtDelete.useMutation()

  // Локальные состояния: отдельная inline-форма «добавить» и режим редактирования строки.
  const [adding, setAdding] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')

  const busy =
    createMut.isPending || updateMut.isPending || deleteMut.isPending

  const districts = districtsQ.data ?? []

  const startAdd = () => {
    setAdding(true)
    setNewCode('')
    setNewName('')
    setEditingId(null)
  }

  const cancelAdd = () => {
    setAdding(false)
    setNewCode('')
    setNewName('')
  }

  const submitAdd = async () => {
    const code = newCode.trim()
    const name = newName.trim()
    if (!code || !name) return
    try {
      await createMut.mutateAsync({ code, name })
      await utils.reference.districts.invalidate()
      toast.success('Сохранено')
      cancelAdd()
    } catch (e: any) {
      toast.error(e?.message ?? 'Ошибка сохранения')
    }
  }

  const startEdit = (d: { id: string; code: string; name: string }) => {
    setEditingId(d.id)
    setEditCode(d.code)
    setEditName(d.name)
    setAdding(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditCode('')
    setEditName('')
  }

  const submitEdit = async () => {
    if (!editingId) return
    const code = editCode.trim()
    const name = editName.trim()
    if (!code || !name) return
    try {
      await updateMut.mutateAsync({
        id: editingId,
        data: { code, name },
      })
      await utils.reference.districts.invalidate()
      toast.success('Сохранено')
      cancelEdit()
    } catch (e: any) {
      toast.error(e?.message ?? 'Ошибка сохранения')
    }
  }

  const handleDelete = async (d: {
    id: string
    code: string
    name: string
    _count: { patients: number; doctors: number }
  }) => {
    const hasPatients = d._count.patients > 0
    const hasDoctors = d._count.doctors > 0
    if (hasPatients || hasDoctors) {
      // Серверная проверка тоже сработает, но даём понятный фидбек на клиенте.
      const reason = hasPatients
        ? `На участке ${d._count.patients} ${pluralPatients(d._count.patients)}.`
        : `К участку привязаны врачи (${d._count.doctors}).`
      toast.error(`Нельзя удалить участок «${d.name}». ${reason}`)
      return
    }
    const ok = await confirm({
      title: `Удалить участок «${d.name}»?`,
      message: `Код: ${d.code}. Действие необратимо.`,
      confirmLabel: 'Удалить',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync({ id: d.id })
      await utils.reference.districts.invalidate()
      toast.success('Удалено')
    } catch (e: any) {
      toast.error(e?.message ?? 'Ошибка удаления')
    }
  }

  return (
    <section>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div className="vt-section-title" style={{ margin: 0 }}>
          Участки · {DEPT_LABELS[dept]}
        </div>
        {!adding && (
          <button
            type="button"
            className="vt-btn vt-btn-primary vt-btn-sm"
            onClick={startAdd}
            disabled={busy}
          >
            + Добавить участок
          </button>
        )}
      </div>

      <div className="vt-card" style={{ padding: 0 }}>
        {districtsQ.isLoading ? (
          <div className="vt-loading">Загрузка…</div>
        ) : districts.length === 0 && !adding ? (
          <div className="vt-empty">Участки ещё не заведены.</div>
        ) : (
          <table className="vt-table">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Код</th>
                <th>Название</th>
                <th style={{ width: 120, textAlign: 'right' }}>Пациентов</th>
                <th style={{ width: 220, textAlign: 'right' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {adding && (
                <tr>
                  <td>
                    <input
                      className="vt-input"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      placeholder="01"
                      autoFocus
                    />
                  </td>
                  <td>
                    <input
                      className="vt-input"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Название участка"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitAdd()
                        if (e.key === 'Escape') cancelAdd()
                      }}
                    />
                  </td>
                  <td className="vt-muted" style={{ textAlign: 'right' }}>—</td>
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
                        onClick={cancelAdd}
                        disabled={busy}
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        className="vt-btn vt-btn-primary vt-btn-sm"
                        onClick={submitAdd}
                        disabled={
                          busy || !newCode.trim() || !newName.trim()
                        }
                      >
                        {createMut.isPending ? 'Сохраняем…' : 'Сохранить'}
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {districts.map((d) =>
                editingId === d.id ? (
                  <tr key={d.id}>
                    <td>
                      <input
                        className="vt-input"
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                        autoFocus
                      />
                    </td>
                    <td>
                      <input
                        className="vt-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitEdit()
                          if (e.key === 'Escape') cancelEdit()
                        }}
                      />
                    </td>
                    <td className="vt-muted" style={{ textAlign: 'right' }}>
                      {d._count.patients}
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
                          onClick={cancelEdit}
                          disabled={busy}
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          className="vt-btn vt-btn-primary vt-btn-sm"
                          onClick={submitEdit}
                          disabled={
                            busy || !editCode.trim() || !editName.trim()
                          }
                        >
                          {updateMut.isPending ? 'Сохраняем…' : 'Сохранить'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={d.id}>
                    <td>
                      <span className="vt-badge vt-badge-neutral">{d.code}</span>
                    </td>
                    <td>{d.name}</td>
                    <td className="vt-muted" style={{ textAlign: 'right' }}>
                      {d._count.patients}
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
                          onClick={() => startEdit(d)}
                          disabled={busy}
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          className="vt-btn vt-btn-ghost vt-btn-sm"
                          onClick={() => handleDelete(d)}
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
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

function pluralPatients(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'пациент'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'пациента'
  return 'пациентов'
}
