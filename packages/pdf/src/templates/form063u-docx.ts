import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  LevelFormat,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  convertInchesToTwip,
} from 'docx'
import type { Form063Data, Form063Row, Form063OtherRow, TubeTestRow, VacRevSplit } from '../types'

// A4 портретная: 11906 × 16838 DXA. Поля 720 DXA (0.5"). Content-width ≈ 10466.
const CONTENT_W = 10466
const FONT = 'Times New Roman'

const THIN = { size: 4, color: '000000', style: BorderStyle.SINGLE }
const ALL_BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN }

/* ——— примитивы ——— */

function run(text: string, opts: { bold?: boolean; size?: number; italics?: boolean } = {}): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: (opts.size ?? 10) * 2, // half-points
    bold: opts.bold,
    italics: opts.italics,
  })
}

function para(
  children: TextRun[] | string,
  opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacing?: { before?: number; after?: number }; bold?: boolean; size?: number } = {},
): Paragraph {
  const runs = typeof children === 'string' ? [run(children, { bold: opts.bold, size: opts.size })] : children
  return new Paragraph({
    alignment: opts.align,
    spacing: opts.spacing ?? { after: 0 },
    children: runs,
  })
}

function cell(
  children: Paragraph[] | string,
  opts: { width?: number; bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; shading?: string; rowSpan?: number; columnSpan?: number; size?: number } = {},
): TableCell {
  const paras = typeof children === 'string'
    ? [para([run(children, { bold: opts.bold, size: opts.size })], { align: opts.align })]
    : children
  return new TableCell({
    children: paras,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    rowSpan: opts.rowSpan,
    columnSpan: opts.columnSpan,
    shading: opts.shading ? { fill: opts.shading } : undefined,
    borders: ALL_BORDERS,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
  })
}

function headerRow(headers: string[], widths: number[]): TableRow {
  return new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      cell(h, { width: widths[i], bold: true, align: AlignmentType.CENTER, shading: 'F2F2F2', size: 8 }),
    ),
  })
}

function dataRow(values: string[], widths: number[], firstBold = false): TableRow {
  return new TableRow({
    children: values.map((v, i) =>
      cell(v || '', { width: widths[i], align: AlignmentType.LEFT, size: 8, bold: i === 0 && firstBold }),
    ),
  })
}

function emptyRow(count: number, widths: number[], label?: string): TableRow {
  const cells: TableCell[] = []
  for (let i = 0; i < count; i++) {
    cells.push(cell(i === 0 && label ? label : '', {
      width: widths[i], size: 8, bold: i === 0 && !!label, align: AlignmentType.LEFT,
    }))
  }
  return new TableRow({ children: cells })
}

function table(rows: TableRow[]): Table {
  return new Table({
    rows,
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: undefined,
  })
}

function norm(widths: number[], total: number): number[] {
  const sum = widths.reduce((a, b) => a + b, 0)
  const k = total / sum
  return widths.map((w) => Math.round(w * k))
}

function gap(size = 4): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: '', size })],
    spacing: { after: size * 10 },
  })
}

/* ——— шапка ——— */

