import { z } from 'zod'
import { router, protectedProcedure } from '../init'

// Возрастные/интервальные поля — без часов (пользователю не нужно).
const scheduleAgeFields = z.object({
  minAgeYears: z.number().int().min(0).optional(),
  minAgeMonths: z.number().int().min(0).max(11).optional(),
  minAgeDays: z.number().int().min(0).max(31).optional(),
  maxAgeYears: z.number().int().min(0).optional(),
  maxAgeMonths: z.number().int().min(0).max(11).optional(),
  maxAgeDays: z.number().int().min(0).max(31).optional(),
  intervalYears: z.number().int().min(0).optional(),
  intervalMonths: z.number().int().min(0).max(11).optional(),
  intervalDays: z.number().int().min(0).optional(),
})

const scheduleCreateInput = z.object({
  name: z.string().min(1),
  shortName: z.string().optional(),
  parentId: z.string().optional().nullable(),
  isEpid: z.boolean().optional(),
}).merge(scheduleAgeFields)

export const scheduleRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.vaccineSchedule.findMany({
      where: { isActive: true },
      include: { parent: true },
      orderBy: [{ parentId: 'asc' }, { code: 'asc' }],
    }),
  ),

  update: protectedProcedure
    .input(z.object({ id: z.string(), data: scheduleAgeFields }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.vaccineSchedule.update({
        where: { id: input.id },
        data: input.data,
      }),
    ),

  create: protectedProcedure
    .input(scheduleCreateInput)
    .mutation(({ ctx, input }) =>
      ctx.prisma.vaccineSchedule.create({
        data: {
          ...input,
          // code — служебное поле из FoxPro. Для новых генерим простой uid-подобный ключ.
          code: `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          isActive: true,
        },
      }),
    ),
})
