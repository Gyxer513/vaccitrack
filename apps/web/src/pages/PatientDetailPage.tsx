import { useParams, Link } from 'react-router-dom'
import { trpc } from '../lib/trpc'
import { format, differenceInMonths, differenceInYears } from 'date-fns'

const STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Запланировано',
  OVERDUE: 'Просрочено',
  DONE: 'Выполнено',
  EXEMPTED: 'Медотвод',
  REFUSED: 'Отказ',
}
const STATUS_COLORS: Record<string, string> = {
  PLANNED: 'bg-blue-100 text-blue-700',
  OVERDUE: 'bg-red-100 text-red-700',
  DONE: 'bg-green-100 text-green-700',
  EXEMPTED: 'bg-amber-100 text-amber-700',
  REFUSED: 'bg-gray-100 text-gray-600',
}

function formatAge(birthday: string | Date) {
  const bd = new Date(birthday)
  const now = new Date()
  const years = differenceInYears(now, bd)
  if (years >= 1) return `${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}`
  const months = differenceInMonths(now, bd)
  return `${months} мес.`
}

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: patient, isLoading } = trpc.patient.getById.useQuery({ id: id! })

  if (isLoading) return <div className="text-center py-12 text-gray-500">Загрузка...</div>
  if (!patient) return <div className="text-center py-12 text-red-500">Пациент не найден</div>

  const fullName = `${patient.lastName} ${patient.firstName} ${patient.middleName ?? ''}`.trim()

  return (
    <div className="space-y-6">
      {/* Шапка */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link to="/patients" className="hover:text-gray-700">← Пациенты</Link>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">{fullName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {format(new Date(patient.birthday), 'dd.MM.yyyy')}
            {' · '}{formatAge(patient.birthday)}
            {' · '}{patient.sex === 'MALE' ? 'Муж.' : 'Жен.'}
            {' · '}Участок: {patient.district?.code ?? '—'}
          </p>
          {patient.activeMedExemption && (
            <span className="inline-flex mt-1 px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800">
              Медотвод: {patient.activeMedExemption.medExemptionType.name}
              {patient.activeMedExemption.dateTo
                ? ` до ${format(new Date(patient.activeMedExemption.dateTo), 'dd.MM.yyyy')}`
                : ' (бессрочно)'}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/v1/documents/patients/${id}/form063u`}
            target="_blank"
            rel="noreferrer"
            className="text-sm border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50"
          >
            Форма 063/у ↓
          </a>
          <a
            href={`/api/v1/documents/patients/${id}/certificate`}
            target="_blank"
            rel="noreferrer"
            className="text-sm border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50"
          >
            Сертификат ↓
          </a>
        </div>
      </div>

      {/* Журнал прививок */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <span className="font-medium text-gray-900">
            Журнал прививок ({patient.vaccinationRecords.length})
          </span>
        </div>
        {patient.vaccinationRecords.length === 0 ? (
          <div className="px-4 py-8 text-gray-400 text-sm text-center">Прививок нет</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Прививка', 'Доза', 'Дата', 'Возраст', 'Препарат', 'Серия', 'Врач'].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-gray-600 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {patient.vaccinationRecords.map((r) => (
                <tr key={r.id} className={r.medExemptionTypeId ? 'bg-amber-50' : ''}>
                  <td className="px-4 py-2">{r.vaccineSchedule?.name ?? '—'}</td>
                  <td className="px-4 py-2 text-gray-500">{r.vaccineSchedule?.key ?? '—'}</td>
                  <td className="px-4 py-2">{format(new Date(r.vaccinationDate), 'dd.MM.yyyy')}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {r.ageYears > 0 ? `${r.ageYears}л ` : ''}{r.ageMonths}м
                  </td>
                  <td className="px-4 py-2 text-gray-600">{r.vaccine?.name ?? '—'}</td>
                  <td className="px-4 py-2 text-gray-500">{r.series ?? '—'}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {r.doctor
                      ? `${r.doctor.lastName} ${r.doctor.firstName[0]}.`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* План */}
      {patient.planItems.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 font-medium text-gray-900">
            План прививок
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Прививка', 'Плановая дата', 'Статус'].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-gray-600 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {patient.planItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2">{item.vaccineSchedule.name}</td>
                  <td className="px-4 py-2">{format(new Date(item.plannedDate), 'dd.MM.yyyy')}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status]}`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
