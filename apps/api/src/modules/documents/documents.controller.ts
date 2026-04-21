import { Controller, Get, Param, Res, Req } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { DocumentsService } from './documents.service'
import type { Request, Response } from 'express'

// Пока Keycloak не подключён — извлекаем orgId из JWT claims вручную,
// с фолбэком на DEV_ORG_ID (та же логика, что и в tRPC context).
function resolveOrgId(req: Request): string {
  const token = req.headers.authorization?.split(' ')[1]
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
      const id = payload.org_id ?? payload.azp
      if (id) return id
    } catch {
      /* пустой токен или битый — падаем в dev fallback */
    }
  }
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_ORG_ID) {
    return process.env.DEV_ORG_ID
  }
  return ''
}

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Get('patients/:id/form063u')
  @ApiOperation({ summary: 'Скачать форму 063/у' })
  async form063u(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const buffer = await this.svc.form063u(id, resolveOrgId(req))
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="063u_${id}.pdf"`)
    res.send(buffer)
  }

  @Get('patients/:id/certificate')
  @ApiOperation({ summary: 'Скачать сертификат о вакцинации' })
  async certificate(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const buffer = await this.svc.certificate(id, resolveOrgId(req))
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="cert_${id}.pdf"`)
    res.send(buffer)
  }
}