function buildHeader(data: Form063Data): (Paragraph | Table)[] {
  const items: (Paragraph | Table)[] = []

  // Блок ОКУД/ОКПО справа
  const codeW = 4500
  const spacer = CONTENT_W - codeW
  items.push(
    new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: spacer, type: WidthType.DXA },
              borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
              children: [para('')],
            }),
            new TableCell({
              width: { size: codeW, type: WidthType.DXA },
              borders: ALL_BORDERS,
              children: [
                para([run(`КОД ФОРМЫ ПО ОКУД  ${data.okud || '__________'}`, { size: 9 })]),
                para([run(`КОД УЧРЕЖД. ПО ОКПО  `, { size: 9 }), run(data.okpo || '__________', { size: 9, bold: !!data.okpo })]),
              ],
            }),
          ],
        }),
      ],
      width: { size: CONTENT_W, type: WidthType.DXA },
    }),
  )
  items.push(gap(2))

  // Двухколоночная шапка Минздрав / Мед.документация
  const halfW = Math.round(CONTENT_W / 2)
  items.push(
    new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: halfW, type: WidthType.DXA },
              borders: ALL_BORDERS,
              children: [
                para([run('МИНИСТЕРСТВО ЗДРАВООХРАНЕНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ', { size: 9 })]),
                para([run('наименование учреждения', { size: 8, italics: true })]),
                para([run(data.lpuName, { size: 10, bold: true })]),
              ],
            }),
            new TableCell({
              width: { size: halfW, type: WidthType.DXA },
              borders: ALL_BORDERS,
              children: [
                para([run('МЕДИЦИНСКАЯ ДОКУМЕНТАЦИЯ', { size: 9 })]),
                para([run('Форма 063/у', { size: 10, bold: true })]),
                para([run('Утверждена Минздравом СССР 04.10.80 № 1030', { size: 8 })]),
              ],
            }),
          ],
        }),
      ],
      width: { size: CONTENT_W, type: WidthType.DXA },
    }),
  )
  items.push(gap(2))

  // Заголовок — большой, центрированный, с разрядкой
  items.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 100 },
      children: [
        new TextRun({ text: 'К А Р Т А   профилактических прививок', font: FONT, size: 26, bold: true }),
      ],
    }),
  )

  // Взят на учёт | Для организованных детей
  items.push(
    new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: halfW, type: WidthType.DXA },
              borders: ALL_BORDERS,
              children: [
                para([run('Взят на учёт  ', { size: 10 }), run(data.dateBegin || '__________', { size: 10, bold: true })]),
                para([run('дата', { size: 8, italics: true })]),
              ],
            }),
            new TableCell({
              width: { size: halfW, type: WidthType.DXA },
              borders: ALL_BORDERS,
              children: [para([run('Для организованных детей наименование детского учреждения', { size: 10 })])],
            }),
          ],
        }),
      ],
      width: { size: CONTENT_W, type: WidthType.DXA },
    }),
  )
  items.push(gap(2))

  // Паспорт
  items.push(
    para([
      run('1. Фамилия, имя, отчество  ', { size: 10 }),
      run(data.fullName || '__________________________________', { size: 10, bold: true }),
      run('        2. Дата рождения  ', { size: 10 }),
      run(data.birthday || '__________', { size: 10, bold: true }),
      run('    Пол: ', { size: 10 }),
      run(data.sex, { size: 10, bold: true }),
    ]),
    para([
      run('3. Домашний адрес:  ', { size: 10 }),
      run(data.address || '________________________________________________________________', { size: 10, bold: true }),
    ]),
    para([
      run('Полис:  ', { size: 10 }),
      run(`${data.policySerial} ${data.policyNumber}`.trim() || '—', { size: 10, bold: true }),
      run('        Отметка о перемене адреса:  ________________________________________', { size: 10 }),
    ]),
  )
  items.push(gap(4))

  return items
}

/* ——— разделы ——— */

function sectionHeading(title: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 80 },
    children: [new TextRun({ text: title, font: FONT, size: 22, bold: true })],
  })
}

function tuberculosis(t: VacRevSplit): (Paragraph | Table)[] {
  const widths = norm([1400, 900, 900, 700, 1100, 2000, 2100], CONTENT_W)
  const headers = ['', 'Возраст', 'Дата', 'Доза', 'Серия', 'Реакция на прививку', 'Медицинский отвод (дата, причина)']
  const rows: TableRow[] = [headerRow(headers, widths)]
  rows.push(...vacRevRows('Вакцинация', t.vaccination, widths, false))
  rows.push(...vacRevRows('Ревакцинация', t.revaccination, widths, false))
  return [sectionHeading('ПРИВИВКИ ПРОТИВ ТУБЕРКУЛЁЗА'), table(rows)]
}

function vacRevRows(
  label: string, rows: Form063Row[], widths: number[], hasVaccineCol: boolean,
): TableRow[] {
  if (rows.length === 0) {
    return [emptyRow(widths.length, widths, label)]
  }
  return rows.map((r, i) => {
    const first = i === 0 ? label : r.step
    const cells = hasVaccineCol
      ? [first, r.ageLabel, r.date, r.dose, r.series, r.vaccineName, r.reaction, r.medExemption]
      : [first, r.ageLabel, r.date, r.dose, r.series, r.reaction, r.medExemption]
    return dataRow(cells, widths, true)
  })
}

