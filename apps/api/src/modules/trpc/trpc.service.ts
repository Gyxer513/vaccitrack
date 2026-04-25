import { Injectable } from '@nestjs/common'
import * as trpcExpress from '@trpc/server/adapters/express'
import { appRouter, type Context } from '@vaccitrack/trpc'
import { prisma } from '@vaccitrack/db'
import type { Request } from 'express'

@Injectable()
export class TrpcService {
  createContext = async ({ req }: { req: Request }): Promise<Context> => {
    // Текущее отделение из заголовка (фронт берёт из DepartmentContext).
    const rawDept = String(req.headers['x-dept'] ?? '').toUpperCase()
    const dept: 'KID' | 'ADULT' = rawDept === 'ADULT' ? 'ADULT' : 'KID'

    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return { prisma, user: null, dept }

    try {
      // TODO: в проде заменить на jwks-rsa верификацию
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
      return {
        prisma,
        dept,
        user: {
          sub: payload.sub,
          login: payload.preferred_username,
          fullName: payload.name ?? payload.preferred_username,
          orgId: payload.org_id ?? payload.azp,
          roles: payload.realm_access?.roles ?? [],
        },
      }
    } catch {
      return { prisma, user: null, dept }
    }
  }

  get handler() {
    return trpcExpress.createExpressMiddleware({
      router: appRouter,
      createContext: this.createContext,
    })
  }
}
