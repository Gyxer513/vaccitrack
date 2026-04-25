import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  type Dept,
  applyDeptToDom,
  readDeptFromStorage,
  writeDeptToStorage,
} from '../lib/dept'

type DepartmentContextValue = {
  dept: Dept
  setDept: (next: Dept) => void
}

const DepartmentContext = createContext<DepartmentContextValue | null>(null)

/**
 * Провайдер отделения. Хранит текущее значение в localStorage, синхронизирует
 * `<html data-dept="...">` (для CSS-токенов) и сбрасывает react-query кэш при
 * переключении — чтобы все списки/превью пере-зачитались уже с новым x-dept.
 */
export function DepartmentProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [dept, setDeptState] = useState<Dept>(() => readDeptFromStorage())

  // На маунте подтягиваем тему к html — на случай, если в localStorage уже
  // лежит ADULT, а index.html стартует с data-dept="kid".
  useEffect(() => {
    applyDeptToDom(dept)
  }, [dept])

  const setDept = useCallback(
    (next: Dept) => {
      if (next === dept) return
      writeDeptToStorage(next)
      applyDeptToDom(next)
      setDeptState(next)
      // Сбрасываем все кэши react-query — следующий refetch пойдёт уже с
      // новым x-dept хедером и вернёт пациентов/нозологии другого отделения.
      queryClient.invalidateQueries()
    },
    [dept, queryClient],
  )

  const value = useMemo<DepartmentContextValue>(() => ({ dept, setDept }), [dept, setDept])

  return <DepartmentContext.Provider value={value}>{children}</DepartmentContext.Provider>
}

export function useDepartment(): DepartmentContextValue {
  const ctx = useContext(DepartmentContext)
  if (!ctx) throw new Error('useDepartment must be used within <DepartmentProvider>')
  return ctx
}
