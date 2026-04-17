import { Module } from '@nestjs/common'
import { TrpcController } from './trpc.controller'
import { TrpcService } from './trpc.service'

@Module({
  controllers: [TrpcController],
  providers: [TrpcService],
})
export class TrpcModule {}
