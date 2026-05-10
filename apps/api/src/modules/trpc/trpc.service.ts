import { Injectable } from '@nestjs/common'
import * as trpcExpress from '@trpc/server/adapters/express'
import { appRouter, resolveAuthorizedDepartment, type Context } from '@vaccitrack/trpc'
import { prisma } from '@vaccitrack/db'
import type { Request } from 'express'

@Injectable()
export class TrpcService {
  createContext = async ({ req }: { req: Request }): Promise<Context> => {
    const rawDept = String(req.headers['x-dept'] ?? '').toUpperCase()
    const dept: 'KID' | 'ADULT' = rawDept === 'ADULT' ? 'ADULT' : 'KID'

    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return { prisma, user: null, dept }

    let payload: any
    try {
      payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    } catch {
      return { prisma, user: null, dept }
    }

    const roles = payload.realm_access?.roles ?? []
    const authorizedDept = resolveAuthorizedDepartment(dept, roles)
    return {
      prisma,
      dept: authorizedDept,
      user: {
        sub: payload.sub,
        login: payload.preferred_username,
        fullName: payload.name ?? payload.preferred_username,
        orgId: payload.org_id ?? payload.azp,
        roles,
      },
    }
  }

  get handler() {
    return trpcExpress.createExpressMiddleware({
      router: appRouter,
      createContext: this.createContext,
    })
  }
}
