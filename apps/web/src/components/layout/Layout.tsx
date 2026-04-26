import { Link, useLocation } from 'react-router-dom'
import { DepartmentSwitcher } from '../DepartmentSwitcher'
import { IconSettings } from '../vaccination/icons'

const nav = [
  { to: '/patients', label: 'Пациенты' },
  { to: '/plan', label: 'План прививок' },
  { to: '/vaccines', label: 'Вакцины' },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  return (
    <div className="vt-app">
      <header className="vt-topbar">
        <Link to="/" className="vt-brand" aria-label="Immunova — на главную">
          <BrandMark />
          <span>Immunova</span>
        </Link>
        <nav className="vt-nav">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={pathname.startsWith(n.to) ? 'active' : ''}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="vt-topbar-right">
          <DepartmentSwitcher />
          <Link
            to="/settings"
            className={`vt-btn-icon${pathname.startsWith('/settings') ? ' active' : ''}`}
            aria-label="Настройки"
            title="Настройки"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
            }}
          >
            <IconSettings size={18} />
          </Link>
          <span className="vt-user">Администратор</span>
        </div>
      </header>
      <main className="vt-main">{children}</main>
    </div>
  )
}

// Знак-капля с кардио-линией. Заливка по текущему цвету темы (var(--accent)),
// ECG-линия — кремовая, читается поверх любой глубины акцента.
function BrandMark() {
  return (
    <svg
      viewBox="0 0 48 48"
      width="26"
      height="26"
      aria-hidden="true"
      style={{ color: 'var(--vt-primary)', flexShrink: 0 }}
    >
      <path
        d="M24 6 C 24 6, 12 18, 12 28 a12 12 0 0 0 24 0 C 36 18, 24 6, 24 6 Z"
        fill="currentColor"
      />
      <path
        d="M14 30 L19 30 L21 25 L24 35 L27 28 L29 30 L34 30"
        stroke="var(--vt-surface)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
