import { Controller, Get, Param, Res, Req } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { DocumentsService } from './documents.service'
import type { Request, Response } from 'express'

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Get('patients/:id/form063u')
  @ApiOperation({ summary: 'Скачать форму 063/у' })
  async form063u(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const orgId = (req as any).user?.orgId ?? ''
    const buffer = await this.svc.form063u(id, orgId)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="063u_${id}.pdf"`)
    res.send(buffer)
  }

  @Get('patients/:id/certificate')
  @ApiOperation({ summary: 'Скачать сертификат о вакцинации' })
  async certificate(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const orgId = (req as any).user?.orgId ?? ''
    const buffer = await this.svc.certificate(id, orgId)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="cert_${id}.pdf"`)
    res.send(buffer)
  }
}
