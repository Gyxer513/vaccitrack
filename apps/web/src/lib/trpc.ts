import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@vaccitrack/trpc'
import { keycloak } from './keycloak'

export const trpc = createTRPCReact<AppRouter>()

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: '/trpc',
      async headers() {
        const token = keycloak.token
        return token ? { Authorization: `Bearer ${token}` } : {}
      },
    }),
  ],
})
