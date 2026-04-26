import { z } from 'zod'
import { TRPCError } from '@trpc/server'
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
  // Включаем `_count` пациентов и врачей: используется на странице настроек,
  // чтобы показать «сколько пациентов на участке» и блокировать удаление.
  districts: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.district.findMany({
      where: { site: { organizationId: ctx.user.orgId, dept: ctx.dept } },
      include: {
        site: true,
        _count: { select: { patients: true, doctors: true } },
      },
      orderBy: { code: 'asc' },
    }),
  ),

  // Создать участок в site текущего dept.
  // siteId резолвится через "первый site организации в нужном отделении" —
  // на MVP в каждой паре (org, dept) ровно один site (см. seed/миграцию).
  districtCreate: protectedProcedure
    .input(z.object({ name: z.string().min(1), code: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const site = await ctx.prisma.site.findFirstOrThrow({
        where: { organizationId: ctx.user.orgId, dept: ctx.dept },
      })
      return ctx.prisma.district.create({
        data: { siteId: site.id, code: input.code, name: input.name },
      })
    }),

  // Обновить участок (имя/код). Проверяем dept site'а — нельзя через API
  // подменить чужой dept-участок (KID не правит ADULT и наоборот).
  districtUpdate: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          name: z.string().min(1).optional(),
          code: z.string().min(1).optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.district.findFirstOrThrow({
        where: {
          id: input.id,
          site: { organizationId: ctx.user.orgId, dept: ctx.dept },
        },
      })
      return ctx.prisma.district.update({
        where: { id: input.id },
        data: input.data,
      })
    }),

  // Удалить участок. Блокируем, если на нём висят пациенты или есть линки врачей.
  districtDelete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const district = await ctx.prisma.district.findFirstOrThrow({
        where: {
          id: input.id,
          site: { organizationId: ctx.user.orgId, dept: ctx.dept },
        },
        include: {
          _count: { select: { patients: true, doctors: true } },
        },
      })
      if (district._count.patients > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'На участке есть пациенты',
        })
      }
      if (district._count.doctors > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'К участку привязаны врачи',
        })
      }
      return ctx.prisma.district.delete({ where: { id: input.id } })
    }),

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
