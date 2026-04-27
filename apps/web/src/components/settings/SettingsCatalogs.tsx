import { useState } from 'react'
import { Link } from 'react-router-dom'
import { trpc } from '../../lib/trpc'
import { useConfirm, useToast } from '../ui/Dialog'
import { useDepartment } from '../DepartmentProvider'
import { DEPT_LABELS } from '../../lib/dept'

/**
 * Раздел «Календари прививок» страницы настроек.
 * Логика идентична исходной CatalogsSection из SettingsPage —
 * вынесено в отдельный файл при переходе settings на sidebar-меню.
 */
export function SettingsCatalogs() {
  const { dept } = useDepartment()
  const catalogsQ = trpc.catalog.list.useQuery()
  // siteId резолвим через первый district текущего dept'а — у него есть site.
  // На MVP в каждой паре (org, dept) ровно один site, так что districts[0]
  // достаточно. Если нет ни одного district — кнопка «Сделать активным»
  // disabled с tooltip.
  const districtsQ = trpc.reference.districts.useQuery()
  const utils = trpc.useUtils()
  const toast = useToast()
  const confirm = useConfirm()

  const createMut = trpc.catalog.create.useMutation()
  const updateMut = trpc.catalog.update.useMutation()
  const deleteMut = trpc.catalog.delete.useMutation()
  const setActiveMut = trpc.catalog.setActiveForSite.useMutation()

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRegion, setNewRegion] = useState('')
  const [newApprovalRef, setNewApprovalRef] = useState('')
  const [newParentId, setNewParentId] = useState<string>('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRegion, setEditRegion] = useState('')
  const [editApprovalRef, setEditApprovalRef] = useState('')

  const catalogs = catalogsQ.data ?? []
  const districts = districtsQ.data ?? []
  const currentSiteId = districts[0]?.site?.id ?? null

  const busy =
    createMut.isPending ||
    updateMut.isPending ||
    deleteMut.isPending ||
    setActiveMut.isPending

  const startAdd = () => {
    setAdding(true)
    setNewName('')
    setNewRegion('')
    setNewApprovalRef('')
    setNewParentId('')
    setEditingId(null)
  }

  const cancelAdd = () => {
    setAdding(false)
    setNewName('')
    setNewRegion('')
    setNewApprovalRef('')
    setNewParentId('')
  }

  const submitAdd = async () => {
    const name = newName.trim()
    const region = newRegion.trim()
    const approvalRef = newApprovalRef.trim()
    if (!name || !region) return
    try {
      await createMut.mutateAsync({
        name,
        region,
        approvalRef: approvalRef || undefined,
        parentCatalogId: newParentId || undefined,
      })
      await utils.catalog.list.invalidate()
      toast.success('Каталог создан')
      cancelAdd()
    } catch (e: any) {
      toast.error(e?.message ?? 'Ошибка сохранения')
    }
  }

  const startEdit = (c: {
    id: string
    name: string
    region: string
    approvalRef: string | null
  }) => {
    setEditingId(c.id)
    setEditName(c.name)
    setEditRegion(c.region)
    setEditApprovalRef(c.approvalRef ?? '')
    setAdding(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditRegion('')
    setEditApprovalRef('')
  }

  const submitEdit = async () => {
    if (!editingId) return
    const name = editName.trim()
    const region = editRegion.trim()
    const approvalRef = editApprovalRef.trim()
    if (!name || !region) return
    try {
      await updateMut.mutateAsync({
        id: editingId,
        data: {
          name,
          region,
          approvalRef: approvalRef || null,
        },
      })
      await utils.catalog.list.invalidate()
      toast.success('Сохранено')
      cancelEdit()
    } catch (e: any) {
      toast.error(e?.message ?? 'Ошибка сохранения')
    }
  }

  const handleSetActive = async (catalogId: string) => {
    if (!currentSiteId) return
    try {
      await setActiveMut.mutateAsync({ siteId: currentSiteId, catalogId })
      await utils.catalog.list.invalidate()
      toast.success('Каталог активирован')
    } catch (e: any) {
      toast.error(e?.message ?? 'Ошибка активации')
    }
  }

  const handleDelete = async (c: {
    id: string
    name: string
    _count: { schedules: number; childCatalogs: number; activeForSites: number }
  }) => {
    const blockers: string[] = []
    if (c._count.schedules > 0) blockers.push(`${c._count.schedules} позиций`)
    if (c._count.activeForSites > 0)
      blockers.push(`активен на ${c._count.activeForSites} сайт(ах)`)
    if (c._count.childCatalogs > 0)
      blockers.push(`${c._count.childCatalogs} каталог(ов) его расширяют`)
    if (blockers.length > 0) {
      toast.error(`Нельзя удалить «${c.name}»: ${blockers.join(', ')}`)
      return
    }
    const ok = await confirm({
      title: `Удалить каталог «${c.name}»?`,
      message: 'Действие необратимо.',
      confirmLabel: 'Удалить',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteMut.mutateAsync({ id: c.id })
      await utils.catalog.list.invalidate()
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
        <h2 className="vt-section-title" style={{ margin: 0 }}>
          Календари прививок · {DEPT_LABELS[dept]}
        </h2>
        {!adding && (
          <button
            type="button"
            className="vt-btn vt-btn-primary vt-btn-sm"
            onClick={startAdd}
            disabled={busy}
          >
            + Создать каталог
          </button>
        )}
      </div>

      <div className="vt-card" style={{ padding: 0, overflow: 'hidden' }}>
        {catalogsQ.isLoading ? (
          <div className="vt-loading">Загрузка…</div>
        ) : catalogs.length === 0 && !adding ? (
          <div className="vt-empty" style={{ padding: '40px 24px' }}>
            Каталоги для отделения «{DEPT_LABELS[dept]}» ещё не заведены.
            <div className="vt-hint" style={{ marginTop: 8 }}>
              Нажмите «Создать каталог», чтобы завести первый, или дождитесь
              сидера приказа МЗ № 1122н в следующей фазе.
            </div>
          </div>
        ) : (
          <table className="vt-table">
            <thead>
              <tr>
                <th>Название</th>
                <th style={{ width: 110 }}>Регион</th>
                <th>Расширяет</th>
                <th style={{ width: 90, textAlign: 'right' }}>Позиций</th>
                <th>Статус</th>
                <th style={{ width: 320, textAlign: 'right' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {adding && (
                <tr>
                  <td>
                    <input
                      className="vt-input"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Название каталога"
                      autoFocus
                    />
                    <input
                      className="vt-input"
                      style={{ marginTop: 6 }}
                      value={newApprovalRef}
                      onChange={(e) => setNewApprovalRef(e.target.value)}
                      placeholder="Утверждён (необязательно)"
                    />
                  </td>
                  <td>
                    <input
                      className="vt-input"
                      value={newRegion}
                      onChange={(e) => setNewRegion(e.target.value)}
                      placeholder="RU / RU-MSK"
                    />
                  </td>
                  <td>
                    <select
                      className="vt-input"
                      value={newParentId}
                      onChange={(e) => setNewParentId(e.target.value)}
                    >
                      <option value="">— нет —</option>
                      {catalogs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="vt-muted" style={{ textAlign: 'right' }}>
                    —
                  </td>
                  <td className="vt-muted">—</td>
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
                        disabled={busy || !newName.trim() || !newRegion.trim()}
                      >
                        {createMut.isPending ? 'Сохраняем…' : 'Сохранить'}
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {catalogs.map((c) => {
                const isActiveForSite =
                  !!currentSiteId &&
                  c.activeForSites.some((s) => s.id === currentSiteId)
                const hasDeps =
                  c._count.schedules > 0 ||
                  c._count.activeForSites > 0 ||
                  c._count.childCatalogs > 0

                if (editingId === c.id) {
                  return (
                    <tr key={c.id}>
                      <td>
                        <input
                          className="vt-input"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                        />
                        <input
                          className="vt-input"
                          style={{ marginTop: 6 }}
                          value={editApprovalRef}
                          onChange={(e) => setEditApprovalRef(e.target.value)}
                          placeholder="Утверждён"
                        />
                      </td>
                      <td>
                        <input
                          className="vt-input"
                          value={editRegion}
                          onChange={(e) => setEditRegion(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitEdit()
                            if (e.key === 'Escape') cancelEdit()
                          }}
                        />
                      </td>
                      <td>
                        {c.parentCatalog ? (
                          <span className="vt-hint">{c.parentCatalog.name}</span>
                        ) : (
                          <span className="vt-hint">—</span>
                        )}
                      </td>
                      <td className="vt-muted" style={{ textAlign: 'right' }}>
                        {c._count.schedules}
                      </td>
                      <td className="vt-muted">—</td>
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
                              busy || !editName.trim() || !editRegion.trim()
                            }
                          >
                            {updateMut.isPending ? 'Сохраняем…' : 'Сохранить'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={c.id}>
                    <td>
                      <Link
                        to={c.id}
                        className="vt-display"
                        style={{
                          fontWeight: 600,
                          color: 'var(--vt-link, var(--vt-text))',
                          textDecoration: 'none',
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.textDecoration = 'underline')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.textDecoration = 'none')
                        }
                        title="Открыть позиции каталога"
                      >
                        {c.name}
                      </Link>
                      {c.approvalRef && (
                        <div className="vt-hint" style={{ marginTop: 2 }}>
                          {c.approvalRef}
                        </div>
                      )}
                    </td>
                    <td className="vt-mono">{c.region}</td>
                    <td>
                      {c.parentCatalog ? (
                        <span className="vt-hint">{c.parentCatalog.name}</span>
                      ) : (
                        <span className="vt-hint">—</span>
                      )}
                    </td>
                    <td className="vt-mono" style={{ textAlign: 'right' }}>
                      {c._count.schedules}
                    </td>
                    <td>
                      {c.isActive ? (
                        <span className="vt-badge vt-badge-accent">активен</span>
                      ) : (
                        <span className="vt-badge vt-badge-neutral">архив</span>
                      )}
                      {c.isLegacy && (
                        <span
                          className="vt-badge vt-badge-neutral"
                          style={{ marginLeft: 6 }}
                        >
                          legacy
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          gap: 6,
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        {isActiveForSite ? (
                          <span className="vt-badge vt-badge-accent">
                            Активный для отделения
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="vt-btn vt-btn-ghost vt-btn-sm"
                            onClick={() => handleSetActive(c.id)}
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
                        <button
                          type="button"
                          className="vt-btn vt-btn-ghost vt-btn-sm"
                          onClick={() => startEdit(c)}
                          disabled={busy}
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          className="vt-btn vt-btn-ghost vt-btn-sm"
                          onClick={() => handleDelete(c)}
                          disabled={busy || hasDeps}
                          title={
                            hasDeps
                              ? 'Нельзя удалить — есть зависимости'
                              : 'Удалить каталог'
                          }
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
