import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TrpcModule } from './modules/trpc/trpc.module'
import { DocumentsModule } from './modules/documents/documents.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TrpcModule,
    DocumentsModule,
  ],
})
export class AppModule {}
