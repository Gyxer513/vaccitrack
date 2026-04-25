import { Controller, Get, Inject, Param, Res, Req } from '@nestjs/common'
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
  // tsx/esbuild не эмитит emitDecoratorMetadata → Nest не может
  // резолвить тип конструктора по рефлексии. @Inject с явным токеном
  // работает без метадаты.
  constructor(@Inject(DocumentsService) private readonly svc: DocumentsService) {}

  @Get('patients/:id/form063u')
  @ApiOperation({ summary: 'Скачать форму 063/у (PDF)' })
  async form063u(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const buffer = await this.svc.form063u(id, resolveOrgId(req))
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="063u_${id}.pdf"`)
    res.send(buffer)
  }

  @Get('patients/:id/form063u.docx')
  @ApiOperation({ summary: 'Скачать форму 063/у (Word)' })
  async form063uDocx(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const buffer = await this.svc.form063uDocx(id, resolveOrgId(req))
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="063u_${id}.docx"`)
    res.send(buffer)
  }

  @Get('patients/:id/certificate.docx')
  @ApiOperation({ summary: 'Скачать сертификат о профилактических прививках (Word)' })
  async certificateDocx(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const buffer = await this.svc.certificateDocx(id, resolveOrgId(req))
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="certificate_${id}.docx"`)
    res.send(buffer)
  }
}
