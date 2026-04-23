import PDFDocument from 'pdfkit'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Form063Data, Form063Row, Form063OtherRow, TubeTestRow, VacRevSplit } from '../types'

const fontsDir = resolve(__dirname, '..', '..', 'fonts')
const FONT_REGULAR = readFileSync(resolve(fontsDir, 'DejaVuSans.ttf'))
const FONT_BOLD = readFileSync(resolve(fontsDir, 'DejaVuSans-Bold.ttf'))

const PAGE_W = 595.28          // A4 pts (вертикальная для шапки, ландшафт нецелесообразен из-за колонок)
const MARGIN = 30
const CONTENT_W = PAGE_W - MARGIN * 2

export function generateForm063u(data: Form063Data): Promise<Buffer> {
  const chunks: Buffer[] = []
  // Лучше ландшафт: форма 063/у из RTF — альбомная A4.
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN })
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  doc.registerFont('body', FONT_REGULAR)
  doc.registerFont('bold', FONT_BOLD)
  doc.font('body')

  renderHeader(doc, data)
  renderPassport(doc, data)
  renderTuberculosis(doc, data.tuberculosis)
  renderTubeTests(doc, data.tubeTests)
  renderPolio(doc, data.polio)
  renderDTK(doc, data.dtk)
  renderSimpleSection(doc, 'ПРИВИВКИ ПРОТИВ ПАРОТИТА', data.mumps)
  renderSimpleSection(doc, 'ПРИВИВКИ ПРОТИВ КОРИ', data.measles)
  renderSimpleSection(doc, 'ПРИВИВКИ ПРОТИВ КРАСНУХИ', data.rubella)
  renderHepatitisB(doc, data.hepatitisB)
  renderOther(doc, data.other)
  renderFooter(doc)

  doc.end()
  return done
}

/* ————— Контент-ширина ————— */

function contentW(doc: PDFKit.PDFDocument): number {
  return doc.page.width - MARGIN * 2
}

/* ————— Хэлперы для таблиц ————— */

function ensureRoom(doc: PDFKit.PDFDocument, needed: number): number {
  if (doc.y + needed > doc.page.height - MARGIN) {
    doc.addPage()
  }
  return doc.y
}

function box(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number) {
  doc.lineWidth(0.7).rect(x, y, w, h).stroke()
}

function drawCell(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number, h: number,
  text: string,
  opts: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle'; color?: string } = {},
) {
  box(doc, x, y, w, h)
  doc.font(opts.bold ? 'bold' : 'body').fontSize(opts.size ?? 8).fillColor(opts.color ?? '#000')
  const textH = doc.heightOfString(text, { width: w - 6, align: opts.align ?? 'left' })
  const ty = opts.valign === 'middle' ? y + Math.max(3, (h - textH) / 2) : y + 3
  doc.text(text, x + 3, ty, { width: w - 6, align: opts.align ?? 'left' })
  doc.fillColor('#000')
}

function rowHeight(
  doc: PDFKit.PDFDocument,
  cells: string[], widths: number[],
  size = 8, bold = false, minH = 16,
): number {
  doc.font(bold ? 'bold' : 'body').fontSize(size)
  let h = minH
  for (let i = 0; i < cells.length; i++) {
    const ch = doc.heightOfString(cells[i] || '', { width: widths[i] - 6 })
    if (ch + 6 > h) h = ch + 6
  }
  return h
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  x: number, y: number,
  widths: number[], cells: string[],
  opts: { header?: boolean; size?: number; align?: 'left' | 'center' | 'right'; valign?: 'middle' | 'top' } = {},
): number {
  const size = opts.size ?? 8
  const h = rowHeight(doc, cells, widths, size, opts.header, opts.header ? 20 : 16)
  let cx = x
  for (let i = 0; i < cells.length; i++) {
    drawCell(doc, cx, y, widths[i], h, cells[i] || '', {
      bold: opts.header,
      size,
      align: opts.align ?? (opts.header ? 'center' : 'left'),
      valign: opts.valign ?? 'middle',
    })
    cx += widths[i]
  }
  return y + h
}

