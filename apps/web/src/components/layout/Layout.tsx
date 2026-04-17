import { Link, useLocation } from 'react-router-dom'
import { keycloak } from '../../lib/keycloak'

const nav = [
  { to: '/patients', label: 'Пациенты' },
  { to: '/plan', label: 'План прививок' },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className="font-semibold text-blue-700 text-lg">VacciTrack</span>
          <nav className="flex gap-4">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
                  pathname.startsWith(n.to)
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>{keycloak.tokenParsed?.name}</span>
          <button
            onClick={() => keycloak.logout()}
            className="text-gray-400 hover:text-gray-700"
          >
            Выйти
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-6">{children}</main>
    </div>
  )
}
