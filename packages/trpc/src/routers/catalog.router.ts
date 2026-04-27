import { z } from 'zod'
import { router, protectedProcedure } from '../init'

/**
 * Каталоги прививок — read-only API для Phase 1.
 * CRUD + сидер 1122н прибудут в Phase 2-3.
 *
 * dept-фильтрация: пользователь видит только каталоги своего отделения
 * (по `Catalog.scope`), плюс legacy/foxpro позиции (catalogId=NULL)
 * остаются доступны через старые reference.* ручки.
 */
export const catalogRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.catalog.findMany({
      where: { scope: ctx.dept },
      include: {
        parentCatalog: { select: { id: true, name: true, region: true } },
        _count: { select: { schedules: true, childCatalogs: true } },
      },
      orderBy: [{ isActive: 'desc' }, { region: 'asc' }, { name: 'asc' }],
    }),
  ),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) =>
      ctx.prisma.catalog.findFirstOrThrow({
        where: { id: input.id, scope: ctx.dept },
        include: {
          parentCatalog: true,
          childCatalogs: { select: { id: true, name: true, region: true } },
          schedules: {
            include: { parent: { select: { id: true, name: true } } },
            orderBy: [{ parentId: 'asc' }, { code: 'asc' }],
          },
        },
      }),
    ),
})