function tubeTests(rows: TubeTestRow[]): (Paragraph | Table)[] {
  const pair = Math.round(CONTENT_W / 4)
  const cDate = Math.round(pair * 0.45)
  const cRes = pair - cDate
  const widths = [cDate, cRes, cDate, cRes, cDate, cRes, cDate, cRes]
  const headers = ['Дата', 'Результат', 'Дата', 'Результат', 'Дата', 'Результат', 'Дата', 'Результат']
  const trows: TableRow[] = [headerRow(headers, widths)]
  const perBlock = Math.max(3, Math.ceil(rows.length / 4))
  for (let i = 0; i < perBlock; i++) {
    trows.push(new TableRow({
      children: [
        rows[i]?.date ?? '', rows[i]?.result ?? '',
        rows[i + perBlock]?.date ?? '', rows[i + perBlock]?.result ?? '',
        rows[i + perBlock * 2]?.date ?? '', rows[i + perBlock * 2]?.result ?? '',
        rows[i + perBlock * 3]?.date ?? '', rows[i + perBlock * 3]?.result ?? '',
      ].map((v, idx) => cell(v, { width: widths[idx], size: 8 })),
    }))
  }
  return [sectionHeading('ТУБЕРКУЛИНОВЫЕ ПРОБЫ'), table(trows)]
}

function polio(rows: Form063Row[]): (Paragraph | Table)[] {
  // 2×4 (левая и правая половины)
  const halfW = Math.round(CONTENT_W / 2)
  const halfWidths = norm([1600, 800, 900, 1100], halfW)
  const widths = [...halfWidths, ...halfWidths]
  const headers = ['Прививка', 'Возраст', 'Дата', 'Серия', 'Прививка', 'Возраст', 'Дата', 'Серия']
  const trows: TableRow[] = [headerRow(headers, widths)]
  const perCol = Math.max(3, Math.ceil(rows.length / 2))
  for (let i = 0; i < perCol; i++) {
    const L = rows[i]
    const R = rows[i + perCol]
    trows.push(new TableRow({
      children: [
        L?.step ?? '', L?.ageLabel ?? '', L?.date ?? '', L?.series ?? '',
        R?.step ?? '', R?.ageLabel ?? '', R?.date ?? '', R?.series ?? '',
      ].map((v, idx) => cell(v, { width: widths[idx], size: 8 })),
    }))
  }
  return [sectionHeading('ПРИВИВКИ ПРОТИВ ПОЛИОМИЕЛИТА'), table(trows)]
}

function dtk(t: VacRevSplit): (Paragraph | Table)[] {
  const widths = norm([1100, 700, 800, 500, 1000, 1800, 1700, 2000], CONTENT_W)
  const headers = ['', 'Возраст', 'Дата', 'Доза', 'Серия', 'Наименование препарата', 'Реакция на прививку', 'Медицинский отвод (дата, причины)']
  const trows: TableRow[] = [headerRow(headers, widths)]
  trows.push(...vacRevRows('Вакцинация', t.vaccination, widths, true))
  trows.push(...vacRevRows('Ревакцинация', t.revaccination, widths, true))
  return [
    sectionHeading('ПРИВИВКИ ПРОТИВ ДИФТЕРИИ, КОКЛЮША, СТОЛБНЯКА *'),
    table(trows),
    new Paragraph({
      spacing: { before: 80 },
      children: [new TextRun({
        text: '* Препарат обозначать буквами: АКДС — адсорбированная коклюшно-дифтерийно-столбнячная вакцина; ' +
          'АДС — адсорбированный дифтерийно-столбнячный анатоксин; АДС-М — адсорбированный дифтерийно-столбнячный ' +
          'анатоксин с уменьшенным содержанием антигенов; АД — адсорбированный дифтерийный анатоксин; ' +
          'АС — адсорбированный столбнячный анатоксин; К — коклюшная вакцина.',
        font: FONT, size: 17,
      })],
    }),
  ]
}

function simpleSection(title: string, rows: Form063Row[]): (Paragraph | Table)[] {
  const widths = norm([1800, 800, 900, 600, 1200, 2100, 1900], CONTENT_W)
  const headers = ['Наименование прививки', 'Возраст', 'Дата', 'Доза', 'Серия', 'Реакция на прививку', 'Медицинский отвод (дата, причины)']
  const trows: TableRow[] = [headerRow(headers, widths)]
  if (rows.length === 0) {
    trows.push(emptyRow(widths.length, widths))
  } else {
    for (const r of rows) {
      trows.push(dataRow([r.step, r.ageLabel, r.date, r.dose, r.series, r.reaction, r.medExemption], widths))
    }
  }
  return [sectionHeading(title), table(trows)]
}

