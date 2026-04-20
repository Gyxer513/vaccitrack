import { z } from 'zod'
import { router, protectedProcedure } from '../init'
import { PlanStatus } from '@vaccitrack/db'

export const vaccinationRouter = router({
  record: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        vaccineScheduleId: z.string().optional(),
        vaccineId: z.string().optional(),
        vaccinationDate: z.coerce.date(),
        series: z.string().optional(),
        doseNumber: z.number().optional(),
        doseVolumeMl: z.number().optional(),
        result: z.string().optional(),
        note: z.string().optional(),
        doctorId: z.string().optional(),
        isEpid: z.boolean().default(false),
        isExternal: z.boolean().default(false),
        nextScheduledDate: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.patient.findFirstOrThrow({
        where: { id: input.patientId, organizationId: ctx.user.orgId },
      })

      const record = await ctx.prisma.vaccinationRecord.create({
        data: { ...input, createdById: ctx.user.sub },
      })

      if (input.vaccineScheduleId) {
        await ctx.prisma.vaccinationPlanItem.updateMany({
          where: {
            patientId: input.patientId,
            vaccineScheduleId: input.vaccineScheduleId,
          },
          data: { status: PlanStatus.DONE },
        })
      }

      return record
    }),

  exempt: protectedProcedure
    .input(
      z.object({
        patientId: z.string(),
        vaccineScheduleId: z.string().optional(),
        medExemptionTypeId: z.string(),
        dateFrom: z.coerce.date(),
        dateTo: z.coerce.date().optional(),
        note: z.string().optional(),
        doctorId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.patient.findFirstOrThrow({
        where: { id: input.patientId, organizationId: ctx.user.orgId },
      })

      const exemption = await ctx.prisma.patientMedExemption.create({
        data: {
          patientId: input.patientId,
          medExemptionTypeId: input.medExemptionTypeId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          note: input.note,
        },
      })

      // Считаем этот отвод активным только если он бессрочный или ещё не истёк.
      const isActive = !input.dateTo || input.dateTo >= new Date()
      if (isActive) {
        await ctx.prisma.patient.update({
          where: { id: input.patientId },
          data: { activeMedExemptionId: exemption.id },
        })
      }

      if (input.vaccineScheduleId) {
        await ctx.prisma.vaccinationPlanItem.updateMany({
          where: {
            patientId: input.patientId,
            vaccineScheduleId: input.vaccineScheduleId,
          },
          data: { status: PlanStatus.EXEMPTED },
        })
      }

      return exemption
    }),

  journalByDistrict: protectedProcedure
    .input(
      z.object({
        districtId: z.string(),
        dateFrom: z.coerce.date(),
        dateTo: z.coerce.date(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.vaccinationRecord.findMany({
        where: {
          vaccinationDate: { gte: input.dateFrom, lte: input.dateTo },
          patient: { organizationId: ctx.user.orgId, districtId: input.districtId },
        },
        include: {
          patient: {
            select: {
              id: true,
              lastName: true,
              firstName: true,
              middleName: true,
              birthday: true,
            },
          },
          vaccine: true,
          vaccineSchedule: true,
          doctor: true,
        },
        orderBy: { vaccinationDate: 'asc' },
      })
    }),

  planByDistrict: protectedProcedure
    .input(
      z.object({
        districtId: z.string(),
        month: z.number().min(1).max(12),
        year: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const dateFrom = new Date(input.year, input.month - 1, 1)
      const dateTo = new Date(input.year, input.month, 0)
      return ctx.prisma.vaccinationPlanItem.findMany({
        where: {
          plannedDate: { gte: dateFrom, lte: dateTo },
          patient: { organizationId: ctx.user.orgId, districtId: input.districtId },
          status: { in: [PlanStatus.PLANNED, PlanStatus.OVERDUE] },
        },
        include: { patient: true, vaccineSchedule: true },
        orderBy: { plannedDate: 'asc' },
      })
    }),
})
