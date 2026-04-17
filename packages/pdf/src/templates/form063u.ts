import PDFDocument from 'pdfkit'
import type { Form063Data } from '../types'

export function generateForm063u(data: Form063Data): Buffer {
  const chunks: Buffer[] = []
  const doc = new PDFDocument({ size: 'A4', margin: 30, font: 'Helvetica' })

  doc.on('data', (chunk: Buffer) => chunks.push(chunk))

  doc.fontSize(7).text(`Код формы по ОКУД ${data.okud}`, 380, 30, { width: 180, align: 'right' })
  doc.text(`Код учреждения по ОКПО ${data.okpo}`, 380, 40, { width: 180, align: 'right' })

  doc
    .fontSize(10)
    .font('Helvetica-Bold')
    .text('МИНИСТЕРСТВО ЗДРАВООХРАНЕНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ', 30, 60, { align: 'center' })
  doc.fontSize(9).font('Helvetica').text(data.lpuName, 30, 75, { align: 'center' })

  doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .text('КАРТА ПРОФИЛАКТИЧЕСКИХ ПРИВИВОК', 30, 100, { align: 'center' })
  doc.fontSize(8).font('Helvetica').text('Форма № 063/у', 30, 115, { align: 'center' })

  doc.fontSize(9).font('Helvetica')
  const y = 135
  doc.text(`Фамилия, имя, отчество: ${data.fullName}`, 30, y)
  doc.text(`Дата рождения: ${data.birthday}`, 30, y + 14)
  doc.text(`Пол: ${data.sex}`, 200, y + 14)
  doc.text(`Адрес: ${data.address}`, 30, y + 28)
  doc.text(`Полис: ${data.policySerial} ${data.policyNumber}`, 30, y + 42)

  const tableTop = y + 65
  const colWidths = [130, 45, 60, 65, 65, 80, 65]
  const headers = ['Наименование прививки', 'Доза', 'Возраст', 'Дата', 'Серия', 'Врач', 'Результат']
  const colX = colWidths.reduce<number[]>((acc, w, i) => {
    acc.push(i === 0 ? 30 : acc[i - 1] + colWidths[i - 1])
    return acc
  }, [])

  doc.fontSize(7).font('Helvetica-Bold')
  headers.forEach((h, i) => {
    doc.rect(colX[i], tableTop, colWidths[i], 24).stroke()
    doc.text(h, colX[i] + 2, tableTop + 7, { width: colWidths[i] - 4, align: 'center' })
  })

  doc.font('Helvetica')
  data.vaccinations.forEach((row, idx) => {
    const rowY = tableTop + 24 + idx * 18
    const cells = [
      row.scheduleName,
      row.doseKey,
      row.ageLabel,
      row.date,
      row.series,
      row.doctorName,
      row.result,
    ]
    cells.forEach((cell, i) => {
      doc.rect(colX[i], rowY, colWidths[i], 18).stroke()
      doc.text(cell || '', colX[i] + 2, rowY + 5, { width: colWidths[i] - 4, align: 'center' })
    })
  })

  doc.end()
  return Buffer.concat(chunks)
}
