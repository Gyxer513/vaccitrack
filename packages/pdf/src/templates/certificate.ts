import PDFDocument from 'pdfkit'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CertificateData } from '../types'

const fontsDir = resolve(__dirname, '..', '..', 'fonts')
const FONT_REGULAR = readFileSync(resolve(fontsDir, 'DejaVuSans.ttf'))
const FONT_BOLD = readFileSync(resolve(fontsDir, 'DejaVuSans-Bold.ttf'))

export function generateCertificate(data: CertificateData): Buffer {
  const chunks: Buffer[] = []
  const doc = new PDFDocument({ size: 'A5', margin: 30 })

  doc.registerFont('body', FONT_REGULAR)
  doc.registerFont('bold', FONT_BOLD)

  doc.on('data', (chunk: Buffer) => chunks.push(chunk))

  doc.font('bold').fontSize(13)
    .text('СЕРТИФИКАТ О ПРОФИЛАКТИЧЕСКИХ ПРИВИВКАХ', { align: 'center' })
  doc.moveDown(0.2).font('body').fontSize(8)
    .text(data.lpuName, { align: 'center' })

  doc.moveDown(0.8).fontSize(9)
  kv(doc, 'ФИО', data.fullName)
  kv(doc, 'Дата рождения', data.birthday)
  kv(doc, 'Полис ОМС', data.policyNumber || '—')

  doc.moveDown(0.6).font('bold').fontSize(10).text('Сведения о прививках')
  doc.moveDown(0.2).font('body').fontSize(9)

  if (data.vaccinations.length === 0) {
    doc.fillColor('#888').text('Прививок нет', { align: 'center' }).fillColor('#000')
  } else {
    for (const v of data.vaccinations) {
      const parts = [
        v.name || '—',
        v.date,
        v.series ? `серия ${v.series}` : null,
        v.dose ? `доза ${v.dose}` : null,
      ].filter(Boolean).join(' · ')
      doc.text(`• ${parts}`)
      if (v.nextDate) {
        doc.fillColor('#666').fontSize(8).text(`   следующая: ${v.nextDate}`)
          .fillColor('#000').fontSize(9)
      }
    }
  }

  doc.moveDown(1.2).fontSize(8).fillColor('#666')
    .text(`Выдано: ${new Date().toLocaleDateString('ru-RU')}`, { align: 'right' })
    .fillColor('#000')

  doc.end()
  return Buffer.concat(chunks)
}

function kv(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc.font('body').fillColor('#666').text(`${label}: `, { continued: true })
    .fillColor('#000').font('bold').text(value)
    .font('body')
}
