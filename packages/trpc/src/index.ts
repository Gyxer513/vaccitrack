export { appRouter } from './root.router'
export type { AppRouter } from './root.router'
export { router, procedure, protectedProcedure, publicProcedure } from './init'
export type { Context } from './init'
export {
  ROLE_ADMIN,
  ROLE_DOCTOR_ADULT,
  ROLE_DOCTOR_KID,
  allowedDepartmentsForRoles,
  fallbackDepartmentForRoles,
  resolveAuthorizedDepartment,
} from './auth'
export {
  buildPlanForPatient,
  collectSchedules,
  filterReportableItems,
  inferGroup,
  inferShortCode,
  resolveCatalogIdForDistrict,
} from './lib/plan-builder'
export type { PlanItem, PlanItemStatus, PlanGroupKey } from './lib/plan-builder'
