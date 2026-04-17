import { All, Controller, Req, Res, Next } from '@nestjs/common'
import { TrpcService } from './trpc.service'
import type { Request, Response, NextFunction } from 'express'

@Controller('trpc')
export class TrpcController {
  constructor(private readonly trpc: TrpcService) {}

  @All('*')
  async handle(@Req() req: Request, @Res() res: Response, @Next() next: NextFunction) {
    this.trpc.handler(req, res, next)
  }
}
