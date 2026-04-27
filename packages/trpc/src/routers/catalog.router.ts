import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'

/**
 * Каталоги прививок — CRUD-API.
 *
 * dept-фильтрация: пользователь видит и правит только каталоги своего
 * отделения (через `Catalog.scope`), плюс legacy/foxpro позиции
 * (catalogId=NULL) остаются доступны через старые reference.* ручки.
 *
 * Phase 2: добавили create / update / delete / setActiveForSite —
 * UI редактирования в SettingsPage.tsx → CatalogsSection.
 */
export const catalogRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.catalog.findMany({
      where: { scope: ctx.dept },
      include: {
        parentCatalog: { select: { id: true, name: true, region: true } },
        // activeForSites + childCatalogs нужны UI'ю чтобы блокировать
        // удаление каталога, на котором что-то висит.
        _count: {
          select: {
            schedules: true,
            childCatalogs: true,
            activeForSites: true,
          },
        },
        // Нужно для бейджа «Активен для отделения» — какие сайты юзера
        // его выбрали. Возвращаем минимум полей.
        activeForSites: {
          where: { organizationId: ctx.user.orgId, dept: ctx.dept },
          select: { id: true, name: true },
        },
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

  // Создание: scope автоматически = ctx.dept (юзер не может создать
  // каталог чужого отделения). parentCatalogId, если задан, должен
  // принадлежать тому же scope — иначе цепочка наследования получится
  // межотделенческой.
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        region: z.string().min(1),
        approvalRef: z.string().optional(),
        parentCatalogId: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.parentCatalogId) {
        await ctx.prisma.catalog.findFirstOrThrow({
          where: { id: input.parentCatalogId, scope: ctx.dept },
        })
      }
      return ctx.prisma.catalog.create({
        data: {
          name: input.name,
          region: input.region,
          scope: ctx.dept,
          approvalRef: input.approvalRef,
          parentCatalogId: input.parentCatalogId ?? null,
        },
      })
    }),

  // Обновление: scope не меняется (он задаётся при create).
  // Перед update проверяем, что каталог принадлежит ctx.dept.
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: z
          .object({
            name: z.string().min(1).optional(),
            region: z.string().min(1).optional(),
            approvalRef: z.string().nullable().optional(),
            validFrom: z.coerce.date().nullable().optional(),
            validTo: z.coerce.date().nullable().optional(),
            isActive: z.boolean().optional(),
            parentCatalogId: z.string().nullable().optional(),
          })
          .partial(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.catalog.findFirstOrThrow({
        where: { id: input.id, scope: ctx.dept },
      })
      // parent тоже должен быть в том же scope (или null — снять связь).
      if (input.data.parentCatalogId) {
        if (input.data.parentCatalogId === input.id) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Каталог не может расширять сам себя',
          })
        }
        await ctx.prisma.catalog.findFirstOrThrow({
          where: { id: input.data.parentCatalogId, scope: ctx.dept },
        })
      }
      return ctx.prisma.catalog.update({
        where: { id: input.id },
        data: input.data,
      })
    }),

  // Удаление: блокируется, если на каталоге висят позиции календаря,
  // если он активен на каком-то сайте, или если его расширяют другие
  // каталоги (parentCatalog цепочка).
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const catalog = await ctx.prisma.catalog.findFirstOrThrow({
        where: { id: input.id, scope: ctx.dept },
        include: {
          _count: {
            select: {
              schedules: true,
              activeForSites: true,
              childCatalogs: true,
            },
          },
        },
      })
      if (catalog._count.schedules > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `На каталоге «${catalog.name}» ${catalog._count.schedules} позиций — удалите или перенесите их сначала`,
        })
      }
      if (catalog._count.activeForSites > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Каталог «${catalog.name}» активен на ${catalog._count.activeForSites} сайт(ах) — снимите активацию сначала`,
        })
      }
      if (catalog._count.childCatalogs > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Каталог «${catalog.name}» расширяют ${catalog._count.childCatalogs} других каталог(ов) — отвяжите их сначала`,
        })
      }
      return ctx.prisma.catalog.delete({ where: { id: input.id } })
    }),

  // Назначить активным каталогом для сайта. catalogId=null означает
  // «снять активный каталог». Проверяем, что site принадлежит организации
  // юзера и его dept совпадает со scope каталога.
  setActiveForSite: protectedProcedure
    .input(
      z.object({
        siteId: z.string(),
        catalogId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const site = await ctx.prisma.site.findFirstOrThrow({
        where: {
          id: input.siteId,
          organizationId: ctx.user.orgId,
        },
      })
      if (input.catalogId) {
        const catalog = await ctx.prisma.catalog.findFirstOrThrow({
          where: { id: input.catalogId, scope: ctx.dept },
        })
        if (catalog.scope !== site.dept) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Каталог и сайт принадлежат разным отделениям',
          })
        }
      }
      return ctx.prisma.site.update({
        where: { id: input.siteId },
        data: { activeCatalogId: input.catalogId },
      })
    }),
})
