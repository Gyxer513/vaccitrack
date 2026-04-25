// Тип отделения и хелперы для localStorage / html data-dept атрибута.

export type Dept = 'KID' | 'ADULT'

export const DEFAULT_DEPT: Dept = 'KID'
export const DEPT_STORAGE_KEY = 'vt-dept'

export function readDeptFromStorage(): Dept {
  if (typeof window === 'undefined') return DEFAULT_DEPT
  const v = window.localStorage.getItem(DEPT_STORAGE_KEY)
  return v === 'KID' || v === 'ADULT' ? v : DEFAULT_DEPT
}

export function writeDeptToStorage(dept: Dept): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DEPT_STORAGE_KEY, dept)
}

/** Применить dept к <html data-dept="..."> — переключает CSS-тему. */
export function applyDeptToDom(dept: Dept): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-dept', dept.toLowerCase())
}

export const DEPT_LABELS: Record<Dept, string> = {
  KID: 'Дети',
  ADULT: 'Взрослые',
}
