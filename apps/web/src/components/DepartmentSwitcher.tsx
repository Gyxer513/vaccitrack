import { useDepartment } from './DepartmentProvider'
import { DEPT_LABELS, type Dept } from '../lib/dept'

const ORDER: Dept[] = ['KID', 'ADULT']

/**
 * Сегмент-переключатель «Дети / Взрослые» для шапки. Меняет
 * DepartmentContext, который синхронизирует localStorage,
 * <html data-dept="..."> и invalidate'ит react-query кэш.
 */
export function DepartmentSwitcher() {
  const { dept, setDept } = useDepartment()
  return (
    <div className="vt-dept-switcher" role="tablist" aria-label="Отделение">
      {ORDER.map((d) => (
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