/* ————— Шапка ————— */

function renderHeader(doc: PDFKit.PDFDocument, data: Form063Data) {
  const W = contentW(doc)
  let y = MARGIN

  // ОКУД/ОКПО — справа
  const codeW = 260
  const codeX = MARGIN + W - codeW
  const codeH = 14
  drawCell(doc, codeX, y, codeW, codeH, `КОД ФОРМЫ ПО ОКУД ${data.okud || '____________'}`, { size: 8, align: 'left', valign: 'middle' })
  drawCell(doc, codeX, y + codeH, codeW, codeH, `КОД УЧРЕЖД. ПО ОКПО  ${data.okpo || '____________'}`, { size: 8, align: 'left', valign: 'middle', bold: !!data.okpo })
  y += codeH * 2 + 4

  // Двухколоночная шапка: учреждение / форма
  const leftW = W / 2
  const rightW = W - leftW
  const boxH = 46

  box(doc, MARGIN, y, leftW, boxH)
  doc.font('body').fontSize(9).fillColor('#000')
  doc.text('МИНИСТЕРСТВО ЗДРАВООХРАНЕНИЯ', MARGIN + 6, y + 4, { width: leftW - 12 })
  doc.fontSize(7.5).text('наименование учреждения', MARGIN + 6, y + 18, { width: leftW - 12 })
  doc.font('bold').fontSize(9).text(data.lpuName, MARGIN + 6, y + 28, { width: leftW - 12 })

  box(doc, MARGIN + leftW, y, rightW, boxH)
  doc.font('body').fontSize(9).text('МЕДИЦИНСКАЯ ДОКУМЕНТАЦИЯ', MARGIN + leftW + 6, y + 4, { width: rightW - 12 })
  doc.text('Форма 063/у', MARGIN + leftW + 6, y + 18, { width: rightW - 12 })
  doc.text('Утверждена Минздравом СССР 04.10.80 № 1030', MARGIN + leftW + 6, y + 30, { width: rightW - 12 })

  y += boxH
  // Центральный заголовок
  const titleH = 22
  box(doc, MARGIN, y, W, titleH)
  doc.font('bold').fontSize(12)
    .text('К А Р Т А   профилактических прививок', MARGIN, y + 5, { width: W, align: 'center' })
  y += titleH

  // «Взят на учёт … | Для организованных детей …»
  const onBoardH = 28
  box(doc, MARGIN, y, leftW, onBoardH)
  doc.font('body').fontSize(9)
    .text('Взят на учёт ', MARGIN + 6, y + 5, { continued: true })
    .font('bold').text(data.dateBegin || '__________', { continued: false })
  doc.font('body').fontSize(7).fillColor('#666')
    .text('дата', MARGIN + 60, y + 18)
    .fillColor('#000')

  box(doc, MARGIN + leftW, y, rightW, onBoardH)
  doc.font('body').fontSize(9)
    .text('Для организованных детей наименование детского учреждения', MARGIN + leftW + 6, y + 5, { width: rightW - 12 })
  y += onBoardH

  doc.y = y + 4
}

/* ————— Паспортная часть ————— */

function renderPassport(doc: PDFKit.PDFDocument, data: Form063Data) {
  const W = contentW(doc)
  let y = doc.y

  const lineH = 18
  // 1. ФИО + 2. ДР
  box(doc, MARGIN, y, W, lineH)
  doc.font('body').fontSize(9)
    .text('1. Фамилия, имя, отчество ', MARGIN + 6, y + 4, { continued: true })
    .font('bold').text(data.fullName || '________________________', { continued: true })
    .font('body').text('     2. Дата рождения ', { continued: true })
    .font('bold').text(data.birthday || '__________', { continued: true })
    .font('body').text(`   Пол: ${data.sex}`, { continued: false })
  y += lineH

  // 3. Адрес
  box(doc, MARGIN, y, W, lineH)
  doc.font('body').fontSize(9)
    .text('3. Домашний адрес: ', MARGIN + 6, y + 4, { continued: true })
    .font('bold').text(data.address || '__________________________________________________', { continued: false })
  y += lineH

  // Полис + Отметка о перемене адреса
  box(doc, MARGIN, y, W, lineH)
  doc.font('body').fontSize(9)
    .text('Полис: ', MARGIN + 6, y + 4, { continued: true })
    .font('bold').text(`${data.policySerial} ${data.policyNumber}`.trim() || '—', { continued: true })
    .font('body').text('     Отметка о перемене адреса: ______________________________________', { continued: false })
  y += lineH + 6

  doc.y = y
}

