import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
  app.setGlobalPrefix('api/v1')
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' })

  const config = new DocumentBuilder()
    .setTitle('VacciTrack API')
    .setDescription('REST API для внешних интеграций (МИС, партнёры)')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config))

  await app.listen(process.env.PORT ?? 3001)
  console.log(`API running on http://localhost:${process.env.PORT ?? 3001}`)
  console.log(`tRPC available at /trpc`)
  console.log(`Swagger docs at /api/docs`)
}

bootstrap()
