import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { PatientsPage } from './pages/PatientsPage'
import { PatientDetailPage } from './pages/PatientDetailPage'
import { NewPatientPage } from './pages/NewPatientPage'
import { EditPatientPage } from './pages/EditPatientPage'
import { PlanPage } from './pages/PlanPage'
import { NewVaccinationPage } from './pages/NewVaccinationPage'
import { VaccinesPage } from './pages/VaccinesPage'
import { SettingsPage } from './pages/SettingsPage'
import { ErrorPage } from './pages/ErrorPage'

export default function App() {
  return (
    <Routes>
      {/* Форма записи — без Layout (своя шапка) */}
      <Route path="/vaccination/new" element={<NewVaccinationPage />} />

      {/* Остальное — с Layout */}
      <Route path="*" element={
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/patients" replace />} />
            <Route path="/patients" element={<PatientsPage />} />
            <Route path="/patients/new" element={<NewPatientPage />} />
            <Route path="/patients/:id/edit" element={<EditPatientPage />} />
            <Route path="/patients/:id" element={<PatientDetailPage />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/vaccines" element={<VaccinesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            {/* Неизвестный маршрут */}
            <Route
              path="*"
              element={
                <ErrorPage
                  code="404"
                  title="Страница не найдена"
                  message="Возможно, адрес устарел, или страница была удалена."
                />
              }
            />
          </Routes>
        </Layout>
      } />
    </Routes>
  )
}