/* ————— Раздел: Туберкулёз (Вакцинация / Ревакцинация) ————— */

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  const W = contentW(doc)
  ensureRoom(doc, 40)
  const y = doc.y
  box(doc, MARGIN, y, W, 16)
  doc.font('bold').fontSize(10).fillColor('#000')
    .text(title, MARGIN, y + 3, { width: W, align: 'center' })
  doc.y = y + 16
}

function renderTuberculosis(doc: PDFKit.PDFDocument, t: VacRevSplit) {
  sectionTitle(doc, 'ПРИВИВКИ ПРОТИВ ТУБЕРКУЛЁЗА')
  const W = contentW(doc)
  // Колонки: Этап, Возраст, Дата, Доза, Серия, Реакция, Медотвод
  const widths = normalize([110, 70, 70, 55, 90, 180, 180], W)

  const headers = ['', 'Возраст', 'Дата', 'Доза', 'Серия', 'Реакция на прививку', 'Медицинский отвод (дата, причина)']
  let y = drawTableRow(doc, MARGIN, doc.y, widths, headers, { header: true, size: 8 })

  y = renderVacRevBlock(doc, y, widths, 'Вакцинация', t.vaccination)
  y = renderVacRevBlock(doc, y, widths, 'Ревакцинация', t.revaccination)
  doc.y = y + 4
}

function renderVacRevBlock(
  doc: PDFKit.PDFDocument,
  y: number,
  widths: number[],
  label: string,
  rows: Form063Row[],
): number {
  if (rows.length === 0) {
    // одна пустая строка с меткой
    const cells = [label, '', '', '', '', '', '']
    return drawTableRow(doc, MARGIN, y, widths, cells, { align: 'left', size: 8 })
  }
  // первая строка с меткой слева и данными первой записи
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const cells = [
      i === 0 ? label : r.step,
      r.ageLabel, r.date, r.dose, r.series, r.reaction, r.medExemption,
    ]
    y = drawTableRow(doc, MARGIN, y, widths, cells, { align: 'left', size: 8 })
  }
  return y
}

/* ————— Туберкулиновые пробы ————— */

function renderTubeTests(doc: PDFKit.PDFDocument, rows: TubeTestRow[]) {
  sectionTitle(doc, 'ТУБЕРКУЛИНОВЫЕ ПРОБЫ')
  const W = contentW(doc)
  // 4 пары «Дата | Результат»
  const pair = W / 4
  const colDate = pair * 0.4
  const colRes = pair - colDate
  const widths = [colDate, colRes, colDate, colRes, colDate, colRes, colDate, colRes]
  const hdr = ['Дата', 'Результат', 'Дата', 'Результат', 'Дата', 'Результат', 'Дата', 'Результат']
  let y = drawTableRow(doc, MARGIN, doc.y, widths, hdr, { header: true, size: 8 })

  // заполняем по 4 строки на колонку = 4 записи на ряд
  const rowsPerBlock = Math.max(4, Math.ceil(rows.length / 4))
  for (let i = 0; i < rowsPerBlock; i++) {
    const cells = [
      rows[i]?.date ?? '', rows[i]?.result ?? '',
      rows[i + rowsPerBlock]?.date ?? '', rows[i + rowsPerBlock]?.result ?? '',
      rows[i + rowsPerBlock * 2]?.date ?? '', rows[i + rowsPerBlock * 2]?.result ?? '',
      rows[i + rowsPerBlock * 3]?.date ?? '', rows[i + rowsPerBlock * 3]?.result ?? '',
    ]
    y = drawTableRow(doc, MARGIN, y, widths, cells, { align: 'left', size: 8 })
  }
  doc.y = y + 4
}

