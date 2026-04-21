import PDFDocument from 'pdfkit'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Form063Data, Form063Row, Form063OtherRow } from '../types'

// DejaVu Sans — open-source TTF с Cyrillic. Положен в packages/pdf/fonts/.
// В CJS сборке tsx/tsc — __dirname = packages/pdf/src/templates, поднимаемся на 2 уровня.
const fontsDir = resolve(__dirname, '..', '..', 'fonts')
const FONT_REGULAR = readFileSync(resolve(fontsDir, 'DejaVuSans.ttf'))
const FONT_BOLD = readFileSync(resolve(fontsDir, 'DejaVuSans-Bold.ttf'))

const PAGE_MARGIN = 30
const PAGE_WIDTH = 595.28  // A4 pts
const CONTENT_W = PAGE_WIDTH - PAGE_MARGIN * 2

export function generateForm063u(data: Form063Data): Promise<Buffer> {
  const chunks: Buffer[] = []
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN })
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  doc.registerFont('body', FONT_REGULAR)
  doc.registerFont('bold', FONT_BOLD)
  doc.font('body')

  /* ——— шапка ——— */
  doc.fontSize(7)
    .text(`Код формы по ОКУД ${data.okud || '____________'}`, PAGE_WIDTH - PAGE_MARGIN - 180, 30, { width: 180, align: 'right' })
    .text(`Код учреждения по ОКПО ${data.okpo || '____________'}`, PAGE_WIDTH - PAGE_MARGIN - 180, 40, { width: 180, align: 'right' })

  doc.font('bold').fontSize(9)
    .text('МИНИСТЕРСТВО ЗДРАВООХРАНЕНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ', PAGE_MARGIN, 60, { align: 'center', width: CONTENT_W })
  doc.font('body').fontSize(9)
    .text(data.lpuName, PAGE_MARGIN, 75, { align: 'center', width: CONTENT_W })
    .fontSize(7)
    .text('Утверждена Минздравом СССР 04.10.80 № 1030', PAGE_MARGIN, 88, { align: 'center', width: CONTENT_W })

  doc.font('bold').fontSize(12)
    .text('КАРТА ПРОФИЛАКТИЧЕСКИХ ПРИВИВОК', PAGE_MARGIN, 105, { align: 'center', width: CONTENT_W })
  doc.font('body').fontSize(9)
    .text('Форма № 063/у', PAGE_MARGIN, 122, { align: 'center', width: CONTENT_W })

  /* ——— паспорт ——— */
  let y = 145
  doc.fontSize(9)
  doc.text(`Взят на учёт: ${data.dateBegin}`, PAGE_MARGIN, y)
  y += 16
  doc.text(`1. ФИО: `, PAGE_MARGIN, y, { continued: true }).font('bold').text(data.fullName, { continued: false }).font('body')
  y += 14
  doc.text(`2. Дата рождения: `, PAGE_MARGIN, y, { continued: true }).font('bold').text(data.birthday, { continued: true }).font('body').text(`    Пол: `, { continued: true }).font('bold').text(data.sex).font('body')
  y += 14
  doc.text(`3. Адрес: `, PAGE_MARGIN, y, { continued: true }).font('bold').text(data.address || '—').font('body')
  y += 14
  doc.text(`Полис: `, PAGE_MARGIN, y, { continued: true }).font('bold').text(`${data.policySerial} ${data.policyNumber}`.trim() || '—').font('body')
  y += 20

  /* ——— разделы ——— */
  y = section(doc, y, 'ПРИВИВКИ ПРОТИВ ТУБЕРКУЛЁЗА', data.tuberculosis)
  y = section(doc, y, 'ПРИВИВКИ ПРОТИВ ПОЛИОМИЕЛИТА', data.polio)
  y = section(doc, y, 'ПРИВИВКИ ПРОТИВ ДИФТЕРИИ, КОКЛЮША, СТОЛБНЯКА', data.dtk, true)
  y = section(doc, y, 'ПРИВИВКИ ПРОТИВ ЭПИДПАРОТИТА', data.mumps)
  y = section(doc, y, 'ПРИВИВКИ ПРОТИВ КОРИ', data.measles)
  y = section(doc, y, 'ПРИВИВКИ ПРОТИВ КРАСНУХИ', data.rubella)
  y = section(doc, y, 'ПРИВИВКИ ПРОТИВ ВИРУСНОГО ГЕПАТИТА В', data.hepatitisB)
  y = otherSection(doc, y, data.other)

  /* ——— футер ——— */
  ensureRoom(doc, y, 40)
  y = doc.y < y ? y : doc.y
  doc.fontSize(8).text(`Дата снятия с учёта: ________________    Подпись: ________________`, PAGE_MARGIN, y + 10)
  doc.text(`Причина: __________________________________________________________________`, PAGE_MARGIN, y + 28)

  doc.end()
  return done
}

