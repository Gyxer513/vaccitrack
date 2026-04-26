import { useParams } from 'react-router-dom'
import { trpc } from '../lib/trpc'
import { PatientForm } from '../components/patient/PatientForm'

export function EditPatientPage() {
  const { id } = useParams<{ id: string }>()
  const { data: patient, isLoading, error } = trpc.patient.getById.useQuery(
    { id: id! },
    { enabled: !!id },
  )

  if (isLoading) return <div className="vt-loading">Загрузка…</div>
  if (error) return <div className="vt-empty">{error.message}</div>
  if (!patient) return <div className="vt-empty">Пациент не найден</div>

  return (
    <PatientForm
      mode="edit"
      initialData={{
        id: patient.id,
        lastName: patient.lastName,
        firstName: patient.firstName,
        middleName: patient.middleName,
        sex: patient.sex,
        birthday: patient.birthday,
        phone: patient.phone,
        districtId: patient.districtId,
        insuranceId: patient.insuranceId,
        riskGroupId: patient.riskGroupId,
        policySerial: patient.policySerial,
        policyNumber: patient.policyNumber,
        hasDirectContract: patient.hasDirectContract,
        directContractNumber: patient.directContractNumber,
        isDecret: patient.isDecret,
        isSelfOrganized: patient.isSelfOrganized,
      }}
    />
  )
}
