import { NavLink, Outlet } from 'react-router-dom'

/**
 * Страница «Настройки» — sidebar-меню слева + контент выбранного раздела
 * справа. Контент рендерится через nested `<Outlet />` из подмаршрутов
 * (см. App.tsx: /settings/districts, /settings/catalogs).
 *
 * При расширении (Риск-группы, Страховые, Препараты) — добавить пункт
 * в массив SECTIONS ниже и заведение nested-route в App.tsx.
 */
const SECTIONS: { to: string; label: string }[] = [
  { to: 'districts', label: 'Участки' },
  { to: 'catalogs', label: 'Календари' },
]

export function SettingsPage() {
  return (
    <div>
      <div className="vt-page-head">
        <div>
          <h1 className="vt-page-title">Настройки</h1>
          <div className="vt-page-sub">Управление справочниками клиники</div>
        </div>
      </div>

      <div className="vt-settings-layout">
        <aside className="vt-settings-sidebar">
          <nav>
            {SECTIONS.map((s) => (
              <NavLink
                key={s.to}
                to={s.to}
                className={({ isActive }) =>
                  'vt-settings-nav-item' + (isActive ? ' active' : '')
                }
              >
                {s.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="vt-settings-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
