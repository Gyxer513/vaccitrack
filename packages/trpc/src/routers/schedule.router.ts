import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'
import { ScheduleScope, Sex } from '@vaccitrack/db'

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

// Поля «условий применимости» — общие для create/update.
const scheduleConditionFields = z.object({
  shortName: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  isEpid: z.boolean().optional(),
  isEpidContact: z.boolean().optional(),
  isCatchUp: z.boolean().optional(),
  catchUpMaxAgeYears: z.number().int().min(0).nullable().optional(),
  appliesToSex: z.nativeEnum(Sex).nullable().optional(),
})

const scheduleCreateInput = z
  .object({
    name: z.string().min(1),
    catalogId: z.string().optional().nullable(),
  })
  .merge(scheduleAgeFields)
  .merge(scheduleConditionFields)

const scheduleUpdateData = z
  .object({
    name: z.string().min(1).optional(),
  })
  .merge(scheduleAgeFields)
  .merge(scheduleConditionFields)

export const scheduleRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    // Включаем неактивные тоже — корневые записи (сами нозологии) в FoxPro
    // были L_PRIV=False, т.к. это не процедуры, а категории. UI сам
    // фильтрует их где не нужны (в списке «Добавить процедуру»).
    // Фильтр по dept: своё отделение + универсальные (BOTH).
    ctx.prisma.vaccineSchedule.findMany({
      where: {
        targetDept: { in: [ctx.dept as unknown as ScheduleScope, ScheduleScope.BOTH] },
      },
      include: { parent: true },
      orderBy: [{ parentId: 'asc' }, { code: 'asc' }],
    }),
  ),

  // Обновление позиции каталога. Принимает полный набор полей —
  // возрастные, интервальные, условия применимости (sex/epid/catchUp),
  // ссылку на parent. Перед update проверяем, что позиция принадлежит
  // либо legacy (catalogId=null), либо каталогу того же scope, что и
  // текущее отделение пользователя — иначе можно подменить чужой
  // каталог через id.
  update: protectedProcedure
    .input(z.object({ id: z.string(), data: scheduleUpdateData }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.vaccineSchedule.findFirstOrThrow({
        where: {
          id: input.id,
          OR: [
            { catalogId: null },
            { catalog: { scope: ctx.dept } },
          ],
        },
      })
      // parentId, если задан, должен принадлежать тому же каталогу,
      // что и редактируемая позиция (нельзя цепануть позицию из чужого
      // каталога/scope как parent-нозологию).
      if (input.data.parentId) {
        if (input.data.parentId === input.id) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Позиция не может быть собственной нозологией',
          })
        }
        await ctx.prisma.vaccineSchedule.findFirstOrThrow({
          where: {
            id: input.data.parentId,
            catalogId: existing.catalogId,
          },
        })
      }
      return ctx.prisma.vaccineSchedule.update({
        where: { id: input.id },
        data: input.data,
      })
    }),

  // Создание позиции. Если catalogId задан — создаём в нём (с проверкой
  // что scope каталога совпадает с ctx.dept). Если нет — создаём как
  // legacy (catalogId=null), targetDept=ctx.dept (как было).
  create: protectedProcedure
    .input(scheduleCreateInput)
    .mutation(async ({ ctx, input }) => {
      const { catalogId, parentId, ...rest } = input
      let resolvedCatalogId: string | null = null
      if (catalogId) {
        // Проверяем scope каталога — нельзя создавать позицию в чужом dept'е.
        await ctx.prisma.catalog.findFirstOrThrow({
          where: { id: catalogId, scope: ctx.dept },
        })
        resolvedCatalogId = catalogId
      }
      // parent должен лежать в том же каталоге, что и создаваемая позиция.
      if (parentId) {
        await ctx.prisma.vaccineSchedule.findFirstOrThrow({
          where: { id: parentId, catalogId: resolvedCatalogId },
        })
      }
      return ctx.prisma.vaccineSchedule.create({
        data: {
          ...rest,
          parentId: parentId ?? null,
          // code — служебное поле из FoxPro. Для новых генерим простой uid-подобный ключ.
          code: `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          isActive: input.isActive ?? true,
          // Создаваемая через UI позиция привязывается к текущему отделению.
          targetDept: ctx.dept as unknown as ScheduleScope,
          catalogId: resolvedCatalogId,
        },
      })
    }),

  // Удаление: блокируется, если на позиции висят VaccinationRecord
  // (реальные записи прививок пациентов). Линки на вакцины
  // (VaccineScheduleLink) удаляем каскадно сначала.
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await ctx.prisma.vaccineSchedule.findFirstOrThrow({
        where: {
          id: input.id,
          OR: [
            { catalogId: null },
            { catalog: { scope: ctx.dept } },
          ],
        },
      })
      const recordCount = await ctx.prisma.vaccinationRecord.count({
        where: { vaccineScheduleId: schedule.id },
      })
      if (recordCount > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `На позиции «${schedule.name}» есть записи прививок — ${recordCount} шт. Удаление запрещено.`,
        })
      }
      // Дочерние позиции (которые ссылаются на эту как на нозологию).
      const childCount = await ctx.prisma.vaccineSchedule.count({
        where: { parentId: schedule.id },
      })
      if (childCount > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `«${schedule.name}» — нозология, у неё ${childCount} дочерних позиций. Сначала удалите их.`,
        })
      }
      // План пациентов (VaccinationPlanItem).
      const planCount = await ctx.prisma.vaccinationPlanItem.count({
        where: { vaccineScheduleId: schedule.id },
      })
      if (planCount > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `На позиции «${schedule.name}» висят пункты плана прививок (${planCount}). Сначала очистите план.`,
        })
      }
      // Линки с вакцинами — удаляем каскадно.
      await ctx.prisma.vaccineScheduleLink.deleteMany({
        where: { vaccineScheduleId: schedule.id },
      })
      return ctx.prisma.vaccineSchedule.delete({ where: { id: schedule.id } })
    }),
})
