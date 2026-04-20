import { useState } from 'react'
import { Link } from 'react-router-dom'
import { trpc } from '../lib/trpc'
import { format } from 'date-fns'
import { Pagination } from '../components/ui/Pagination'

function ageLabel(birthday: Date | string) {
  const bd = new Date(birthday)
  const ms = Date.now() - bd.getTime()
  const years = Math.floor(ms / (1000 * 60 * 60 * 24 * 365.25))
  if (years >= 1) return `${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}`
  const months = Math.floor(ms / (1000 * 60 * 60 * 24 * 30.5))
  return `${months} мес.`
}

export function PatientsPage() {
  const [search, setSearch] = useState('')
  const [districtId, setDistrictId] = useState<string | undefined>()
  const [page, setPage] = useState(1)

  const { data, isLoading } = trpc.patient.list.useQuery(
    { search: search || undefined, districtId, page, perPage: 50 },
    { placeholderData: (prev) => prev },
  )
  const { data: districts } = trpc.reference.districts.useQuery()

  return (
    <div>
      <div className="vt-page-head">
        <div>
          <h1 className="vt-page-title">Пациенты</h1>
          {data && (
            <div className="vt-page-sub">Всего в базе: {data.total}</div>
          )}
        </div>
        <Link to="/patients/new" className="vt-btn vt-btn-primary">
          + Добавить пациента
        </Link>
      </div>

      <div className="vt-toolbar">
        <input
          className="vt-input"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Поиск по ФИО или номеру полиса…"
        />
        <select
          className="vt-select"
          value={districtId ?? ''}
          onChange={(e) => { setDistrictId(e.target.value || undefined); setPage(1) }}
        >
          <option value="">Все участки</option>
          {districts?.map((d) => (
            <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
          ))}
        </select>
      </div>

      <div className="vt-card">
        {isLoading ? (
          <div className="vt-loading">Загрузка…</div>
        ) : !data?.items.length ? (
          <div className="vt-empty">Пациенты не найдены</div>
        ) : (
          <>
            <table className="vt-table">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Дата рождения</th>
                  <th>Возраст</th>
                  <th>Участок</th>
                  <th>Полис</th>
                  <th>Медотвод</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => {
                  const initials = (p.lastName[0] ?? '') + (p.firstName[0] ?? '')
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="vt-name-cell">
                          <div className="vt-avatar">{initials}</div>
                          <Link to={`/patients/${p.id}`} className="vt-link">
                            {p.lastName} {p.firstName} {p.middleName ?? ''}
                          </Link>
                        </div>
                      </td>
                      <td className="vt-muted">
                        {format(new Date(p.birthday), 'dd.MM.yyyy')}
                      </td>
                      <td className="vt-muted">{ageLabel(p.birthday)}</td>
                      <td>
                        {p.district ? (
                          <span className="vt-badge vt-badge-neutral">{p.district.code}</span>
                        ) : (
                          <span className="vt-hint">—</span>
                        )}
                      </td>
                      <td className="vt-muted">
                        {[p.policySerial, p.policyNumber].filter(Boolean).join(' ') || (
                          <span className="vt-hint">—</span>
                        )}
                      </td>
                      <td>
                        {p.activeMedExemption ? (
                          <span className="vt-badge vt-badge-warn">
                            ⚠ {p.activeMedExemption.medExemptionType.name}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {data.pages > 1 && (
              <div className="vt-pagination">
                <span>
                  {(page - 1) * 50 + 1}–{Math.min(page * 50, data.total)} из {data.total}
                </span>
                <Pagination
                  page={page}
                  pages={data.pages}
                  onChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