/* ————— Полиомиелит: 2×4 колонки ————— */

function renderPolio(doc: PDFKit.PDFDocument, rows: Form063Row[]) {
  sectionTitle(doc, 'ПРИВИВКИ ПРОТИВ ПОЛИОМИЕЛИТА')
  const W = contentW(doc)
  const halfW = W / 2
  // каждая половина: Прививка, Возраст, Дата, Серия
  const halfWidths = normalize([140, 70, 70, 100], halfW)
  const widths = [...halfWidths, ...halfWidths]
  const hdr = ['Прививка', 'Возраст', 'Дата', 'Серия', 'Прививка', 'Возраст', 'Дата', 'Серия']
  let y = drawTableRow(doc, MARGIN, doc.y, widths, hdr, { header: true })

  // Разбиваем rows на 2 колонки
  const perCol = Math.max(3, Math.ceil(rows.length / 2))
  for (let i = 0; i < perCol; i++) {
    const L = rows[i]
    const R = rows[i + perCol]
    const cells = [
      L?.step ?? '', L?.ageLabel ?? '', L?.date ?? '', L?.series ?? '',
      R?.step ?? '', R?.ageLabel ?? '', R?.date ?? '', R?.series ?? '',
    ]
    y = drawTableRow(doc, MARGIN, y, widths, cells, { align: 'left' })
  }
  doc.y = y + 4
}

/* ————— ДКС: с препаратом + звёздочка ————— */

function renderDTK(doc: PDFKit.PDFDocument, t: VacRevSplit) {
  sectionTitle(doc, 'ПРИВИВКИ ПРОТИВ ДИФТЕРИИ, КОКЛЮША, СТОЛБНЯКА *')
  const W = contentW(doc)
  const widths = normalize([90, 55, 55, 40, 80, 120, 140, 175], W)
  const hdr = ['', 'Возраст', 'Дата', 'Доза', 'Серия', 'Наименование препарата', 'Реакция на прививку', 'Медицинский отвод (дата, причины)']
  let y = drawTableRow(doc, MARGIN, doc.y, widths, hdr, { header: true })

  const renderBlock = (label: string, rows: Form063Row[]) => {
    if (rows.length === 0) {
      const cells = [label, '', '', '', '', '', '', '']
      y = drawTableRow(doc, MARGIN, y, widths, cells, { align: 'left' })
      return
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const cells = [
        i === 0 ? label : r.step,
        r.ageLabel, r.date, r.dose, r.series, r.vaccineName, r.reaction, r.medExemption,
      ]
      y = drawTableRow(doc, MARGIN, y, widths, cells, { align: 'left' })
    }
  }
  renderBlock('Вакцинация', t.vaccination)
  renderBlock('Ревакцинация', t.revaccination)

  // footnote
  doc.y = y + 4
  ensureRoom(doc, 40)
  doc.font('body').fontSize(7.5).fillColor('#000')
    .text(
      '* Препарат обозначать буквами: АКДС — адсорбированная коклюшно-дифтерийно-столбнячная вакцина, ' +
      'АДС — адсорбированный дифтерийно-столбнячный анатоксин, АДС-М — адсорбированный дифтерийно-столбнячный ' +
      'анатоксин с уменьшенным содержанием антигенов, АД — адсорбированный дифтерийный анатоксин, ' +
      'АС — адсорбированный столбнячный анатоксин, К — коклюшная вакцина.',
      MARGIN, doc.y, { width: W, align: 'left' },
    )
  doc.y += 4
}

/* ————— Паротит / Корь / Краснуха — единая вёрстка ————— */