function hepatitisB(rows: Form063Row[]): (Paragraph | Table)[] {
  const widths = norm([1500, 700, 800, 500, 1000, 1800, 1700, 1400], CONTENT_W)
  const headers = ['Наименование прививки', 'Возраст', 'Дата', 'Доза', 'Серия', 'Наименование препарата', 'Реакция на прививку', 'Медицинский отвод']
  const trows: TableRow[] = [headerRow(headers, widths)]
  if (rows.length === 0) {
    trows.push(emptyRow(widths.length, widths))
  } else {
    for (const r of rows) {
      trows.push(dataRow([r.step, r.ageLabel, r.date, r.dose, r.series, r.vaccineName, r.reaction, r.medExemption], widths))
    }
  }
  return [sectionHeading('ПРИВИВКИ ПРОТИВ ВИРУСНОГО ГЕПАТИТА B'), table(trows)]
}

function other(rows: Form063OtherRow[]): (Paragraph | Table)[] {
  const widths = norm([1400, 1300, 700, 800, 500, 1000, 1800, 2100], CONTENT_W)
  const headers = ['Наименование инфекции', 'Наименование прививки', 'Возраст', 'Дата', 'Доза', 'Серия', 'Наименование препарата', 'Реакция на прививку']
  const trows: TableRow[] = [headerRow(headers, widths)]
  if (rows.length === 0) {
    trows.push(emptyRow(widths.length, widths))
  } else {
    for (const r of rows) {
      trows.push(dataRow([r.diseaseName, r.step, r.ageLabel, r.date, r.dose, r.series, r.vaccineName, r.reaction], widths))
    }
  }
  return [sectionHeading('ПРИВИВКИ ПРОТИВ ДРУГИХ ИНФЕКЦИЙ'), table(trows)]
}

/* ——— подвал ——— */

function footer(): Paragraph[] {
  return [
    new Paragraph({ spacing: { before: 240 }, children: [] }),
    para([
      run('Дата снятия с учёта  ________________', { size: 10 }),
      run('        Подпись  ______________________________________', { size: 10 }),
    ]),
    para([run('Причина  ' + '_'.repeat(80), { size: 10 })]),
    new Paragraph({ spacing: { before: 160 }, children: [] }),
    para([run(
      '    Карта заполняется в детском лечебно-профилактическом учреждении (ФАП) при взятии ребёнка на учёт. ' +
      'В случае переезда ребёнка из города (района) на руки выдаётся справка о проведённых прививках. ' +
      'Карта остаётся в учреждении.',
      { size: 9 },
    )]),
  ]
}

/* ——— сборка документа ——— */

export async function generateForm063uDocx(data: Form063Data): Promise<Buffer> {
  const doc = new Document({
    creator: 'VacciTrack',
    title: `Форма 063/у — ${data.fullName}`,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 20 },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: 'passport',
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
            margin: {
              top: convertInchesToTwip(0.5),
              right: convertInchesToTwip(0.5),
              bottom: convertInchesToTwip(0.5),
              left: convertInchesToTwip(0.5),
            },
          },
        },
        children: [
          ...buildHeader(data),
          ...tuberculosis(data.tuberculosis),
          ...tubeTests(data.tubeTests),
          ...polio(data.polio),
          ...dtk(data.dtk),
          ...simpleSection('ПРИВИВКИ ПРОТИВ ПАРОТИТА', data.mumps),
          ...simpleSection('ПРИВИВКИ ПРОТИВ КОРИ', data.measles),
          ...simpleSection('ПРИВИВКИ ПРОТИВ КРАСНУХИ', data.rubella),
          ...hepatitisB(data.hepatitisB),
          ...other(data.other),
          ...footer(),
        ],
      },
    ],
  })

  // Packer.toBuffer возвращает Buffer (Uint8Array совместимый).
  return Packer.toBuffer(doc) as Promise<Buffer>
}
// unused import guards
void HeightRule
