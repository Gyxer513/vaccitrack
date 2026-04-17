import { Injectable } from '@nestjs/common'
import * as trpcExpress from '@trpc/server/adapters/express'
import { appRouter, type Context } from '@vaccitrack/trpc'
import { prisma } from '@vaccitrack/db'
import type { Request } from 'express'

@Injectable()
export class TrpcService {
  createContext = async ({ req }: { req: Request }): Promise<Context> => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return { prisma, user: null }

    try {
      // TODO: в проде заменить на jwks-rsa верификацию
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
      return {
        prisma,
        user: {
          sub: payload.sub,
          login: payload.preferred_username,
          fullName: payload.name ?? payload.preferred_username,
          orgId: payload.org_id ?? payload.azp,
          roles: payload.realm_access?.roles ?? [],
        },
      }
    } catch {
      return { prisma, user: null }
    }
  }

  get handler() {
    return trpcExpress.createExpressMiddleware({
      router: appRouter,
      createContext: this.createContext,
    })
  }
}
