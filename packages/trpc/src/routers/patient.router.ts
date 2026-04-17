import { z } from 'zod'
import { router, protectedProcedure } from '../init'
import { Sex } from '@vaccitrack/db'

const patientCreateSchema = z.object({
  lastName: z.string().min(1),
  firstName: z.string().min(1),
  middleName: z.string().optional(),
  sex: z.nativeEnum(Sex),
  birthday: z.coerce.date(),
  districtId: z.string().optional(),
  phone: z.string().optional(),
  cityName: z.string().optional(),
  streetName: z.string().optional(),
  house: z.string().optional(),
  apartment: z.string().optional(),
  policySerial: z.string().optional(),
  policyNumber: z.string().optional(),
  insuranceId: z.string().optional(),
  riskGroupId: z.string().optional(),
  isDecret: z.boolean().default(false),
})

export const patientRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        districtId: z.string().optional(),
        page: z.number().default(1),
        perPage: z.number().default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { search, districtId, page, perPage } = input
      const where = {
        organizationId: ctx.user.orgId,
        isAlive: true,
        ...(districtId && { districtId }),
        ...(search && {
          OR: [
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { middleName: { contains: search, mode: 'insensitive' as const } },
            { policyNumber: { contains: search } },
          ],
        }),
      }
      const [items, total] = await Promise.all([
        ctx.prisma.patient.findMany({
          where,
          include: {
            district: true,
            activeMedExemption: { include: { medExemptionType: true } },
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        ctx.prisma.patient.count({ where }),
      ])
      return { items, total, pages: Math.ceil(total / perPage) }
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.patient.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.user.orgId },
        include: {
          district: true,
          riskGroup: true,
          insurance: true,
          medExemptions: {
            include: { medExemptionType: true },
            orderBy: { dateFrom: 'desc' },
          },
          vaccinationRecords: {
            include: { vaccine: true, vaccineSchedule: true, doctor: true },
            orderBy: { vaccinationDate: 'desc' },
          },
          planItems: {
            include: { vaccineSchedule: true },
            orderBy: { plannedDate: 'asc' },
          },
        },
      })
    }),

  create: protectedProcedure
    .input(patientCreateSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.patient.create({
        data: { ...input, organizationId: ctx.user.orgId, createdByLogin: ctx.user.login },
      })
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), data: patientCreateSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.patient.update({
        where: { id: input.id, organizationId: ctx.user.orgId },
        data: input.data,
      })
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.patient.update({
        where: { id: input.id, organizationId: ctx.user.orgId },
        data: { isAlive: false },
      })
    }),
})
