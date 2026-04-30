import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'

export type Form5Row = {
  line: string
  label: string
  count: number
}

export type Form5Data = {
  lpuName: string
  okpo?: string
  monthName: string
  year: number
  generatedAt: string
  rows: Form5Row[]
  notes?: string[]
}

const FONT = 'Times New Roman'
const CONTENT_W = 10000
const THIN = { size: 4, color: '000000', style: BorderStyle.SINGLE }
const ALL_BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN }

function run(text: string, opts: { bold?: boolean; size?: number; italics?: boolean } = {}): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: (opts.size ?? 9) * 2,
    bold: opts.bold,
    italics: opts.italics,
  })
}

function para(
  text: string | TextRun[],
  opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean; size?: number; italics?: boolean } = {},
): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: 80 },
    children: typeof text === 'string' ? [run(text, opts)] : text,
  })
}

function cell(
  text: string | Paragraph[],
  opts: {
    width?: number
    bold?: boolean
    size?: number
    align?: (typeof AlignmentType)[keyof typeof AlignmentType]
    shading?: string
  } = {},
): TableCell {
  const children = typeof text === 'string'
    ? text.split('\n').map((line) => para(line, { align: opts.align ?? AlignmentType.CENTER, bold: opts.bold, size: opts.size }))
    : text
  return new TableCell({
    children,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    borders: ALL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.shading ? { fill: opts.shading } : undefined,
    margins: { top: 45, bottom: 45, left: 70, right: 70 },
  })
}

function buildTable(rows: Form5Row[]): Table {
  const widths = [7100, 1100, 1800]
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell('Наименование', { width: widths[0], bold: true, size: 9, shading: 'F0F0F0' }),
          cell('N строки', { width: widths[1], bold: true, size: 9, shading: 'F0F0F0' }),
          cell('Число привитых', { width: widths[2], bold: true, size: 9, shading: 'F0F0F0' }),
        ],
      }),
      new TableRow({
        tableHeader: true,
        children: [
          cell('1', { width: widths[0], size: 8 }),
          cell('2', { width: widths[1], size: 8 }),
          cell('3', { width: widths[2], size: 8 }),
        ],
      }),
      ...rows.map((r) => new TableRow({
        children: [
          cell(r.label, { width: widths[0], size: 8, align: AlignmentType.LEFT }),
          cell(r.line, { width: widths[1], size: 8 }),
          cell(String(r.count), { width: widths[2], size: 8 }),
        ],
      })),
    ],
  })
}

export async function generateForm5Docx(data: Form5Data): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [
    para('ФЕДЕРАЛЬНОЕ СТАТИСТИЧЕСКОЕ НАБЛЮДЕНИЕ', { align: AlignmentType.CENTER, bold: true, size: 11 }),
    para('Форма N 5', { align: AlignmentType.CENTER, bold: true, size: 14 }),
    para('Сведения о профилактических прививках', { align: AlignmentType.CENTER, bold: true, size: 12 }),
    para(`за ${data.monthName} ${data.year} г.`, { align: AlignmentType.CENTER, bold: true, size: 11 }),
    new Paragraph({ spacing: { after: 160 }, children: [] }),
    para(`Организация: ${data.lpuName}`, { size: 9 }),
    para(`ОКПО: ${data.okpo || ''}`, { size: 8 }),
    para(`Дата формирования: ${data.generatedAt}`, { size: 8 }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
    buildTable(data.rows),
  ]

  if (data.notes?.length) {
    children.push(new Paragraph({ spacing: { after: 120 }, children: [] }))
    children.push(para('Примечания к автоматическому расчету:', { bold: true, size: 8 }))
    for (const note of data.notes) children.push(para(note, { size: 8 }))
  }

  const doc = new Document({
    creator: 'Immunova',
    title: `Форма 5 за ${data.monthName} ${data.year}`,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 18 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
            margin: { top: 700, right: 700, bottom: 700, left: 700 },
          },
        },
        children,
      },
    ],
  })

  return Packer.toBuffer(doc) as Promise<Buffer>
}
