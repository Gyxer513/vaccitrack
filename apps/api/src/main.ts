import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import * as trpcExpress from '@trpc/server/adapters/express'
import { appRouter } from '@vaccitrack/trpc'
import { prisma } from '@vaccitrack/db'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
  app.setGlobalPrefix('api/v1')
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' })

  // tRPC смонтирован ДО префикса на /trpc — отдельно от Nest-роутера.
  app.use(
    '/trpc',
    trpcExpress.createExpressMiddleware({
      router: appRouter,
      createContext: ({ req }) => {
        const token = req.headers.authorization?.split(' ')[1]

        // Dev bypass: без токена подставляем фиктивного пользователя с DEV_ORG_ID.
        const devFallback = () => {
          if (process.env.NODE_ENV === 'production' || !process.env.DEV_ORG_ID) {
            return { prisma, user: null }
          }
          return {
            prisma,
            user: {
              sub: 'dev-user',
              login: 'dev',
              fullName: 'Dev User',
              orgId: process.env.DEV_ORG_ID,
              roles: ['admin', 'doctor', 'nurse', 'registrar'],
            },
          }
        }

        if (!token) return devFallback()
        try {
          const payload = JSON.parse(
            Buffer.from(token.split('.')[1], 'base64').toString(),
          )
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
          return devFallback()
        }
      },
    }),
  )

  // Swagger требует emitDecoratorMetadata, которое tsx (esbuild) не эмитит.
  // Включается только в prod-сборке через nest build.
  if (process.env.NODE_ENV === 'production') {
    const config = new DocumentBuilder()
      .setTitle('VacciTrack API')
      .setDescription('REST API для внешних интеграций (МИС, партнёры)')
      .setVersion('1.0')
      .addBearerAuth()
      .build()
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config))
  }

  await app.listen(process.env.PORT ?? 3001)
  console.log(`API running on http://localhost:${process.env.PORT ?? 3001}`)
  console.log(`tRPC available at /trpc`)
  if (process.env.NODE_ENV === 'production') {
    console.log(`Swagger docs at /api/docs`)
  }
}

bootstrap()
