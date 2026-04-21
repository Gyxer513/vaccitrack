import { Navigate, useSearchParams } from 'react-router-dom'
import { VaccinationForm } from '../components/vaccination/VaccinationForm'

export function NewVaccinationPage() {
  const [params] = useSearchParams()
  const patientId = params.get('patientId')

  if (!patientId) return <Navigate to="/patients" replace />

  return <VaccinationForm patientId={patientId} />
}
