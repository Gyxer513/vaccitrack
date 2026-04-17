import { useState } from 'react'
import { Link } from 'react-router-dom'
import { trpc } from '../lib/trpc'
import { format } from 'date-fns'

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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Пациенты</h1>
        <Link
          to="/patients/new"
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700"
        >
          + Добавить пациента
        </Link>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Поиск по ФИО или номеру полиса..."
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={districtId ?? ''}
          onChange={(e) => { setDistrictId(e.target.value || undefined); setPage(1) }}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
        >
          <option value="">Все участки</option>
          {districts?.map((d) => (
            <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Загрузка...</div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['ФИО', 'Дата рождения', 'Возраст', 'Участок', 'Полис', 'Медотвод'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-gray-600 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.items.map((p) => {
                  const age = Math.floor(
                    (Date.now() - new Date(p.birthday).getTime()) / (1000 * 60 * 60 * 24 * 365.25)
                  )
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <Link
                          to={`/patients/${p.id}`}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {p.lastName} {p.firstName} {p.middleName ?? ''}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {format(new Date(p.birthday), 'dd.MM.yyyy')}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">
                        {age < 1
                          ? `${Math.floor((Date.now() - new Date(p.birthday).getTime()) / (1000 * 60 * 60 * 24 * 30.5))} мес.`
                          : `${age} лет`}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{p.district?.code ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {[p.policySerial, p.policyNumber].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {p.activeMedExemption && (
                          <span className="inline-flex px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800">
                            {p.activeMedExemption.medExemptionType.name}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {data && data.pages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
              <span>Всего: {data.total}</span>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 border rounded disabled:opacity-40"
                >←</button>
                <span className="px-3 py-1">{page} / {data.pages}</span>
                <button
                  disabled={page === data.pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 border rounded disabled:opacity-40"
                >→</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
