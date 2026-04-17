import PDFDocument from 'pdfkit'
import type { CertificateData } from '../types'

export function generateCertificate(data: CertificateData): Buffer {
  const chunks: Buffer[] = []
  const doc = new PDFDocument({ size: 'A5', margin: 25 })

  doc.on('data', (chunk: Buffer) => chunks.push(chunk))

  doc
    .fontSize(12)
    .font('Helvetica-Bold')
    .text('СЕРТИФИКАТ О ПРОФИЛАКТИЧЕСКИХ ПРИВИВКАХ', { align: 'center' })

  doc.moveDown(0.5).fontSize(9).font('Helvetica')
  doc.text(`ФИО: ${data.fullName}`)
  doc.text(`Дата рождения: ${data.birthday}`)
  doc.text(`Полис ОМС: ${data.policyNumber}`)
  doc.text(`Учреждение: ${data.lpuName}`)

  doc.moveDown()
  doc.fontSize(9).font('Helvetica-Bold').text('Сведения о прививках:')
  doc.font('Helvetica')

  data.vaccinations.forEach((v) => {
    doc.moveDown(0.3)
    doc.text(`${v.name} — ${v.date}, серия: ${v.series || '—'}, доза: ${v.dose || '—'}`)
    if (v.nextDate) doc.text(`  Следующая: ${v.nextDate}`, { indent: 10 })
  })

  doc.end()
  return Buffer.concat(chunks)
}
