import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@vaccitrack/trpc'
import { readDeptFromStorage } from './dept'

export const trpc = createTRPCReact<AppRouter>()

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: '/trpc',
      // headers() вызывается при каждом батч-запросе. Берём актуальный dept
      // прямо из localStorage — переключатель в шапке туда же пишет.
      headers: () => ({
        'x-dept': readDeptFromStorage(),
      }),
    }),
  ],
})
