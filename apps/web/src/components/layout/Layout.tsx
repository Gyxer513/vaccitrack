import { Link, useLocation } from 'react-router-dom'

const nav = [
  { to: '/patients', label: 'Пациенты' },
  { to: '/plan', label: 'План прививок' },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  return (
    <div className="vt-app">
      <header className="vt-topbar">
        <div className="vt-brand">VacciTrack</div>
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
          <span className="vt-user">Администратор</span>
        </div>
      </header>
      <main className="vt-main">{children}</main>
    </div>
  )
}
