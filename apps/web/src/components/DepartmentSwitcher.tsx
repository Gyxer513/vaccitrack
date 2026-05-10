import { useDepartment } from './DepartmentProvider'
import { DEPT_LABELS, type Dept } from '../lib/dept'

const ORDER: Dept[] = ['KID', 'ADULT']

export function DepartmentSwitcher() {
  const { dept, setDept, allowedDepts } = useDepartment()
  const visible = ORDER.filter((d) => allowedDepts.includes(d))

  if (visible.length <= 1) {
    return <div className="vt-dept-switcher single">{DEPT_LABELS[visible[0] ?? dept]}</div>
  }

  return (
    <div className="vt-dept-switcher" role="tablist" aria-label="Отделение">
      {visible.map((d) => (
        <button
          key={d}
          type="button"
          role="tab"
          aria-selected={dept === d}
          className={dept === d ? 'on' : ''}
          onClick={() => setDept(d)}
        >
          {DEPT_LABELS[d]}
        </button>
      ))}
    </div>
  )
}
