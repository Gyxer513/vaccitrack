import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  type Dept,
  applyDeptToDom,
  readDeptFromStorage,
  writeDeptToStorage,
} from '../lib/dept'
import { allowedDepartments, fallbackDepartment, isDepartmentAllowed } from '../lib/auth'

type DepartmentContextValue = {
  dept: Dept
  setDept: (next: Dept) => void
  allowedDepts: Dept[]
}

const DepartmentContext = createContext<DepartmentContextValue | null>(null)

export function DepartmentProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const allowedDepts = useMemo(() => allowedDepartments(), [])
  const fallbackDept = useMemo(() => fallbackDepartment(), [])
  const [dept, setDeptState] = useState<Dept>(() => {
    const storedDept = readDeptFromStorage(fallbackDept)
    return isDepartmentAllowed(storedDept) ? storedDept : fallbackDept
  })

  useEffect(() => {
    if (!isDepartmentAllowed(dept)) {
      writeDeptToStorage(fallbackDept)
      setDeptState(fallbackDept)
      return
    }

    writeDeptToStorage(dept)
    applyDeptToDom(dept)
  }, [dept, fallbackDept])

  const setDept = useCallback(
    (next: Dept) => {
      if (next === dept || !isDepartmentAllowed(next)) return
      writeDeptToStorage(next)
      applyDeptToDom(next)
      setDeptState(next)
      queryClient.invalidateQueries()
      navigate('/patients')
    },
    [dept, queryClient, navigate],
  )

  const value = useMemo<DepartmentContextValue>(
    () => ({ dept, setDept, allowedDepts }),
    [dept, setDept, allowedDepts],
  )

  return <DepartmentContext.Provider value={value}>{children}</DepartmentContext.Provider>
}

export function useDepartment(): DepartmentContextValue {
  const ctx = useContext(DepartmentContext)
  if (!ctx) throw new Error('useDepartment must be used within <DepartmentProvider>')
  return ctx
}
