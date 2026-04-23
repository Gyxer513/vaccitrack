import { z } from 'zod'
import { router, protectedProcedure } from '../init'

const vaccineInput = z.object({
  name: z.string().min(1),
  tradeName: z.string().optional().nullable(),
  producer: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  dosesMl: z.number().nullable().optional(),
})

export const vaccineRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.vaccine.findMany({
      where: { organizationId: ctx.user.orgId },
      include: {
        scheduleLinks: {
          include: {
            vaccineSchedule: { include: { parent: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) =>
      ctx.prisma.vaccine.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.user.orgId },
        include: {
          scheduleLinks: {
            include: {
              vaccineSchedule: { include: { parent: true } },
            },
          },
        },
      }),
    ),

  create: protectedProcedure
    .input(vaccineInput)
    .mutation(({ ctx, input }) =>
      ctx.prisma.vaccine.create({
        data: {
          ...input,
          organizationId: ctx.user.orgId,
        },
      }),
    ),

  update: protectedProcedure
    .input(z.object({ id: z.string(), data: vaccineInput.partial() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.vaccine.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.user.orgId },
      })
      return ctx.prisma.vaccine.update({
        where: { id: input.id },
        data: input.data,
      })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.vaccine.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.user.orgId },
      })
      // Каскадно удаляем links; записи вакцинации сохраняем, обнуляя vaccineId.
      await ctx.prisma.vaccineScheduleLink.deleteMany({
        where: { vaccineId: input.id },
      })
      await ctx.prisma.vaccinationRecord.updateMany({
        where: { vaccineId: input.id },
        data: { vaccineId: null },
      })
      return ctx.prisma.vaccine.delete({ where: { id: input.id } })
    }),

  // Атомарно устанавливает полный список связанных schedules.
  setSchedules: protectedProcedure
    .input(z.object({
      vaccineId: z.string(),
      scheduleIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.vaccine.findFirstOrThrow({
        where: { id: input.vaccineId, organizationId: ctx.user.orgId },
      })
      await ctx.prisma.$transaction([
        ctx.prisma.vaccineScheduleLink.deleteMany({
          where: { vaccineId: input.vaccineId },
        }),
        ctx.prisma.vaccineScheduleLink.createMany({
          data: input.scheduleIds.map((scheduleId) => ({
            vaccineId: input.vaccineId,
            vaccineScheduleId: scheduleId,
          })),
        }),
      ])
      return { ok: true }
    }),
})