/* ——— вспомогательные рендеры ——— */

function ensureRoom(doc: PDFKit.PDFDocument, y: number, needed: number) {
  if (y + needed > doc.page.height - PAGE_MARGIN) {
    doc.addPage()
  }
}

function section(
  doc: PDFKit.PDFDocument,
  y: number,
  title: string,
  rows: Form063Row[],
  showVaccineCol = false,
): number {
  // минимум 3 строки места на заголовок + шапка таблицы
  ensureRoom(doc, y, 60)
  if (y + 60 > doc.page.height - PAGE_MARGIN) {
    doc.addPage(); y = PAGE_MARGIN
  }

  doc.font('bold').fontSize(9).text(title, PAGE_MARGIN, y, { width: CONTENT_W })
  y += 14

  const headers = showVaccineCol
    ? ['Этап', 'Возраст', 'Дата', 'Доза', 'Серия', 'Препарат', 'Реакция', 'Медотвод']
    : ['Этап', 'Возраст', 'Дата', 'Доза', 'Серия', 'Реакция', 'Медотвод']
  const widths = showVaccineCol
    ? [90, 55, 52, 30, 60, 85, 85, 78]
    : [110, 60, 55, 35, 70, 115, 90]

  y = drawRow(doc, y, headers, widths, true)

  if (rows.length === 0) {
    y = drawRow(doc, y, headers.map(() => '—'), widths, false, true)
  } else {
    for (const r of rows) {
      const cells = showVaccineCol
        ? [r.step, r.ageLabel, r.date, r.dose, r.series, r.vaccineName, r.reaction, r.medExemption]
        : [r.step, r.ageLabel, r.date, r.dose, r.series, r.reaction, r.medExemption]
      y = drawRow(doc, y, cells, widths, false)
    }
  }

  return y + 8
}

function otherSection(doc: PDFKit.PDFDocument, y: number, rows: Form063OtherRow[]): number {
  ensureRoom(doc, y, 60)
  if (y + 60 > doc.page.height - PAGE_MARGIN) {
    doc.addPage(); y = PAGE_MARGIN
  }

  doc.font('bold').fontSize(9).text('ПРИВИВКИ ПРОТИВ ДРУГИХ ИНФЕКЦИЙ', PAGE_MARGIN, y, { width: CONTENT_W })
  y += 14

  const headers = ['Инфекция', 'Этап', 'Возраст', 'Дата', 'Доза', 'Серия', 'Препарат', 'Реакция']
  const widths = [85, 65, 50, 52, 30, 55, 95, 103]

  y = drawRow(doc, y, headers, widths, true)

  if (rows.length === 0) {
    y = drawRow(doc, y, headers.map(() => '—'), widths, false, true)
  } else {
    for (const r of rows) {
      y = drawRow(doc, y, [
        r.diseaseName, r.step, r.ageLabel, r.date, r.dose, r.series, r.vaccineName, r.reaction,
      ], widths, false)
    }
  }

  return y + 8
}

function drawRow(
  doc: PDFKit.PDFDocument,
  y: number,
  cells: string[],
  widths: number[],
  isHeader: boolean,
  isEmpty = false,
): number {
  // высота строки: максимум по heightOfString на всех ячейках
  doc.font(isHeader ? 'bold' : 'body').fontSize(isHeader ? 7.5 : 8)
  let rowH = 16
  for (let i = 0; i < cells.length; i++) {
    const h = doc.heightOfString(cells[i] || '', { width: widths[i] - 4, align: 'left' })
    if (h + 8 > rowH) rowH = h + 8
  }

  ensureRoom(doc, y, rowH)
  if (y + rowH > doc.page.height - PAGE_MARGIN) {
    doc.addPage(); y = PAGE_MARGIN
  }

  let x = PAGE_MARGIN
  for (let i = 0; i < cells.length; i++) {
    doc.rect(x, y, widths[i], rowH).stroke()
    if (isHeader) {
      doc.fillColor('#000').text(cells[i], x + 2, y + 4, { width: widths[i] - 4, align: 'center' })
    } else if (isEmpty) {
      doc.fillColor('#999').text('—', x + 2, y + 5, { width: widths[i] - 4, align: 'center' })
    } else {
      doc.fillColor('#000').text(cells[i] || '—', x + 2, y + 4, { width: widths[i] - 4, align: 'left' })
    }
    x += widths[i]
  }
  doc.fillColor('#000')
  return y + rowH
}