function renderSimpleSection(doc: PDFKit.PDFDocument, title: string, rows: Form063Row[]) {
  sectionTitle(doc, title)
  const W = contentW(doc)
  const widths = normalize([140, 70, 70, 50, 90, 180, 155], W)
  const hdr = ['Наименование прививки', 'Возраст', 'Дата', 'Доза', 'Серия', 'Реакция на прививку', 'Медицинский отвод (дата, причины)']
  let y = drawTableRow(doc, MARGIN, doc.y, widths, hdr, { header: true })

  const toDraw = rows.length ? rows : []
  if (toDraw.length === 0) {
    y = drawTableRow(doc, MARGIN, y, widths, ['', '', '', '', '', '', ''], { align: 'left' })
  } else {
    for (const r of toDraw) {
      const cells = [r.step, r.ageLabel, r.date, r.dose, r.series, r.reaction, r.medExemption]
      y = drawTableRow(doc, MARGIN, y, widths, cells, { align: 'left' })
    }
  }
  doc.y = y + 4
}

/* ————— Гепатит B — с препаратом ————— */

function renderHepatitisB(doc: PDFKit.PDFDocument, rows: Form063Row[]) {
  sectionTitle(doc, 'ПРИВИВКИ ПРОТИВ ВИРУСНОГО ГЕПАТИТА B')
  const W = contentW(doc)
  const widths = normalize([120, 60, 60, 50, 80, 140, 140, 105], W)
  const hdr = ['Наименование прививки', 'Возраст', 'Дата', 'Доза', 'Серия', 'Наименование препарата', 'Реакция на прививку', 'Медицинский отвод']
  let y = drawTableRow(doc, MARGIN, doc.y, widths, hdr, { header: true })

  if (rows.length === 0) {
    y = drawTableRow(doc, MARGIN, y, widths, ['', '', '', '', '', '', '', ''], { align: 'left' })
  } else {
    for (const r of rows) {
      y = drawTableRow(doc, MARGIN, y, widths,
        [r.step, r.ageLabel, r.date, r.dose, r.series, r.vaccineName, r.reaction, r.medExemption],
        { align: 'left' })
    }
  }
  doc.y = y + 4
}

/* ————— Другие инфекции ————— */

function renderOther(doc: PDFKit.PDFDocument, rows: Form063OtherRow[]) {
  sectionTitle(doc, 'ПРИВИВКИ ПРОТИВ ДРУГИХ ИНФЕКЦИЙ')
  const W = contentW(doc)
  const widths = normalize([110, 100, 60, 60, 50, 80, 140, 155], W)
  const hdr = ['Наименование инфекции', 'Наименование прививки', 'Возраст', 'Дата', 'Доза', 'Серия', 'Наименование препарата', 'Реакция на прививку']
  let y = drawTableRow(doc, MARGIN, doc.y, widths, hdr, { header: true })

  if (rows.length === 0) {
    y = drawTableRow(doc, MARGIN, y, widths, ['', '', '', '', '', '', '', ''], { align: 'left' })
  } else {
    for (const r of rows) {
      y = drawTableRow(doc, MARGIN, y, widths,
        [r.diseaseName, r.step, r.ageLabel, r.date, r.dose, r.series, r.vaccineName, r.reaction],
        { align: 'left' })
    }
  }
  doc.y = y + 4
}

/* ————— Подвал ————— */

function renderFooter(doc: PDFKit.PDFDocument) {
  const W = contentW(doc)
  ensureRoom(doc, 70)
  const y = doc.y
  doc.font('body').fontSize(9).fillColor('#000')
    .text('Дата снятия с учёта ________________', MARGIN, y + 6, { continued: true })
    .text('                    Подпись ______________________________________', { continued: false })
  doc.text('Причина ' + '_'.repeat(80), MARGIN, y + 22)
  doc.y = y + 42

  doc.font('body').fontSize(8.5).text(
    '    Карта заполняется в детском лечебно-профилактическом учреждении (ФАП) при взятии ребёнка на учёт. ' +
    'В случае переезда ребёнка из города (района) на руки выдаётся справка о проведённых прививках. ' +
    'Карта остаётся в учреждении.',
    MARGIN, doc.y, { width: W },
  )
}

/* ————— Утилита: перенормировка ширин колонок под фактическую content-width ————— */

function normalize(widths: number[], total: number): number[] {
  const sum = widths.reduce((a, b) => a + b, 0)
  const k = total / sum
  return widths.map((w) => w * k)
}
