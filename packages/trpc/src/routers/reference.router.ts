import { router, protectedProcedure } from '../init'

export const referenceRouter = router({
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

  schedules: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.vaccineSchedule.findMany({
      where: { isActive: true },
      include: { parent: true },
      orderBy: { code: 'asc' },
    }),
  ),

  districts: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.district.findMany({
      where: { site: { organizationId: ctx.user.orgId } },
      include: { site: true },
      orderBy: { code: 'asc' },
    }),
  ),

  medExemptionTypes: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.medExemptionType.findMany({ orderBy: { name: 'asc' } }),
  ),

  doctors: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.doctor.findMany({
      where: { site: { organizationId: ctx.user.orgId } },
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
