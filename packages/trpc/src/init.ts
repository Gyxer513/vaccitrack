import { initTRPC, TRPCError } from '@trpc/server'
import { ZodError } from 'zod'
import type { PrismaClient } from '@vaccitrack/db'

export type Context = {
  prisma: PrismaClient
  user: {
    sub: string
    login: string
    fullName: string
    orgId: string
    roles: string[]
  } | null
}

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

export const router = t.router
export const procedure = t.procedure
export const mergeRouters = t.mergeRouters

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { user: ctx.user } })
})

export const hasRole = (role: string) =>
  t.middleware(({ ctx, next }) => {
    if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
    if (!ctx.user.roles.includes(role))
      throw new TRPCError({ code: 'FORBIDDEN', message: `Required role: ${role}` })
    return next({ ctx: { user: ctx.user } })
  })

export const publicProcedure = procedure
export const protectedProcedure = procedure.use(isAuthed)
