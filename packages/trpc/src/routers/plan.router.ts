import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'
import { buildPlanForPatient, collectSchedules, filterReportableItems, resolveCatalogIdForDistrict } from '../lib/plan-builder'

/**
 * Plan router — сборщик плана прививок.
 *
 * - `forPatient` — план для одного пациента (все позиции каталога с их статусами).
 * - `byDistrict` — превью отчёта по участку (только репорт-достойные позиции
 *   в окне дат). Используется страницей `/plan` для вывода списка перед
 *   скачиванием .docx.
 *
 * Не путать с устаревшим `vaccination.planByDistrict`, который читает из
 * пустой таблицы `VaccinationPlanItem`. Здесь план рассчитывается на лету
 * из активного каталога и истории прививок пациента.
 */
export const planRouter = router({
  forPatient: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        fromDate: z.coerce.date().optional(),
        toDate: z.coerce.date().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const patient = await ctx.prisma.patient.findFirst({
        where: { id: input.patientId, organizationId: ctx.user.orgId },
        include: {
          vaccinationRecords: { include: { vaccineSchedule: true } },
          activeMedExemption: true,
          riskGroup: { select: { name: true } },
          district: { include: { site: true } },
        },
      })
      if (!patient) throw new TRPCError({ code: 'NOT_FOUND', message: 'Пациент не найден' })

      return buildPlanForPatient(ctx.prisma, patient, { records: patient.vaccinationRecords })
    }),

  byDistrict: protectedProcedure
    .input(
      z.object({
        districtId: z.string(),
        catalogId: z.string().optional().nullable(),
        fromDate: z.coerce.date(),
        toDate: z.coerce.date(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Проверим, что участок принадлежит организации и dept'у юзера.
      const district = await ctx.prisma.district.findFirst({
        where: {
          id: input.districtId,
          site: { organizationId: ctx.user.orgId, dept: ctx.dept },
        },
        include: { site: true },
      })
      if (!district) throw new TRPCError({ code: 'NOT_FOUND', message: 'Участок не найден' })

      if (input.catalogId) {
        await ctx.prisma.catalog.findFirstOrThrow({
          where: { id: input.catalogId, scope: ctx.dept, isActive: true },
        })
      }

      const patients = await ctx.prisma.patient.findMany({
        where: {
          organizationId: ctx.user.orgId,
          districtId: input.districtId,
          isAlive: true,
        },
        include: {
          vaccinationRecords: { include: { vaccineSchedule: true } },
          activeMedExemption: true,
          riskGroup: { select: { name: true } },
          district: { include: { site: true } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })

      const catalogId = await resolveCatalogIdForDistrict(ctx.prisma, district, input.catalogId)
      const schedules = catalogId ? await collectSchedules(ctx.prisma, catalogId) : []

      const result: Array<{
        patient: {
          id: string
          lastName: string
          firstName: string
          middleName: string | null
          birthday: Date
        }
        items: Array<{
          scheduleId: string
          scheduleName: string
          scheduleFullName: string
          vaccineNames: string[]
          shortCode: string
          group: string
          dueDate: Date
          status: string
        }>
      }> = []

      for (const p of patients) {
        const all = await buildPlanForPatient(ctx.prisma, p, {
          catalogId,
          records: p.vaccinationRecords,
          schedules,
        })
        const filtered = filterReportableItems(all, input.fromDate, input.toDate)
        if (filtered.length === 0) continue
        result.push({
          patient: {
            id: p.id,
            lastName: p.lastName,
            firstName: p.firstName,
            middleName: p.middleName,
            birthday: p.birthday,
          },
          items: filtered.map((i) => {
            const scheduleFullName = [i.schedule.parent?.name, i.schedule.name]
              .filter(Boolean)
              .join(' - ')
            const vaccineNames = (i.schedule.vaccines ?? []).map((link) => {
              const vaccine = link.vaccine
              return [vaccine.tradeName || vaccine.name, vaccine.producer]
                .filter(Boolean)
                .join(', ')
            })
            return {
              scheduleId: i.schedule.id,
              scheduleName: i.schedule.name,
              scheduleFullName,
              vaccineNames,
              shortCode: i.shortCode,
              group: i.group,
              dueDate: i.dueDate,
              status: i.status,
            }
          }),
        })
      }
      return result
    }),
})
