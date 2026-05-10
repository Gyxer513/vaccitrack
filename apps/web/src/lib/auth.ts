import { keycloak } from './keycloak'
import type { Dept } from './dept'

export const ROLE_ADMIN = 'admin'
export const ROLE_DOCTOR_KID = 'doctor_kid'
export const ROLE_DOCTOR_ADULT = 'doctor_adult'

type TokenWithRoles = {
  realm_access?: {
    roles?: string[]
  }
}

export function currentRoles(): string[] {
  return ((keycloak.tokenParsed as TokenWithRoles | undefined)?.realm_access?.roles ?? [])
}

export function allowedDepartments(roles = currentRoles()): Dept[] {
  if (roles.includes(ROLE_ADMIN)) return ['KID', 'ADULT']

  const departments: Dept[] = []
  if (roles.includes(ROLE_DOCTOR_KID)) departments.push('KID')
  if (roles.includes(ROLE_DOCTOR_ADULT)) departments.push('ADULT')

  return departments
}

export function isDepartmentAllowed(dept: Dept, roles = currentRoles()): boolean {
  return allowedDepartments(roles).includes(dept)
}

export function fallbackDepartment(roles = currentRoles()): Dept {
  return allowedDepartments(roles)[0] ?? 'KID'
}

export function hasRole(role: string, roles = currentRoles()): boolean {
  return roles.includes(role)
}
