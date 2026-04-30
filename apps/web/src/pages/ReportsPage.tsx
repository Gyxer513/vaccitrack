import { useMemo, useState } from 'react'

export function ReportsPage() {
  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const currentMonth = useMemo(() => new Date().getMonth() + 1, [])
  const [form5Year, setForm5Year] = useState(String(currentYear))
  const [form5Month, setForm5Month] = useState(String(currentMonth))
  const [form6Year, setForm6Year] = useState(String(currentYear))
  const form5Href = `/api/v1/documents/form5.docx?year=${encodeURIComponent(form5Year)}&month=${encodeURIComponent(form5Month)}`
  const form6Href = `/api/v1/documents/form6.docx?year=${encodeURIComponent(form6Year)}`

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Отчеты</h1>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Отчет</th>
              <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Период</th>
              <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Формат</th>
              <th className="text-right px-4 py-2.5 text-gray-600 font-medium">Действие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <tr>
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900">Форма N 5</div>
                <div className="text-xs text-gray-500">
                  Сведения о профилактических прививках за месяц
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <select
                    value={form5Month}
                    onChange={(e) => setForm5Month(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm w-[150px]"
                    aria-label="Месяц формы 5"
                  >
                    <option value="1">Январь</option>
                    <option value="2">Февраль</option>
                    <option value="3">Март</option>
                    <option value="4">Апрель</option>
                    <option value="5">Май</option>
                    <option value="6">Июнь</option>
                    <option value="7">Июль</option>
                    <option value="8">Август</option>
                    <option value="9">Сентябрь</option>
                    <option value="10">Октябрь</option>
                    <option value="11">Ноябрь</option>
                    <option value="12">Декабрь</option>
                  </select>
                  <input
                    type="number"
                    min="2000"
                    max="2100"
                    value={form5Year}
                    onChange={(e) => setForm5Year(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm w-[110px]"
                    aria-label="Год формы 5"
                  />
                </div>
              </td>
              <td className="px-4 py-3 text-gray-500">Word</td>
              <td className="px-4 py-3 text-right">
                <a
                  href={form5Href}
                  className="vt-btn vt-btn-primary"
                  title="Скачать форму N 5 (Word)"
                >
                  Скачать ↓
                </a>
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900">Форма N 6</div>
                <div className="text-xs text-gray-500">
                  Контингенты детей и взрослых, привитых против инфекционных заболеваний
                </div>
              </td>
              <td className="px-4 py-3">
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  value={form6Year}
                  onChange={(e) => setForm6Year(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm w-[110px]"
                  aria-label="Год формы 6"
                />
              </td>
              <td className="px-4 py-3 text-gray-500">Word</td>
              <td className="px-4 py-3 text-right">
                <a
                  href={form6Href}
                  className="vt-btn vt-btn-primary"
                  title="Скачать форму N 6 (Word)"
                >
                  Скачать ↓
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
