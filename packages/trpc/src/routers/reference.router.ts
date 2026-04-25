import { router, protectedProcedure } from '../init'
import { ScheduleScope } from '@vaccitrack/db'

export const referenceRouter = router({
  // Препараты — общие на org. Не фильтруем по dept: один и тот же препарат
  // может использоваться у детей и взрослых (разные дозы / возраст).
  vaccines: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.vaccine.findMany({
      where: { organizationId: ctx.user.orgId },
      include: {
        // нужно для фильтрации списка под выбранную нозологию в форме записи
        scheduleLinks: { select: { vaccineScheduleId: true } },
      },
      orderBy: { name: 'asc' },
    }),
  ),

  // Позиции календаря: только для текущего отделения + универсальные (BOTH).
  schedules: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.vaccineSchedule.findMany({
      where: {
        isActive: true,
        targetDept: { in: [ctx.dept as unknown as ScheduleScope, ScheduleScope.BOTH] },
      },
      include: { parent: true },
      orderBy: { code: 'asc' },
    }),
  ),

  // Участки — только своего отделения (через site.dept).
  districts: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.district.findMany({
      where: { site: { organizationId: ctx.user.orgId, dept: ctx.dept } },
      include: { site: true },
      orderBy: { code: 'asc' },
    }),
  ),

  medExemptionTypes: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.medExemptionType.findMany({ orderBy: { name: 'asc' } }),
  ),

  // Врачи — только своего отделения.
  doctors: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.doctor.findMany({
      where: { site: { organizationId: ctx.user.orgId, dept: ctx.dept } },
      orderBy: [{ lastName: 'asc' }],
    }),
  ),

  insurances: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.insuranceCompany.findMany({ orderBy: { name: 'asc' } }),
  ),

  riskGroups: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.riskGroup.findMany({ orderBy: { name: 'asc' } }),
  ),
})
