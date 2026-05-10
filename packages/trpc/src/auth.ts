import { TRPCError } from '@trpc/server'
import type { Dept } from '@vaccitrack/db'

export const ROLE_ADMIN = 'admin'
export const ROLE_DOCTOR_KID = 'doctor_kid'
export const ROLE_DOCTOR_ADULT = 'doctor_adult'

export function allowedDepartmentsForRoles(roles: string[]): Dept[] {
  if (roles.includes(ROLE_ADMIN)) return ['KID', 'ADULT']

  const departments: Dept[] = []
  if (roles.includes(ROLE_DOCTOR_KID)) departments.push('KID')
  if (roles.includes(ROLE_DOCTOR_ADULT)) departments.push('ADULT')

  return departments
}

export function resolveAuthorizedDepartment(requestedDept: Dept, roles: string[]): Dept {
  const allowed = allowedDepartmentsForRoles(roles)
  if (allowed.length === 0) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'No department role assigned' })
  }
  if (!allowed.includes(requestedDept)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: `Department is not allowed: ${requestedDept}` })
  }
  return requestedDept
}

export function fallbackDepartmentForRoles(roles: string[]): Dept {
  return allowedDepartmentsForRoles(roles)[0] ?? 'KID'
}
