import { useState } from 'react'
import { trpc } from '../lib/trpc'
import { format } from 'date-fns'

export function PlanPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [districtId, setDistrictId] = useState('')

  const { data: districts } = trpc.reference.districts.useQuery()
  const { data: plan, isLoading } = trpc.vaccination.planByDistrict.useQuery(
    { districtId, month, year },
    { enabled: !!districtId },
  )

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-4">План прививок</h1>

      <div className="flex gap-3 mb-4">
        <select
          value={districtId}
          onChange={(e) => setDistrictId(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
        >
          <option value="">Выберите участок</option>
          {districts?.map((d) => (
            <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
          ))}
        </select>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {new Date(2024, i).toLocaleString('ru-RU', { month: 'long' })}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
        >
          {[2025, 2026, 2027].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {!districtId && (
        <div className="text-center py-12 text-gray-400">Выберите участок</div>
      )}
      {districtId && isLoading && (
        <div className="text-center py-12 text-gray-500">Загрузка...</div>
      )}
      {plan && (
        <div className="bg-white rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['ФИО', 'Дата рождения', 'Возраст', 'Прививка', 'Плановая дата', 'Статус'].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-gray-600 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plan.map((item) => {
                const age = Math.floor(
                  (Date.now() - new Date(item.patient.birthday).getTime()) /
                    (1000 * 60 * 60 * 24 * 365.25),
                )
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-2.5 font-medium">
                      {item.patient.lastName} {item.patient.firstName}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {format(new Date(item.patient.birthday), 'dd.MM.yyyy')}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{age} лет</td>
                    <td className="px-4 py-2.5">{item.vaccineSchedule.name}</td>
                    <td className="px-4 py-2.5">{format(new Date(item.plannedDate), 'dd.MM.yyyy')}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          item.status === 'PLANNED'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {item.status === 'PLANNED' ? 'Запланировано' : 'Просрочено'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {plan.length === 0 && (
            <div className="text-center py-8 text-gray-400">Нет плановых прививок за этот период</div>
          )}
        </div>
      )}
    </div>
  )
}
