import { useMemo, useState } from 'react'
import { trpc } from '../lib/trpc'
import { format, addDays } from 'date-fns'

const ISO = (d: Date): string => d.toISOString().slice(0, 10)

export function PlanPage() {
  const today = useMemo(() => new Date(), [])
  const [districtId, setDistrictId] = useState('')
  const [from, setFrom] = useState(ISO(today))
  const [to, setTo] = useState(ISO(addDays(today, 30)))

  const { data: districts } = trpc.reference.districts.useQuery()
  const { data: rows, isLoading } = trpc.plan.byDistrict.useQuery(
    { districtId, fromDate: new Date(from), toDate: new Date(to) },
    { enabled: !!districtId && !!from && !!to },
  )

  const downloadHref = districtId
    ? `/api/v1/documents/plan.docx?districtId=${encodeURIComponent(districtId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    : '#'

  const districtLabel = districts?.find((d) => d.id === districtId)
  const totalItems = rows?.reduce((sum, r) => sum + r.items.length, 0) ?? 0

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-4">План прививок</h1>

      <div className="flex gap-3 mb-4 items-end flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Участок</label>
          <select
            value={districtId}
            onChange={(e) => setDistrictId(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm min-w-[220px]"
          >
            <option value="">Выберите участок</option>
            {districts?.map((d) => (
              <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Дата с</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Дата по</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <a
          href={downloadHref}
          className={`vt-btn vt-btn-primary ${!districtId ? 'pointer-events-none opacity-50' : ''}`}
          aria-disabled={!districtId}
          title="Скачать план прививок (Word)"
        >
          Скачать план в Word ↓
        </a>
      </div>

      {!districtId && (
        <div className="text-center py-12 text-gray-400">Выберите участок</div>
      )}
      {districtId && isLoading && (
        <div className="text-center py-12 text-gray-500">Загрузка...</div>
      )}
      {districtId && !isLoading && rows && rows.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          Нет плановых прививок в этом периоде
          {districtLabel ? ` на участке ${districtLabel.code}` : ''}.
        </div>
      )}

      {districtId && rows && rows.length > 0 && (
        <>
          <div className="text-sm text-gray-500 mb-2">
            Пациентов в плане: <span className="font-medium text-gray-700">{rows.length}</span>
            , позиций: <span className="font-medium text-gray-700">{totalItems}</span>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-gray-600 font-medium whitespace-nowrap">Пациент</th>
                  <th className="text-left px-4 py-2.5 text-gray-600 font-medium whitespace-nowrap">Дата рождения</th>
                  <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Прививки в плане</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.patient.id}>
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                      {r.patient.lastName} {r.patient.firstName} {r.patient.middleName ?? ''}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                      {format(new Date(r.patient.birthday), 'dd.MM.yyyy')}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {r.items.map((it) => (
                          <span
                            key={it.scheduleId}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                              it.status === 'overdue'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : it.status === 'due-soon'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                            title={`${it.scheduleName} • ${it.status}`}
                          >
                            <span className="font-medium">{it.shortCode}</span>
                            <span className="opacity-70">
                              {format(new Date(it.dueDate), 'dd.MM')}
                            </span>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
